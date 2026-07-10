from django.db import transaction
from django.utils import timezone

from apps.core.models.audit import AuditLogEntry
from apps.core.services.audit import write_audit_log
from apps.licensing.models import LicenseDevice, TenantLicense
from apps.licensing.services.verifier import LicenseVerificationError, verify_and_parse_license_key
from apps.tenancy.models import Tenant


@transaction.atomic
def activate_tenant_license(
    *,
    tenant: Tenant,
    license_key: str,
    device_fingerprint: str,
    device_name: str = "",
    platform: str = "web",
    actor_id=None,
    correlation_id: str = "",
) -> dict:
    try:
        parsed = verify_and_parse_license_key(license_key)
    except LicenseVerificationError as exc:
        return {"success": False, "error": {"code": exc.code, "message": exc.message}}

    existing = TenantLicense.objects.filter(license_key_fingerprint=parsed["fingerprint"]).exclude(tenant=tenant).first()
    if existing:
        return {
            "success": False,
            "error": {"code": "LICENSE_ALREADY_BOUND", "message": "License is already activated on another tenant."},
        }

    license_row, _ = TenantLicense.objects.update_or_create(
        tenant=tenant,
        defaults={
            "license_id": parsed["license_id"],
            "plan": parsed["plan"],
            "status": TenantLicense.Status.ACTIVE,
            "license_key_fingerprint": parsed["fingerprint"],
            "payload": parsed["payload"],
            "modules": parsed["modules"],
            "max_devices": parsed["max_devices"],
            "valid_from": parsed["valid_from"],
            "valid_to": parsed["valid_to"],
            "device_fingerprint": device_fingerprint[:128],
            "activated_at": timezone.now(),
        },
    )

    device, _ = LicenseDevice.objects.update_or_create(
        tenant=tenant,
        device_fingerprint=device_fingerprint[:128],
        defaults={
            "device_name": device_name[:128],
            "platform": platform[:64],
            "last_seen": timezone.now(),
            "revoked_at": None,
        },
    )

    active_devices = LicenseDevice.objects.filter(tenant=tenant, revoked_at__isnull=True).count()
    if active_devices > license_row.max_devices:
        return {
            "success": False,
            "error": {"code": "MAX_DEVICES_EXCEEDED", "message": "Maximum licensed devices exceeded."},
        }

    tenant.status = Tenant.Status.ACTIVE
    tenant.save(update_fields=["status", "updated_at"])

    write_audit_log(
        category=AuditLogEntry.Category.SYSTEM,
        action="LICENSE_ACTIVATED",
        actor_id=actor_id,
        correlation_id=correlation_id,
        payload={
            "tenant_id": str(tenant.id),
            "license_id": license_row.license_id,
            "plan": license_row.plan,
        },
    )

    return {
        "success": True,
        "license": serialize_license_status(tenant, license_row, active_devices),
        "device_id": str(device.id),
    }


def serialize_license_status(tenant: Tenant, license_row: TenantLicense | None = None, active_devices: int = 0) -> dict:
    if license_row is None:
        license_row = getattr(tenant, "license", None)
    if not license_row:
        trial_active = tenant.trial_ends_at and tenant.trial_ends_at > timezone.now()
        return {
            "tenant_id": str(tenant.id),
            "tenant_slug": tenant.slug,
            "status": "TRIAL" if trial_active else tenant.status,
            "plan": tenant.plan.code if tenant.plan_id else None,
            "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
            "license_active": False,
            "modules": tenant.plan.modules if tenant.plan_id else [],
        }

    now = timezone.now()
    expired = license_row.valid_to and license_row.valid_to < now
    return {
        "tenant_id": str(tenant.id),
        "tenant_slug": tenant.slug,
        "status": TenantLicense.Status.EXPIRED if expired else license_row.status,
        "plan": license_row.plan,
        "license_id": license_row.license_id,
        "license_active": license_row.status == TenantLicense.Status.ACTIVE and not expired,
        "modules": license_row.modules,
        "max_devices": license_row.max_devices,
        "active_devices": active_devices,
        "valid_from": license_row.valid_from.isoformat(),
        "valid_to": license_row.valid_to.isoformat() if license_row.valid_to else None,
        "activated_at": license_row.activated_at.isoformat(),
    }
