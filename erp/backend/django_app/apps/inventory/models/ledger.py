import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Branch, Company, Tenant, Warehouse

from .master import Item


class ItemWarehouseBalance(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="item_balances")
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="warehouse_balances")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="item_balances")
    on_hand_qty = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    reserved_qty = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    valuation_rate = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    stock_value = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))

    class Meta:
        db_table = "inventory_item_warehouse_balance"
        unique_together = [("item", "warehouse")]
        indexes = [models.Index(fields=["tenant", "warehouse"])]

    @property
    def available_qty(self) -> Decimal:
        return self.on_hand_qty - self.reserved_qty


class StockLedgerEntry(BaseModel):
    class VoucherType(models.TextChoices):
        OPENING = "OPENING", "Opening"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"
        GRN = "GRN", "GRN"
        DELIVERY = "DELIVERY", "Delivery"
        TRANSFER_OUT = "TRANSFER_OUT", "Transfer Out"
        TRANSFER_IN = "TRANSFER_IN", "Transfer In"
        POS_SALE = "POS_SALE", "POS Sale"
        RETURN_IN = "RETURN_IN", "Return In"
        RETURN_OUT = "RETURN_OUT", "Return Out"

    class Direction(models.TextChoices):
        IN = "IN", "In"
        OUT = "OUT", "Out"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="stock_ledger_entries")
    posting_datetime = models.DateTimeField(default=timezone.now, db_index=True)
    posting_date = models.DateField(default=timezone.now, db_index=True)
    voucher_type = models.CharField(max_length=32, choices=VoucherType.choices, db_index=True)
    voucher_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    voucher_line_id = models.UUIDField(default=uuid.uuid4)
    idempotency_key = models.CharField(max_length=128, db_index=True)
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="stock_ledger_entries")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="stock_ledger_entries")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="stock_ledger_entries")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="stock_ledger_entries")
    qty = models.DecimalField(max_digits=28, decimal_places=8)
    direction = models.CharField(max_length=8, choices=Direction.choices)
    valuation_rate = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    stock_value_change = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    balance_qty = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    balance_value = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    correlation_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    posted_by = models.UUIDField(null=True, blank=True)
    reversal_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reversals",
    )
    is_reversed = models.BooleanField(default=False)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "inventory_stock_ledger_entry"
        unique_together = [("tenant", "idempotency_key")]
        indexes = [
            models.Index(fields=["tenant", "item", "warehouse", "posting_date"]),
            models.Index(fields=["tenant", "voucher_type", "voucher_id"]),
        ]
        ordering = ["posting_datetime", "created_at"]

    def save(self, *args, **kwargs):
        if self.pk and StockLedgerEntry.objects.filter(pk=self.pk).exists():
            allowed = {"is_reversed", "updated_at"}
            if not set(kwargs.get("update_fields") or []) <= allowed:
                raise ValueError("Stock ledger entries are immutable")
        super().save(*args, **kwargs)
