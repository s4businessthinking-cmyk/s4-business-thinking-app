"""Device registry operations (STAGE 12, ERP_ARCHITECTURE §20.7 updates + pinning)."""
from django.utils import timezone

from apps.devices.models import (
    DesktopDevice,
    DeviceEvent,
    UpdateChannel,
)
from apps.devices.services.keys import verify_device_key
from apps.devices.services.provisioning import ProvisioningError


def resolve_update_target(device: DesktopDevice) -> dict:
    """Return the update instruction for a device (§20.7).

    A pinned version always wins; otherwise the client follows the latest build
    on its assigned channel. Artifact resolution itself is performed by the
    desktop updater against the release feed — the server only dictates policy.
    """
    pinned = (device.pinned_version or "").strip()
    return {
        "channel": device.update_channel,
        "pinned": bool(pinned),
        "target_version": pinned or "latest",
    }


def heartbeat(*, tenant, device_uid, device_key, app_version=""):
    device = DesktopDevice.objects.filter(tenant=tenant, device_uid=(device_uid or "").strip()).first()
    if not device:
        raise ProvisioningError("DEVICE_NOT_FOUND", "Device not registered", 404)
    if device.status == DesktopDevice.Status.DISABLED:
        raise ProvisioningError("DEVICE_DISABLED", "Device has been disabled", 403)
    if not verify_device_key(device_key, device.device_key_hash):
        raise ProvisioningError("INVALID_DEVICE_KEY", "Device key mismatch", 401)

    device.last_seen_at = timezone.now()
    fields = ["last_seen_at", "updated_at"]
    app_version = (app_version or "").strip()[:32]
    if app_version and app_version != device.app_version:
        device.app_version = app_version
        fields.append("app_version")
    if device.status != DesktopDevice.Status.ACTIVE:
        device.status = DesktopDevice.Status.ACTIVE
        fields.append("status")
    device.save(update_fields=fields)

    DeviceEvent.objects.create(
        tenant=tenant,
        device=device,
        event_type=DeviceEvent.EventType.HEARTBEAT,
        payload={"app_version": app_version},
    )
    return device


def pin_version(*, tenant, device_id, version):
    device = _get_device(tenant, device_id)
    device.pinned_version = (version or "").strip()[:32]
    device.save(update_fields=["pinned_version", "updated_at"])
    DeviceEvent.objects.create(
        tenant=tenant,
        device=device,
        event_type=DeviceEvent.EventType.UPDATE_PINNED,
        payload={"pinned_version": device.pinned_version},
    )
    return device


def set_channel(*, tenant, device_id, channel):
    channel = (channel or "").strip()
    if channel not in {c[0] for c in UpdateChannel.choices}:
        raise ProvisioningError("INVALID_CHANNEL", "Unknown update channel", 400)
    device = _get_device(tenant, device_id)
    device.update_channel = channel
    device.save(update_fields=["update_channel", "updated_at"])
    DeviceEvent.objects.create(
        tenant=tenant,
        device=device,
        event_type=DeviceEvent.EventType.CHANNEL_CHANGED,
        payload={"update_channel": channel},
    )
    return device


def set_status(*, tenant, device_id, disabled: bool):
    device = _get_device(tenant, device_id)
    device.status = DesktopDevice.Status.DISABLED if disabled else DesktopDevice.Status.ACTIVE
    device.save(update_fields=["status", "updated_at"])
    if disabled:
        DeviceEvent.objects.create(
            tenant=tenant,
            device=device,
            event_type=DeviceEvent.EventType.DISABLED,
            payload={"status": device.status},
        )
    return device


def _get_device(tenant, device_id) -> DesktopDevice:
    device = DesktopDevice.objects.filter(tenant=tenant, id=device_id).first()
    if not device:
        raise ProvisioningError("DEVICE_NOT_FOUND", "Device not found", 404)
    return device
