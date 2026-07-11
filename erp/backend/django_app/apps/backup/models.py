from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class BackupJob(BaseModel):
    """A single backup run (STAGE 14, ERP_ARCHITECTURE §22).

    ``tenant`` null => system-wide full backup. When set, it is a per-tenant
    logical export. The physical artifact lives under ``settings.BACKUP_ROOT``
    and is fingerprinted with a SHA-256 checksum for tamper / corruption checks.
    """

    class BackupType(models.TextChoices):
        FULL = "FULL", "Full system"
        TENANT = "TENANT", "Per-tenant export"

    class Method(models.TextChoices):
        PG_DUMP = "PG_DUMP", "pg_dump (SQL)"
        DJANGO_DUMPDATA = "DJANGO_DUMPDATA", "Django dumpdata (JSON)"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RUNNING = "RUNNING", "Running"
        SUCCESS = "SUCCESS", "Success"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired / purged"

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="backup_jobs", null=True, blank=True
    )
    backup_type = models.CharField(max_length=16, choices=BackupType.choices, default=BackupType.FULL)
    method = models.CharField(max_length=24, choices=Method.choices, default=Method.PG_DUMP)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    storage_key = models.CharField(max_length=512, blank=True, default="")
    filename = models.CharField(max_length=255, blank=True, default="")
    size_bytes = models.BigIntegerField(default=0)
    checksum_sha256 = models.CharField(max_length=64, blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.BigIntegerField(default=0)
    retention_until = models.DateTimeField(null=True, blank=True, db_index=True)
    triggered_by = models.UUIDField(null=True, blank=True)
    is_scheduled = models.BooleanField(default=False)
    error = models.TextField(blank=True, default="")
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "backup_job"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "created_at"], name="backup_tenant_created_idx"),
            models.Index(fields=["status", "retention_until"], name="backup_status_ret_idx"),
        ]

    def __str__(self):
        return f"BackupJob<{self.backup_type}:{self.status}@{self.created_at.isoformat()}>"
