import uuid

from django.db import models
from django.utils import timezone


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    row_version = models.BigIntegerField(default=1)

    class Meta:
        abstract = True


class AuditLogEntry(BaseModel):
    """Immutable audit log foundation — hash chain added in STAGE 2."""

    class Category(models.TextChoices):
        SYSTEM = "SYSTEM", "System"
        AUTH = "AUTH", "Authentication"
        API = "API", "API"
        HEALTH = "HEALTH", "Health"

    class Severity(models.TextChoices):
        INFO = "INFO", "Info"
        WARNING = "WARNING", "Warning"
        ERROR = "ERROR", "Error"
        CRITICAL = "CRITICAL", "Critical"

    category = models.CharField(max_length=32, choices=Category.choices, db_index=True)
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.INFO)
    action = models.CharField(max_length=128, db_index=True)
    actor_id = models.UUIDField(null=True, blank=True)
    correlation_id = models.CharField(max_length=64, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    prev_hash = models.CharField(max_length=128, blank=True, default="")
    entry_hash = models.CharField(max_length=128, blank=True, default="")

    class Meta:
        db_table = "audit_log_entry"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["category", "created_at"]),
            models.Index(fields=["action", "created_at"]),
        ]

    def __str__(self):
        return f"{self.category}:{self.action}@{self.created_at.isoformat()}"
