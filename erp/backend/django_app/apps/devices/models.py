from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class StationType(models.TextChoices):
    GENERAL = "GENERAL", "General"
    POS = "POS", "POS counter"
    WAREHOUSE = "WAREHOUSE", "Warehouse station"
    ACCOUNTING = "ACCOUNTING", "Accounting workstation"


class UpdateChannel(models.TextChoices):
    STABLE = "stable", "Stable"
    BETA = "beta", "Beta"
    CANARY = "canary", "Canary"


class DesktopDevice(BaseModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACTIVE = "ACTIVE", "Active"
        DISABLED = "DISABLED", "Disabled"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="desktop_devices")
    device_uid = models.CharField(max_length=128, db_index=True)
    name = models.CharField(max_length=128, blank=True, default="")
    platform = models.CharField(max_length=32, blank=True, default="")
    station_type = models.CharField(max_length=16, choices=StationType.choices, default=StationType.GENERAL)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    device_key_hash = models.CharField(max_length=128, blank=True, default="")
    app_version = models.CharField(max_length=32, blank=True, default="")
    update_channel = models.CharField(max_length=16, choices=UpdateChannel.choices, default=UpdateChannel.STABLE)
    pinned_version = models.CharField(max_length=32, blank=True, default="")
    last_seen_at = models.DateTimeField(null=True, blank=True)
    window_config = models.JSONField(default=dict, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    registered_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "desktop_device"
        unique_together = [("tenant", "device_uid")]
        indexes = [
            models.Index(fields=["tenant", "status"], name="desktop_dev_tenant_stat_idx"),
        ]


class DeviceActivation(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="device_activations")
    code = models.CharField(max_length=32, db_index=True)
    station_type = models.CharField(max_length=16, choices=StationType.choices, default=StationType.GENERAL)
    update_channel = models.CharField(max_length=16, choices=UpdateChannel.choices, default=UpdateChannel.STABLE)
    created_by = models.UUIDField(null=True, blank=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    device = models.ForeignKey(
        DesktopDevice, on_delete=models.SET_NULL, null=True, blank=True, related_name="activations"
    )

    class Meta:
        db_table = "device_activation"
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "consumed_at"], name="device_act_tenant_cons_idx"),
        ]


class DeviceEvent(BaseModel):
    class EventType(models.TextChoices):
        REGISTERED = "REGISTERED", "Registered"
        HEARTBEAT = "HEARTBEAT", "Heartbeat"
        UPDATE_PINNED = "UPDATE_PINNED", "Update pinned"
        CHANNEL_CHANGED = "CHANNEL_CHANGED", "Channel changed"
        DISABLED = "DISABLED", "Disabled"
        KEY_ROTATED = "KEY_ROTATED", "Key rotated"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="device_events")
    device = models.ForeignKey(
        DesktopDevice, on_delete=models.CASCADE, null=True, blank=True, related_name="events"
    )
    event_type = models.CharField(max_length=20, choices=EventType.choices, db_index=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "device_event"
        indexes = [
            models.Index(fields=["tenant", "created_at"], name="device_evt_tenant_crt_idx"),
        ]
