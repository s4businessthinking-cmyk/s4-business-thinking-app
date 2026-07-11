from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class Attachment(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="attachments")
    entity_type = models.CharField(max_length=64, db_index=True)
    entity_id = models.CharField(max_length=64, db_index=True)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=128, blank=True, default="application/octet-stream")
    size_bytes = models.BigIntegerField(default=0)
    checksum_sha256 = models.CharField(max_length=64, blank=True, default="")
    storage_backend = models.CharField(max_length=32, default="local")
    storage_key = models.CharField(max_length=512, blank=True, default="")
    uploaded_by = models.UUIDField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False, db_index=True)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "attachment"
        indexes = [
            models.Index(fields=["tenant", "entity_type", "entity_id"], name="attach_tenant_entity_idx"),
            models.Index(fields=["tenant", "created_at"], name="attach_tenant_created_idx"),
        ]
