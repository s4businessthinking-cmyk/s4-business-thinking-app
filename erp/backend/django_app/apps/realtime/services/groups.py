"""Channel group naming + subscription authorization (STAGE 11).

Channels group names must match ``^[a-zA-Z\\d\\-_.]+$`` and stay short, but our
logical group names (e.g. ``resource:item:<uuid>``) contain colons and can be
long. We therefore hash ``<tenant_id>|<logical_group>`` into a safe physical
channel name. Hashing also enforces tenant isolation: two tenants can never
share a physical group even if the logical name is identical.
"""
import hashlib

# Logical groups that a connection always joins for itself (self-scoped).
BASE_LOGICAL_GROUPS = ("tenant", "user", "device")


def channel_group_name(tenant_id: str, logical_group: str) -> str:
    raw = f"{tenant_id}|{logical_group}".encode("utf-8")
    return "g" + hashlib.sha1(raw).hexdigest()


def base_groups_for(tenant_id: str, user_id: str, device_id: str) -> list[str]:
    """Self-scoped logical groups joined automatically on connect."""
    groups = ["tenant", f"user:{user_id}"]
    if device_id:
        groups.append(f"device:{device_id}")
    return groups


def is_self_scoped_group(logical_group: str, user_id: str, device_id: str) -> bool:
    if logical_group == "tenant":
        return False  # tenant-wide requires permission
    if logical_group == f"user:{user_id}":
        return True
    if device_id and logical_group == f"device:{device_id}":
        return True
    return False
