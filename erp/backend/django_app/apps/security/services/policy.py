"""Per-tenant security policy accessors (STAGE 14, §17)."""
from apps.security.models import SecurityPolicy

EDITABLE_FIELDS = {
    "password_min_length": (int, 6, 128),
    "password_require_complexity": (bool, None, None),
    "session_ttl_minutes": (int, 5, 43200),
    "max_login_attempts": (int, 1, 100),
    "lockout_minutes": (int, 1, 1440),
    "require_mfa": (bool, None, None),
}


def get_or_create_policy(tenant) -> SecurityPolicy:
    policy, _ = SecurityPolicy.objects.get_or_create(tenant=tenant)
    return policy


def update_policy(tenant, data: dict, updated_by=None) -> SecurityPolicy:
    policy = get_or_create_policy(tenant)
    changed = []
    for field, (ftype, lo, hi) in EDITABLE_FIELDS.items():
        if field not in data:
            continue
        value = data[field]
        if ftype is int:
            value = int(value)
            if lo is not None:
                value = max(lo, value)
            if hi is not None:
                value = min(hi, value)
        elif ftype is bool:
            value = bool(value)
        setattr(policy, field, value)
        changed.append(field)

    if "ip_allowlist" in data and isinstance(data["ip_allowlist"], list):
        policy.ip_allowlist = [str(x).strip() for x in data["ip_allowlist"] if str(x).strip()]
        changed.append("ip_allowlist")

    if changed:
        policy.updated_by = updated_by
        changed += ["updated_by", "updated_at"]
        policy.save(update_fields=list(set(changed)))
    return policy
