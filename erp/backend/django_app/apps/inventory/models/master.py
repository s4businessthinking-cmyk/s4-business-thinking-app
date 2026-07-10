from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class UnitOfMeasure(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="uoms")
    code = models.CharField(max_length=16)
    name = models.CharField(max_length=64)
    is_base = models.BooleanField(default=True)

    class Meta:
        db_table = "inventory_uom"
        unique_together = [("tenant", "code")]
        indexes = [models.Index(fields=["tenant", "code"])]


class ItemCategory(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="item_categories")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=128)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")

    class Meta:
        db_table = "inventory_item_category"
        unique_together = [("tenant", "code")]
        verbose_name_plural = "item categories"


class Item(BaseModel):
    class TrackingType(models.TextChoices):
        NONE = "NONE", "None"
        BATCH = "BATCH", "Batch"
        SERIAL = "SERIAL", "Serial"

    class NegativeStockPolicy(models.TextChoices):
        STRICT = "STRICT", "Strict"
        WARN = "WARN", "Warn"
        SILENT = "SILENT", "Silent"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="items")
    sku = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=128, blank=True, default="")
    description = models.TextField(blank=True, default="")
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="items")
    category = models.ForeignKey(ItemCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="items")
    tracking_type = models.CharField(max_length=16, choices=TrackingType.choices, default=TrackingType.NONE)
    negative_stock_policy = models.CharField(
        max_length=16,
        choices=NegativeStockPolicy.choices,
        default=NegativeStockPolicy.STRICT,
    )
    standard_rate = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "inventory_item"
        unique_together = [("tenant", "sku")]
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "name"]),
        ]
