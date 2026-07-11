from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class FieldType(models.TextChoices):
    TEXT = "TEXT", "Text"
    NUMBER = "NUMBER", "Number"
    DATE = "DATE", "Date"
    BOOLEAN = "BOOLEAN", "Boolean"
    SELECT = "SELECT", "Select"


class CustomFieldDef(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="custom_field_defs")
    entity_type = models.CharField(max_length=64, db_index=True)
    code = models.CharField(max_length=64)
    label = models.CharField(max_length=128)
    field_type = models.CharField(max_length=16, choices=FieldType.choices, default=FieldType.TEXT)
    options = models.JSONField(default=list, blank=True)  # for SELECT
    required = models.BooleanField(default=False)
    enabled = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "custom_field_def"
        unique_together = [("tenant", "entity_type", "code")]
        ordering = ["sort_order", "code"]
        indexes = [
            models.Index(fields=["tenant", "entity_type", "enabled"], name="cfdef_tenant_ent_en_idx"),
        ]


class CustomFieldValue(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="custom_field_values")
    field = models.ForeignKey(CustomFieldDef, on_delete=models.CASCADE, related_name="values")
    entity_type = models.CharField(max_length=64, db_index=True)
    entity_id = models.CharField(max_length=64, db_index=True)
    value_text = models.TextField(blank=True, default="")

    class Meta:
        db_table = "custom_field_value"
        unique_together = [("field", "entity_id")]
        indexes = [
            models.Index(fields=["tenant", "entity_type", "entity_id"], name="cfval_tenant_entity_idx"),
        ]


class NumberSequence(BaseModel):
    class ResetPeriod(models.TextChoices):
        NONE = "NONE", "Never"
        YEARLY = "YEARLY", "Yearly"
        MONTHLY = "MONTHLY", "Monthly"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="number_sequences")
    code = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=128, blank=True, default="")
    prefix = models.CharField(max_length=32, blank=True, default="")
    suffix = models.CharField(max_length=32, blank=True, default="")
    padding = models.IntegerField(default=4)
    next_number = models.BigIntegerField(default=1)
    reset_period = models.CharField(max_length=16, choices=ResetPeriod.choices, default=ResetPeriod.NONE)
    current_period = models.CharField(max_length=16, blank=True, default="")
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "number_sequence"
        unique_together = [("tenant", "code")]
