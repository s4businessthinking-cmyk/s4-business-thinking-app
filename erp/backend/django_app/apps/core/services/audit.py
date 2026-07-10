import hashlib
import json
import logging

from apps.core.models import AuditLogEntry

logger = logging.getLogger(__name__)


def write_audit_log(
    *,
    category: str,
    action: str,
    severity: str = AuditLogEntry.Severity.INFO,
    actor_id=None,
    correlation_id: str = "",
    ip_address=None,
    user_agent: str = "",
    payload: dict | None = None,
) -> AuditLogEntry:
    last = AuditLogEntry.objects.order_by("-created_at").first()
    prev_hash = last.entry_hash if last else ""

    entry = AuditLogEntry(
        category=category,
        severity=severity,
        action=action,
        actor_id=actor_id,
        correlation_id=correlation_id,
        ip_address=ip_address,
        user_agent=user_agent[:2000] if user_agent else "",
        payload=payload or {},
        prev_hash=prev_hash,
    )
    entry.entry_hash = _compute_hash(entry, prev_hash)
    entry.save()
    logger.info("audit_log_written action=%s category=%s", action, category)
    return entry


def _compute_hash(entry: AuditLogEntry, prev_hash: str) -> str:
    payload = {
        "id": str(entry.id),
        "category": entry.category,
        "action": entry.action,
        "created_at": entry.created_at.isoformat() if entry.created_at else "",
        "payload": entry.payload,
        "prev_hash": prev_hash,
    }
    raw = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()
