"""Notification dispatch (STAGE 13).

Creates a persisted notification and (best-effort) pushes it live over the
STAGE 11 realtime layer so connected clients update without polling.
"""
import logging

from django.utils import timezone

from apps.notifications.models import (
    Notification,
    NotificationCategory,
    NotificationSeverity,
)

logger = logging.getLogger(__name__)


def _publish_realtime(tenant_id: str, notification: Notification):
    """Fan the notification out over realtime. Best-effort; never raises."""
    try:
        from apps.realtime.services.publisher import publish_event

        logical_group = f"user:{notification.recipient_id}" if notification.recipient_id else "tenant"
        publish_event(
            tenant_id=str(tenant_id),
            logical_group=logical_group,
            event_type="notification.created",
            payload={
                "id": str(notification.id),
                "title": notification.title,
                "body": notification.body,
                "category": notification.category,
                "severity": notification.severity,
                "entity_type": notification.entity_type,
                "entity_id": notification.entity_id,
            },
            entity_type=notification.entity_type,
            entity_id=notification.entity_id,
        )
    except Exception:  # pragma: no cover - realtime is best-effort
        logger.exception("notification realtime publish failed id=%s", notification.id)


def create_notification(
    *,
    tenant,
    title,
    body="",
    recipient_id=None,
    category=NotificationCategory.SYSTEM,
    severity=NotificationSeverity.INFO,
    entity_type="",
    entity_id="",
    source_rule="",
    meta=None,
    realtime=True,
) -> Notification:
    notification = Notification.objects.create(
        tenant=tenant,
        recipient_id=recipient_id,
        title=title[:200],
        body=body or "",
        category=category,
        severity=severity,
        entity_type=(entity_type or "")[:64],
        entity_id=(entity_id or "")[:64],
        source_rule=(source_rule or "")[:64],
        meta=meta or {},
    )
    if realtime:
        _publish_realtime(str(tenant.id), notification)
    return notification


def mark_read(*, tenant, notification_id, user_id):
    from django.db.models import Q

    notification = (
        Notification.objects.filter(tenant=tenant, id=notification_id)
        .filter(Q(recipient_id__isnull=True) | Q(recipient_id=user_id))
        .first()
    )
    if not notification:
        return None
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=["is_read", "read_at", "updated_at"])
    return notification


def mark_all_read(*, tenant, user_id) -> int:
    from django.db.models import Q

    qs = Notification.objects.filter(tenant=tenant, is_read=False).filter(
        Q(recipient_id__isnull=True) | Q(recipient_id=user_id)
    )
    return qs.update(is_read=True, read_at=timezone.now())
