from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.inventory.models import Item
from apps.tenancy.models import Branch, Tenant, Warehouse

from .supplier import Supplier


class PurchaseOrder(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", "Partially Received"
        RECEIVED = "RECEIVED", "Received"
        CANCELLED = "CANCELLED", "Cancelled"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="purchase_orders")
    po_number = models.CharField(max_length=32, db_index=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="purchase_orders")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT, db_index=True)
    order_date = models.DateField(default=timezone.now)
    expected_date = models.DateField(null=True, blank=True)
    currency = models.CharField(max_length=8, default="AED")
    total_amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    remarks = models.TextField(blank=True, default="")
    created_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "purchase_order"
        unique_together = [("tenant", "po_number")]
        indexes = [models.Index(fields=["tenant", "status", "order_date"])]


class PurchaseOrderLine(BaseModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="po_lines")
    qty_ordered = models.DecimalField(max_digits=28, decimal_places=8)
    qty_received = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    rate = models.DecimalField(max_digits=18, decimal_places=4)
    amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))

    class Meta:
        db_table = "purchase_order_line"
        unique_together = [("purchase_order", "line_no")]
        ordering = ["line_no"]


class GoodsReceiptNote(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        CANCELLED = "CANCELLED", "Cancelled"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="grns")
    grn_number = models.CharField(max_length=32, db_index=True)
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="grns",
    )
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="grns")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="grns")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True)
    receipt_date = models.DateField(default=timezone.now)
    posted_at = models.DateTimeField(null=True, blank=True)
    post_idempotency_key = models.CharField(max_length=128, blank=True, default="", db_index=True)
    correlation_id = models.UUIDField(db_index=True)
    remarks = models.TextField(blank=True, default="")
    posted_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "purchase_grn"
        unique_together = [("tenant", "grn_number")]
        indexes = [models.Index(fields=["tenant", "status", "receipt_date"])]


class GoodsReceiptLine(BaseModel):
    grn = models.ForeignKey(GoodsReceiptNote, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    purchase_order_line = models.ForeignKey(
        PurchaseOrderLine,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="grn_lines",
    )
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="grn_lines")
    qty_received = models.DecimalField(max_digits=28, decimal_places=8)
    rate = models.DecimalField(max_digits=18, decimal_places=4)
    amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))

    class Meta:
        db_table = "purchase_grn_line"
        unique_together = [("grn", "line_no")]
        ordering = ["line_no"]
