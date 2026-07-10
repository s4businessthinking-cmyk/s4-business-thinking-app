from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.inventory.models import Item
from apps.tenancy.models import Branch, Tenant, Warehouse

from .customer import Customer


class PosTerminal(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="pos_terminals")
    code = models.CharField(max_length=32, db_index=True)
    name = models.CharField(max_length=128)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="pos_terminals")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="pos_terminals")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "pos_terminal"
        unique_together = [("tenant", "code")]
        indexes = [models.Index(fields=["tenant", "is_active"])]


class PosSale(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        VOID = "VOID", "Void"

    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        MIXED = "MIXED", "Mixed"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="pos_sales")
    draft_number = models.CharField(max_length=32, db_index=True)
    invoice_number = models.CharField(max_length=32, blank=True, default="", db_index=True)
    terminal = models.ForeignKey(PosTerminal, on_delete=models.PROTECT, related_name="sales")
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="pos_sales")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="pos_sales")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True)
    payment_method = models.CharField(max_length=16, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    sale_date = models.DateTimeField(default=timezone.now)
    total_amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    posted_at = models.DateTimeField(null=True, blank=True)
    post_idempotency_key = models.CharField(max_length=128, blank=True, default="", db_index=True)
    correlation_id = models.UUIDField(db_index=True)
    device_fingerprint = models.CharField(max_length=128, blank=True, default="")
    posted_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "pos_sale"
        unique_together = [("tenant", "draft_number")]
        indexes = [models.Index(fields=["tenant", "status", "sale_date"])]


class PosSaleLine(BaseModel):
    pos_sale = models.ForeignKey(PosSale, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="pos_sale_lines")
    qty = models.DecimalField(max_digits=28, decimal_places=8)
    rate = models.DecimalField(max_digits=18, decimal_places=4)
    amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))

    class Meta:
        db_table = "pos_sale_line"
        unique_together = [("pos_sale", "line_no")]
        ordering = ["line_no"]
