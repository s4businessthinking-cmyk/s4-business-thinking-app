from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.inventory.models import Item
from apps.tenancy.models import Branch, Tenant, Warehouse

from .customer import Customer


class SalesOrder(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        CONFIRMED = "CONFIRMED", "Confirmed"
        PARTIALLY_DELIVERED = "PARTIALLY_DELIVERED", "Partially Delivered"
        DELIVERED = "DELIVERED", "Delivered"
        CANCELLED = "CANCELLED", "Cancelled"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sales_orders")
    so_number = models.CharField(max_length=32, db_index=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="sales_orders")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="sales_orders")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="sales_orders")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT, db_index=True)
    order_date = models.DateField(default=timezone.now)
    currency = models.CharField(max_length=8, default="AED")
    total_amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    remarks = models.TextField(blank=True, default="")
    created_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "sales_order"
        unique_together = [("tenant", "so_number")]
        indexes = [models.Index(fields=["tenant", "status", "order_date"])]


class SalesOrderLine(BaseModel):
    sales_order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="so_lines")
    qty_ordered = models.DecimalField(max_digits=28, decimal_places=8)
    qty_delivered = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    rate = models.DecimalField(max_digits=18, decimal_places=4)
    amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))

    class Meta:
        db_table = "sales_order_line"
        unique_together = [("sales_order", "line_no")]
        ordering = ["line_no"]


class DeliveryNote(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        CANCELLED = "CANCELLED", "Cancelled"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="delivery_notes")
    delivery_number = models.CharField(max_length=32, db_index=True)
    sales_order = models.ForeignKey(SalesOrder, null=True, blank=True, on_delete=models.PROTECT, related_name="deliveries")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="deliveries")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="deliveries")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True)
    delivery_date = models.DateField(default=timezone.now)
    posted_at = models.DateTimeField(null=True, blank=True)
    post_idempotency_key = models.CharField(max_length=128, blank=True, default="", db_index=True)
    correlation_id = models.UUIDField(db_index=True)
    remarks = models.TextField(blank=True, default="")
    posted_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "sales_delivery_note"
        unique_together = [("tenant", "delivery_number")]
        indexes = [models.Index(fields=["tenant", "status", "delivery_date"])]


class DeliveryLine(BaseModel):
    delivery = models.ForeignKey(DeliveryNote, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    sales_order_line = models.ForeignKey(
        SalesOrderLine,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="delivery_lines",
    )
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="delivery_lines")
    qty_delivered = models.DecimalField(max_digits=28, decimal_places=8)
    rate = models.DecimalField(max_digits=18, decimal_places=4)
    amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))

    class Meta:
        db_table = "sales_delivery_line"
        unique_together = [("delivery", "line_no")]
        ordering = ["line_no"]
