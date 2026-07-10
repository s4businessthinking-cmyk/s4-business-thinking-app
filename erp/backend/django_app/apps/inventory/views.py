from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.models import Item, ItemCategory, ItemWarehouseBalance, StockLedgerEntry, UnitOfMeasure
from apps.inventory.serializers import (
    ItemCreateSerializer,
    ItemSerializer,
    ItemUpdateSerializer,
    StockAdjustSerializer,
    StockBalanceSerializer,
    StockLedgerSerializer,
    StockOpeningSerializer,
)
from apps.inventory.services.posting import PostingError, post_stock_movement, publish_item_to_sync
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


class ItemListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "inventory.item.read")
        if denied:
            return denied
        qs = Item.objects.filter(tenant=tenant).select_related("uom", "category").order_by("sku")
        if request.query_params.get("active_only", "1") == "1":
            qs = qs.filter(is_active=True)
        search = (request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search))
        return Response({"success": True, "items": ItemSerializer(qs[:500], many=True).data})

    def post(self, request):
        serializer = ItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "inventory.item.create")
        if denied:
            return denied

        data = serializer.validated_data
        uom, _ = UnitOfMeasure.objects.get_or_create(
            tenant=tenant,
            code=data["uom_code"].upper(),
            defaults={"name": data["uom_code"].upper(), "is_base": True},
        )
        category = None
        if data.get("category_code"):
            category, _ = ItemCategory.objects.get_or_create(
                tenant=tenant,
                code=data["category_code"].upper(),
                defaults={"name": data["category_code"].upper()},
            )
        if Item.objects.filter(tenant=tenant, sku=data["sku"]).exists():
            return Response(
                {"success": False, "error": {"code": "SKU_EXISTS", "message": "SKU already exists for tenant."}},
                status=409,
            )
        item = Item.objects.create(
            tenant=tenant,
            sku=data["sku"],
            name=data["name"],
            brand=data.get("brand", ""),
            description=data.get("description", ""),
            uom=uom,
            category=category,
            tracking_type=data.get("tracking_type", Item.TrackingType.NONE),
            negative_stock_policy=data.get("negative_stock_policy", Item.NegativeStockPolicy.STRICT),
            standard_rate=data.get("standard_rate", 0),
        )
        publish_item_to_sync(item)
        return Response({"success": True, "item": ItemSerializer(item).data}, status=201)


class ItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, item_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "inventory.item.read")
        if denied:
            return denied
        item = Item.objects.filter(id=item_id, tenant=tenant).select_related("uom", "category").first()
        if not item:
            return Response({"success": False, "error": {"code": "NOT_FOUND", "message": "Item not found"}}, status=404)
        return Response({"success": True, "item": ItemSerializer(item).data})

    def patch(self, request, item_id):
        serializer = ItemUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "inventory.item.update")
        if denied:
            return denied
        item = Item.objects.filter(id=item_id, tenant=tenant).first()
        if not item:
            return Response({"success": False, "error": {"code": "NOT_FOUND", "message": "Item not found"}}, status=404)
        for field, value in serializer.validated_data.items():
            setattr(item, field, value)
        item.row_version += 1
        item.save()
        publish_item_to_sync(item)
        return Response({"success": True, "item": ItemSerializer(item).data})


class StockBalanceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "inventory.stock.read")
        if denied:
            return denied
        qs = ItemWarehouseBalance.objects.filter(tenant=tenant).select_related("item", "warehouse").order_by("item__sku")
        warehouse_id = request.query_params.get("warehouse_id")
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        return Response({"success": True, "balances": StockBalanceSerializer(qs, many=True).data})


class StockLedgerListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "inventory.stock.read")
        if denied:
            return denied
        qs = StockLedgerEntry.objects.filter(tenant=tenant).select_related("item", "warehouse").order_by("-posting_datetime")
        item_id = request.query_params.get("item_id")
        if item_id:
            qs = qs.filter(item_id=item_id)
        return Response({"success": True, "entries": StockLedgerSerializer(qs[:200], many=True).data})


class StockOpeningView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = StockOpeningSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "inventory.stock.adjust")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            result = post_stock_movement(
                tenant=tenant,
                item_id=data["item_id"],
                qty=data["qty"],
                direction=StockLedgerEntry.Direction.IN,
                voucher_type=StockLedgerEntry.VoucherType.OPENING,
                idempotency_key=data["idempotency_key"],
                actor_id=request.user.id,
                warehouse_id=str(data["warehouse_id"]) if data.get("warehouse_id") else None,
                valuation_rate=data.get("valuation_rate"),
                remarks=data.get("remarks", ""),
            )
        except PostingError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "posting": result})


class StockAdjustView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = StockAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "inventory.stock.adjust")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            result = post_stock_movement(
                tenant=tenant,
                item_id=data["item_id"],
                qty=data["qty"],
                direction=data["direction"],
                voucher_type=StockLedgerEntry.VoucherType.ADJUSTMENT,
                idempotency_key=data["idempotency_key"],
                actor_id=request.user.id,
                warehouse_id=str(data["warehouse_id"]) if data.get("warehouse_id") else None,
                valuation_rate=data.get("valuation_rate"),
                remarks=data.get("remarks", ""),
            )
        except PostingError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "posting": result})
