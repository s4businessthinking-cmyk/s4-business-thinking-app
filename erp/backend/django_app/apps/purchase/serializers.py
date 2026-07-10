from decimal import Decimal

from rest_framework import serializers

from apps.purchase.models import GoodsReceiptLine, GoodsReceiptNote, PurchaseOrder, PurchaseOrderLine, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "code", "name", "email", "phone", "address", "is_active", "row_version", "created_at"]


class SupplierCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    qty_remaining = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderLine
        fields = [
            "id",
            "line_no",
            "item_id",
            "item_sku",
            "item_name",
            "qty_ordered",
            "qty_received",
            "qty_remaining",
            "rate",
            "amount",
        ]

    def get_qty_remaining(self, obj):
        return str(obj.qty_ordered - obj.qty_received)


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    supplier_code = serializers.CharField(source="supplier.code", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    lines = PurchaseOrderLineSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "po_number",
            "supplier_id",
            "supplier_name",
            "supplier_code",
            "warehouse_id",
            "warehouse_code",
            "status",
            "order_date",
            "expected_date",
            "currency",
            "total_amount",
            "remarks",
            "lines",
            "created_at",
        ]


class PurchaseOrderLineInputSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    qty = serializers.DecimalField(max_digits=28, decimal_places=8, min_value=Decimal("0.00000001"))
    rate = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0"))


class PurchaseOrderCreateSerializer(serializers.Serializer):
    supplier_id = serializers.UUIDField()
    warehouse_id = serializers.UUIDField(required=False)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    lines = PurchaseOrderLineInputSerializer(many=True)


class GrnLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = ["id", "line_no", "item_id", "item_sku", "qty_received", "rate", "amount", "purchase_order_line_id"]


class GrnSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    po_number = serializers.CharField(source="purchase_order.po_number", read_only=True, allow_null=True)
    lines = GrnLineSerializer(many=True, read_only=True)

    class Meta:
        model = GoodsReceiptNote
        fields = [
            "id",
            "grn_number",
            "purchase_order_id",
            "po_number",
            "supplier_id",
            "supplier_name",
            "warehouse_id",
            "status",
            "receipt_date",
            "posted_at",
            "remarks",
            "lines",
            "created_at",
        ]


class GrnCreateFromPoSerializer(serializers.Serializer):
    po_id = serializers.UUIDField()
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    lines = serializers.ListField(child=serializers.DictField(), required=False)


class GrnPostSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(max_length=128)
