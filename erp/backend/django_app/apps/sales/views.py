from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.services.resolver import get_default_branch, get_default_company, get_default_warehouse
from apps.rbac.services.permissions import user_has_permission
from apps.sales.models import Customer, DeliveryNote, PosSale, PosTerminal, SalesOrder
from apps.sales.serializers import (
    CustomerCreateSerializer,
    CustomerSerializer,
    DeliveryCreateFromSoSerializer,
    DeliveryPostSerializer,
    DeliverySerializer,
    PosSaleCreateSerializer,
    PosSalePostSerializer,
    PosSaleSerializer,
    PosTerminalCreateSerializer,
    PosTerminalSerializer,
    SalesOrderCreateSerializer,
    SalesOrderSerializer,
)
from apps.sales.services.sales import (
    SalesError,
    confirm_sales_order,
    create_delivery_from_so,
    create_pos_sale,
    create_sales_order,
    post_delivery,
    post_pos_sale,
    publish_customer_to_sync,
)
from apps.tenancy.services.resolver import TenancyError, resolve_tenant_for_user, set_request_tenant


def _resolve_tenant(request):
    tenant_id = request.META.get("HTTP_X_TENANT_ID")
    tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
    tenant = resolve_tenant_for_user(user=request.user, tenant_id=tenant_id, tenant_slug=tenant_slug)
    set_request_tenant(request, tenant)
    return tenant


def _require_perm(request, code: str):
    if not user_has_permission(request.user, code):
        return Response(
            {"success": False, "error": {"code": "PERMISSION_DENIED", "message": f"Missing permission: {code}"}},
            status=403,
        )
    return None


class CustomerListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "sales.customer.read")
        if denied:
            return denied
        qs = Customer.objects.filter(tenant=tenant, is_active=True).order_by("code")
        search = (request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        return Response({"success": True, "customers": CustomerSerializer(qs[:200], many=True).data})

    def post(self, request):
        serializer = CustomerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "sales.customer.create")
        if denied:
            return denied
        data = serializer.validated_data
        if Customer.objects.filter(tenant=tenant, code=data["code"]).exists():
            return Response({"success": False, "error": {"code": "CODE_EXISTS", "message": "Customer code already exists."}}, status=409)
        customer = Customer.objects.create(tenant=tenant, **data)
        publish_customer_to_sync(customer)
        return Response({"success": True, "customer": CustomerSerializer(customer).data}, status=201)


class SalesOrderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "sales.so.read")
        if denied:
            return denied
        qs = SalesOrder.objects.filter(tenant=tenant).select_related("customer", "warehouse").prefetch_related("lines__item").order_by("-created_at")
        return Response({"success": True, "sales_orders": SalesOrderSerializer(qs[:100], many=True).data})

    def post(self, request):
        serializer = SalesOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "sales.so.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            so = create_sales_order(
                tenant=tenant,
                customer_id=data["customer_id"],
                lines=data["lines"],
                actor_id=request.user.id,
                remarks=data.get("remarks", ""),
                warehouse_id=str(data["warehouse_id"]) if data.get("warehouse_id") else None,
            )
        except SalesError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        so = SalesOrder.objects.filter(id=so.id).select_related("customer", "warehouse").prefetch_related("lines__item").first()
        return Response({"success": True, "sales_order": SalesOrderSerializer(so).data}, status=201)


class SalesOrderConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, so_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "sales.so.confirm")
        if denied:
            return denied
        try:
            so = confirm_sales_order(tenant=tenant, so_id=so_id)
        except SalesError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        so = SalesOrder.objects.filter(id=so.id).select_related("customer", "warehouse").prefetch_related("lines__item").first()
        return Response({"success": True, "sales_order": SalesOrderSerializer(so).data})


class DeliveryListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "sales.delivery.read")
        if denied:
            return denied
        qs = DeliveryNote.objects.filter(tenant=tenant).select_related("customer", "sales_order").prefetch_related("lines__item").order_by("-created_at")
        return Response({"success": True, "deliveries": DeliverySerializer(qs[:100], many=True).data})


class DeliveryCreateFromSoView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeliveryCreateFromSoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "sales.delivery.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            delivery = create_delivery_from_so(tenant=tenant, so_id=data["so_id"], lines=data.get("lines"), remarks=data.get("remarks", ""))
        except SalesError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        delivery = DeliveryNote.objects.filter(id=delivery.id).select_related("customer", "sales_order").prefetch_related("lines__item").first()
        return Response({"success": True, "delivery": DeliverySerializer(delivery).data}, status=201)


class DeliveryPostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, delivery_id):
        serializer = DeliveryPostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "sales.delivery.post")
        if denied:
            return denied
        try:
            result = post_delivery(tenant=tenant, delivery_id=delivery_id, idempotency_key=serializer.validated_data["idempotency_key"], actor_id=request.user.id)
        except SalesError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "result": result})


class PosTerminalListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "pos.terminal.read")
        if denied:
            return denied
        qs = PosTerminal.objects.filter(tenant=tenant, is_active=True).select_related("branch", "warehouse")
        return Response({"success": True, "terminals": PosTerminalSerializer(qs, many=True).data})

    def post(self, request):
        serializer = PosTerminalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "pos.terminal.create")
        if denied:
            return denied
        data = serializer.validated_data
        company = get_default_company(tenant)
        branch = get_default_branch(company)
        if data.get("warehouse_id"):
            from apps.tenancy.models import Warehouse

            warehouse = Warehouse.objects.filter(id=data["warehouse_id"], branch__company__tenant=tenant).first()
            if not warehouse:
                return Response({"success": False, "error": {"code": "WAREHOUSE_NOT_FOUND", "message": "Warehouse not found."}}, status=404)
        else:
            warehouse = get_default_warehouse(branch)
        if PosTerminal.objects.filter(tenant=tenant, code=data["code"]).exists():
            return Response({"success": False, "error": {"code": "CODE_EXISTS", "message": "Terminal code already exists."}}, status=409)
        terminal = PosTerminal.objects.create(tenant=tenant, code=data["code"], name=data["name"], branch=branch, warehouse=warehouse)
        return Response({"success": True, "terminal": PosTerminalSerializer(terminal).data}, status=201)


class PosSaleListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "pos.sale.read")
        if denied:
            return denied
        qs = PosSale.objects.filter(tenant=tenant).select_related("terminal").prefetch_related("lines__item").order_by("-created_at")
        return Response({"success": True, "pos_sales": PosSaleSerializer(qs[:100], many=True).data})

    def post(self, request):
        serializer = PosSaleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "pos.sale.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            sale = create_pos_sale(
                tenant=tenant,
                terminal_id=data["terminal_id"],
                lines=data["lines"],
                customer_id=data.get("customer_id"),
                payment_method=data.get("payment_method", PosSale.PaymentMethod.CASH),
                device_fingerprint=data.get("device_fingerprint", ""),
                actor_id=request.user.id,
            )
        except SalesError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        sale = PosSale.objects.filter(id=sale.id).select_related("terminal").prefetch_related("lines__item").first()
        return Response({"success": True, "pos_sale": PosSaleSerializer(sale).data}, status=201)


class PosSalePostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, sale_id):
        serializer = PosSalePostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "pos.sale.post")
        if denied:
            return denied
        try:
            result = post_pos_sale(tenant=tenant, sale_id=sale_id, idempotency_key=serializer.validated_data["idempotency_key"], actor_id=request.user.id)
        except SalesError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "result": result})
