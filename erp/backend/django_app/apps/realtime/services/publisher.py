"""Realtime publisher (STAGE 11, ERP_ARCHITECTURE §13.2/§13.5).

Any Django view, Celery worker or service calls ``publish_event`` to fan a
message out to every connected client subscribed to a logical group. The event
is appended to the replay ring buffer first (so reconnecting clients can catch
up) and then delivered live via the Channels Redis channel layer.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.realtime.services.envelope import build_envelope
from apps.realtime.services.groups import channel_group_name
from apps.realtime.services.replay import append_event, next_seq

logger = logging.getLogger(__name__)


def publish_event(
    *,
    tenant_id: str,
    logical_group: str,
    event_type: str,
    payload: dict,
    scope: dict | None = None,
    entity_type: str = "",
    entity_id: str = "",
    hlc: dict | None = None,
    trace_id: str = "",
) -> dict:
    """Publish one event to a logical group. Returns the built envelope."""
    tenant_id = str(tenant_id)
    seq = next_seq(tenant_id, logical_group)
    envelope = build_envelope(
        event_type=event_type,
        tenant_id=tenant_id,
        logical_group=logical_group,
        payload=payload,
        scope=scope,
        entity_type=entity_type,
        entity_id=entity_id,
        seq=seq,
        hlc=hlc,
        trace_id=trace_id,
    )

    # Persist to ring buffer for reconnect replay (best-effort).
    try:
        append_event(tenant_id, logical_group, envelope)
    except Exception:  # pragma: no cover - ring buffer is best-effort
        logger.exception("realtime ring buffer append failed group=%s", logical_group)

    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning("realtime channel layer not configured; event dropped")
        return envelope

    physical = channel_group_name(tenant_id, logical_group)
    try:
        async_to_sync(channel_layer.group_send)(
            physical,
            {"type": "realtime.event", "envelope": envelope},
        )
    except Exception:
        logger.exception("realtime group_send failed group=%s", logical_group)

    return envelope
