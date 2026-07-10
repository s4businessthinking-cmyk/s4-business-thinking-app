from decimal import Decimal

from rest_framework import serializers

from apps.inventory.models import Item, ItemCategory, ItemWarehouseBalance, StockLedgerEntry, UnitOfMeasure


class UnitOfMeasureSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitOfMeasure
        fields = ["id", "code", "name", "is_base"]


class ItemCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCategory
        fields = ["id", "code", "name", "parent_id"]


class ItemSerializer(serializers.ModelSerializer):
    uom_code = serializers.CharField(source="uom.code", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, allow_null=True)

    class Meta:
        model = Item
        fields = [
            "id",
            "sku",
            "name",
            "brand",
            "description",
            "uom_id",
            "uom_code",
            "category_id",
            "category_name",
            "tracking_type",
            "negative_stock_policy",
            "standard_rate",
            "is_active",
            "row_version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["row_version", "created_at", "updated_at"]


class ItemCreateSerializer(serializers.Serializer):
    sku = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=255)
    brand = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    uom_code = serializers.CharField(max_length=16, required=False, default="PCS")
    category_code = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    standard_rate = serializers.DecimalField(max_digits=18, decimal_places=4, required=False, default=Decimal("0"))
    tracking_type = serializers.ChoiceField(choices=Item.TrackingType.choices, required=False, default=Item.TrackingType.NONE)
    negative_stock_policy = serializers.ChoiceField(
        choices=Item.NegativeStockPolicy.choices,
        required=False,
        default=Item.NegativeStockPolicy.STRICT,
    )


class ItemUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    brand = serializers.CharField(max_length=128, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    standard_rate = serializers.DecimalField(max_digits=18, decimal_places=4, required=False)
    is_active = serializers.BooleanField(required=False)
    negative_stock_policy = serializers.ChoiceField(choices=Item.NegativeStockPolicy.choices, required=False)


class StockBalanceSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    available_qty = serializers.DecimalField(max_digits=28, decimal_places=8, read_only=True)

    class Meta:
        model = ItemWarehouseBalance
        fields = [
            "id",
            "item_id",
            "item_sku",
            "item_name",
            "warehouse_id",
            "warehouse_code",
            "on_hand_qty",
            "reserved_qty",
            "available_qty",
            "valuation_rate",
            "stock_value",
            "updated_at",
        ]


class StockLedgerSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)

    class Meta:
        model = StockLedgerEntry
        fields = [
            "id",
            "posting_datetime",
            "posting_date",
            "voucher_type",
            "voucher_id",
            "item_id",
            "item_sku",
            "warehouse_id",
            "warehouse_code",
            "qty",
            "direction",
            "valuation_rate",
            "stock_value_change",
            "balance_qty",
            "balance_value",
            "correlation_id",
            "idempotency_key",
            "meta",
        ]


class StockOpeningSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    qty = serializers.DecimalField(max_digits=28, decimal_places=8, min_value=Decimal("0.00000001"))
    valuation_rate = serializers.DecimalField(max_digits=28, decimal_places=8, required=False)
    warehouse_id = serializers.UUIDField(required=False)
    idempotency_key = serializers.CharField(max_length=128)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class StockAdjustSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    qty = serializers.DecimalField(max_digits=28, decimal_places=8, min_value=Decimal("0.00000001"))
    direction = serializers.ChoiceField(choices=StockLedgerEntry.Direction.choices)
    valuation_rate = serializers.DecimalField(max_digits=28, decimal_places=8, required=False)
    warehouse_id = serializers.UUIDField(required=False)
    idempotency_key = serializers.CharField(max_length=128)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
