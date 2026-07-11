"""Device provisioning (STAGE 12, ERP_ARCHITECTURE §20.10 first-run flow).

Flow:
  1. Tenant admin issues an activation code (scoped to a station type + channel).
  2. Desktop client redeems the code with a locally generated ``device_uid``.
  3. Server creates/links a DesktopDevice and returns the device key ONCE.
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.devices.models import (
    DesktopDevice,
    DeviceActivation,
    DeviceEvent,
    StationType,
    UpdateChannel,
)
from apps.devices.services.keys import (
    generate_activation_code,
    generate_device_key,
)

DEFAULT_ACTIVATION_TTL_MINUTES = 60
MAX_ACTIVATION_TTL_MINUTES = 60 * 24 * 7


class ProvisioningError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _normalize_choice(value, choices, default):
    valid = {c[0] for c in choices}
    value = (value or "").strip()
    return value if value in valid else default


@transaction.atomic
def create_activation(*, tenant, station_type="", update_channel="", ttl_minutes=None, actor_id=None):
    station_type = _normalize_choice(station_type, StationType.choices, StationType.GENERAL)
    update_channel = _normalize_choice(update_channel, UpdateChannel.choices, UpdateChannel.STABLE)
    try:
        ttl = int(ttl_minutes) if ttl_minutes else DEFAULT_ACTIVATION_TTL_MINUTES
    except (TypeError, ValueError):
        ttl = DEFAULT_ACTIVATION_TTL_MINUTES
    ttl = max(1, min(ttl, MAX_ACTIVATION_TTL_MINUTES))

    # Generate a code unique for this tenant.
    code = generate_activation_code()
    for _ in range(5):
        if not DeviceActivation.objects.filter(tenant=tenant, code=code).exists():
            break
        code = generate_activation_code()
    else:
        raise ProvisioningError("CODE_COLLISION", "Could not generate a unique activation code", 500)

    activation = DeviceActivation.objects.create(
        tenant=tenant,
        code=code,
        station_type=station_type,
        update_channel=update_channel,
        created_by=actor_id,
        expires_at=timezone.now() + timedelta(minutes=ttl),
    )
    return activation


@transaction.atomic
def redeem_activation(*, tenant, code, device_uid, name="", platform=""):
    code = (code or "").strip().upper()
    device_uid = (device_uid or "").strip()
    if not code:
        raise ProvisioningError("CODE_REQUIRED", "Activation code is required", 400)
    if not device_uid:
        raise ProvisioningError("DEVICE_UID_REQUIRED", "device_uid is required", 400)

    activation = (
        DeviceActivation.objects.select_for_update()
        .filter(tenant=tenant, code=code)
        .first()
    )
    if not activation:
        raise ProvisioningError("INVALID_CODE", "Activation code not found", 404)
    if activation.consumed_at is not None:
        raise ProvisioningError("CODE_CONSUMED", "Activation code already used", 409)
    if activation.expires_at <= timezone.now():
        raise ProvisioningError("CODE_EXPIRED", "Activation code has expired", 410)

    plaintext, key_hash = generate_device_key()

    device = (
        DesktopDevice.objects.select_for_update()
        .filter(tenant=tenant, device_uid=device_uid)
        .first()
    )
    if device is None:
        device = DesktopDevice(tenant=tenant, device_uid=device_uid)
    device.name = (name or device.name or device_uid)[:128]
    device.platform = (platform or device.platform or "")[:32]
    device.station_type = activation.station_type
    device.update_channel = activation.update_channel
    device.status = DesktopDevice.Status.ACTIVE
    device.device_key_hash = key_hash
    device.registered_by = activation.created_by
    device.last_seen_at = timezone.now()
    device.save()

    activation.consumed_at = timezone.now()
    activation.device = device
    activation.save(update_fields=["consumed_at", "device", "updated_at"])

    DeviceEvent.objects.create(
        tenant=tenant,
        device=device,
        event_type=DeviceEvent.EventType.REGISTERED,
        payload={"device_uid": device_uid, "station_type": device.station_type},
    )

    return device, plaintext
