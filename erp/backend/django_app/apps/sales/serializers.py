from decimal import Decimal

from rest_framework import serializers

from apps.sales.models import (
    Customer,
    DeliveryLine,
    DeliveryNote,
    PosSale,
    PosSaleLine,
    PosTerminal,
    SalesOrder,
    SalesOrderLine,
)


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "code", "name", "email", "phone", "address", "is_active", "row_version", "created_at"]


class CustomerCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")


class SalesOrderLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    qty_remaining = serializers.SerializerMethodField()

    class Meta:
        model = SalesOrderLine
        fields = ["id", "line_no", "item_id", "item_sku", "item_name", "qty_ordered", "qty_delivered", "qty_remaining", "rate", "amount"]

    def get_qty_remaining(self, obj):
        return str(obj.qty_ordered - obj.qty_delivered)


class SalesOrderSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    lines = SalesOrderLineSerializer(many=True, read_only=True)

    class Meta:
        model = SalesOrder
        fields = ["id", "so_number", "customer_id", "customer_name", "warehouse_id", "warehouse_code", "status", "order_date", "total_amount", "remarks", "lines", "created_at"]


class SalesOrderLineInputSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    qty = serializers.DecimalField(max_digits=28, decimal_places=8, min_value=Decimal("0.00000001"))
    rate = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0"))


class SalesOrderCreateSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    warehouse_id = serializers.UUIDField(required=False)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    lines = SalesOrderLineInputSerializer(many=True)


class DeliveryLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)

    class Meta:
        model = DeliveryLine
        fields = ["id", "line_no", "item_id", "item_sku", "qty_delivered", "rate", "amount", "sales_order_line_id"]


class DeliverySerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    so_number = serializers.CharField(source="sales_order.so_number", read_only=True, allow_null=True)
    lines = DeliveryLineSerializer(many=True, read_only=True)

    class Meta:
        model = DeliveryNote
        fields = ["id", "delivery_number", "sales_order_id", "so_number", "customer_id", "customer_name", "warehouse_id", "status", "delivery_date", "posted_at", "remarks", "lines", "created_at"]


class DeliveryCreateFromSoSerializer(serializers.Serializer):
    so_id = serializers.UUIDField()
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    lines = serializers.ListField(child=serializers.DictField(), required=False)


class DeliveryPostSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(max_length=128)


class PosTerminalSerializer(serializers.ModelSerializer):
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)

    class Meta:
        model = PosTerminal
        fields = ["id", "code", "name", "branch_id", "branch_code", "warehouse_id", "warehouse_code", "is_active"]


class PosTerminalCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=128)
    warehouse_id = serializers.UUIDField(required=False)


class PosSaleLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)

    class Meta:
        model = PosSaleLine
        fields = ["id", "line_no", "item_id", "item_sku", "qty", "rate", "amount"]


class PosSaleSerializer(serializers.ModelSerializer):
    terminal_code = serializers.CharField(source="terminal.code", read_only=True)
    lines = PosSaleLineSerializer(many=True, read_only=True)

    class Meta:
        model = PosSale
        fields = [
            "id",
            "draft_number",
            "invoice_number",
            "terminal_id",
            "terminal_code",
            "customer_id",
            "status",
            "payment_method",
            "sale_date",
            "total_amount",
            "posted_at",
            "lines",
            "created_at",
        ]


class PosSaleLineInputSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    qty = serializers.DecimalField(max_digits=28, decimal_places=8, min_value=Decimal("0.00000001"))
    rate = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0"))


class PosSaleCreateSerializer(serializers.Serializer):
    terminal_id = serializers.UUIDField()
    customer_id = serializers.UUIDField(required=False)
    payment_method = serializers.ChoiceField(choices=PosSale.PaymentMethod.choices, required=False, default=PosSale.PaymentMethod.CASH)
    device_fingerprint = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    lines = PosSaleLineInputSerializer(many=True)


class PosSalePostSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(max_length=128)
