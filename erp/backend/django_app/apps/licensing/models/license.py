from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class TenantLicense(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        INVALID = "INVALID", "Invalid"
        SUSPENDED = "SUSPENDED", "Suspended"

    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name="license")
    license_id = models.CharField(max_length=64, db_index=True)
    plan = models.CharField(max_length=32)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    license_key_fingerprint = models.CharField(max_length=128, unique=True)
    payload = models.JSONField(default=dict)
    modules = models.JSONField(default=list, blank=True)
    max_devices = models.PositiveIntegerField(default=1)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField(null=True, blank=True)
    device_fingerprint = models.CharField(max_length=128, blank=True, default="")
    activated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "licensing_tenant_license"


class LicenseDevice(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="license_devices")
    device_fingerprint = models.CharField(max_length=128, db_index=True)
    device_name = models.CharField(max_length=128, blank=True, default="")
    platform = models.CharField(max_length=64, blank=True, default="web")
    last_seen = models.DateTimeField(default=timezone.now)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "licensing_device"
        unique_together = [("tenant", "device_fingerprint")]
