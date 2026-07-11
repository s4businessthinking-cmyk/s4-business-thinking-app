from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class NotificationCategory(models.TextChoices):
    SYSTEM = "SYSTEM", "System"
    INVENTORY = "INVENTORY", "Inventory"
    SALES = "SALES", "Sales"
    PURCHASE = "PURCHASE", "Purchase"
    FINANCE = "FINANCE", "Finance"
    HRM = "HRM", "HRM"
    APPROVAL = "APPROVAL", "Approval"


class NotificationSeverity(models.TextChoices):
    INFO = "INFO", "Info"
    WARNING = "WARNING", "Warning"
    CRITICAL = "CRITICAL", "Critical"


class Notification(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="notifications")
    # recipient_id == null → tenant-wide broadcast (visible to all tenant users).
    recipient_id = models.UUIDField(null=True, blank=True, db_index=True)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    category = models.CharField(max_length=16, choices=NotificationCategory.choices, default=NotificationCategory.SYSTEM)
    severity = models.CharField(max_length=16, choices=NotificationSeverity.choices, default=NotificationSeverity.INFO)
    entity_type = models.CharField(max_length=64, blank=True, default="")
    entity_id = models.CharField(max_length=64, blank=True, default="")
    source_rule = models.CharField(max_length=64, blank=True, default="")
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "notification"
        indexes = [
            models.Index(fields=["tenant", "recipient_id", "is_read"], name="notif_tenant_rcpt_read_idx"),
            models.Index(fields=["tenant", "created_at"], name="notif_tenant_created_idx"),
        ]


class NotificationRule(BaseModel):
    class TriggerType(models.TextChoices):
        LOW_STOCK = "LOW_STOCK", "Low stock"
        CUSTOM = "CUSTOM", "Custom / manual"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="notification_rules")
    code = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=128)
    trigger_type = models.CharField(max_length=16, choices=TriggerType.choices, default=TriggerType.LOW_STOCK)
    category = models.CharField(max_length=16, choices=NotificationCategory.choices, default=NotificationCategory.INVENTORY)
    severity = models.CharField(max_length=16, choices=NotificationSeverity.choices, default=NotificationSeverity.WARNING)
    enabled = models.BooleanField(default=True)
    realtime = models.BooleanField(default=True)
    config = models.JSONField(default=dict, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_match_count = models.IntegerField(default=0)

    class Meta:
        db_table = "notification_rule"
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "enabled"], name="notif_rule_tenant_en_idx"),
        ]
