from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.purchase.models import GoodsReceiptNote, PurchaseOrder, Supplier
from apps.purchase.serializers import (
    GrnCreateFromPoSerializer,
    GrnPostSerializer,
    GrnSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderSerializer,
    SupplierCreateSerializer,
    SupplierSerializer,
)
from apps.purchase.services.purchase import (
    PurchaseError,
    create_grn_from_po,
    create_purchase_order,
    post_grn,
    publish_supplier_to_sync,
    submit_purchase_order,
)
from apps.rbac.services.permissions import user_has_permission
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


class SupplierListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.supplier.read")
        if denied:
            return denied
        qs = Supplier.objects.filter(tenant=tenant, is_active=True).order_by("code")
        search = (request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        return Response({"success": True, "suppliers": SupplierSerializer(qs[:200], many=True).data})

    def post(self, request):
        serializer = SupplierCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.supplier.create")
        if denied:
            return denied
        data = serializer.validated_data
        if Supplier.objects.filter(tenant=tenant, code=data["code"]).exists():
            return Response(
                {"success": False, "error": {"code": "CODE_EXISTS", "message": "Supplier code already exists."}},
                status=409,
            )
        supplier = Supplier.objects.create(tenant=tenant, **data)
        publish_supplier_to_sync(supplier)
        return Response({"success": True, "supplier": SupplierSerializer(supplier).data}, status=201)


class PurchaseOrderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.po.read")
        if denied:
            return denied
        qs = PurchaseOrder.objects.filter(tenant=tenant).select_related("supplier", "warehouse").prefetch_related("lines__item").order_by("-created_at")
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        return Response({"success": True, "purchase_orders": PurchaseOrderSerializer(qs[:100], many=True).data})

    def post(self, request):
        serializer = PurchaseOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.po.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            po = create_purchase_order(
                tenant=tenant,
                supplier_id=data["supplier_id"],
                lines=data["lines"],
                actor_id=request.user.id,
                remarks=data.get("remarks", ""),
                warehouse_id=str(data["warehouse_id"]) if data.get("warehouse_id") else None,
            )
        except PurchaseError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        po = PurchaseOrder.objects.filter(id=po.id).select_related("supplier", "warehouse").prefetch_related("lines__item").first()
        return Response({"success": True, "purchase_order": PurchaseOrderSerializer(po).data}, status=201)


class PurchaseOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, po_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.po.read")
        if denied:
            return denied
        po = PurchaseOrder.objects.filter(id=po_id, tenant=tenant).select_related("supplier", "warehouse").prefetch_related("lines__item").first()
        if not po:
            return Response({"success": False, "error": {"code": "NOT_FOUND", "message": "PO not found"}}, status=404)
        return Response({"success": True, "purchase_order": PurchaseOrderSerializer(po).data})


class PurchaseOrderSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, po_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.po.submit")
        if denied:
            return denied
        try:
            po = submit_purchase_order(tenant=tenant, po_id=po_id)
        except PurchaseError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        po = PurchaseOrder.objects.filter(id=po.id).select_related("supplier", "warehouse").prefetch_related("lines__item").first()
        return Response({"success": True, "purchase_order": PurchaseOrderSerializer(po).data})


class GrnListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.grn.read")
        if denied:
            return denied
        qs = GoodsReceiptNote.objects.filter(tenant=tenant).select_related("supplier", "purchase_order").prefetch_related("lines__item").order_by("-created_at")
        return Response({"success": True, "grns": GrnSerializer(qs[:100], many=True).data})


class GrnCreateFromPoView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GrnCreateFromPoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.grn.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            grn = create_grn_from_po(
                tenant=tenant,
                po_id=data["po_id"],
                lines=data.get("lines"),
                remarks=data.get("remarks", ""),
            )
        except PurchaseError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        grn = GoodsReceiptNote.objects.filter(id=grn.id).select_related("supplier", "purchase_order").prefetch_related("lines__item").first()
        return Response({"success": True, "grn": GrnSerializer(grn).data}, status=201)


class GrnPostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, grn_id):
        serializer = GrnPostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "purchase.grn.post")
        if denied:
            return denied
        try:
            result = post_grn(
                tenant=tenant,
                grn_id=grn_id,
                idempotency_key=serializer.validated_data["idempotency_key"],
                actor_id=request.user.id,
            )
        except PurchaseError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "result": result})
