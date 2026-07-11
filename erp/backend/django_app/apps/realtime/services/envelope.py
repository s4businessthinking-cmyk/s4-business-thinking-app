"""Realtime message envelope (STAGE 11, ERP_ARCHITECTURE §13.5)."""
import uuid

from django.utils import timezone

ENVELOPE_VERSION = 1


def build_envelope(
    *,
    event_type: str,
    tenant_id: str,
    logical_group: str,
    payload: dict,
    scope: dict | None = None,
    entity_type: str = "",
    entity_id: str = "",
    seq: int = 0,
    hlc: dict | None = None,
    trace_id: str = "",
) -> dict:
    return {
        "type": event_type,
        "version": ENVELOPE_VERSION,
        "ts": timezone.now().isoformat(),
        "hlc": hlc or {},
        "id": f"evt_{uuid.uuid4().hex}",
        "seq": int(seq),
        "tenant_id": str(tenant_id),
        "group": logical_group,
        "scope": scope or {},
        "entity": {"type": entity_type, "id": entity_id},
        "payload": payload or {},
        "trace_id": trace_id or "",
    }
