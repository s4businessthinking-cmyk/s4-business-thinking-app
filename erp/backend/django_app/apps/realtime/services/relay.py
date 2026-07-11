"""Outbox -> realtime relay (STAGE 11, ERP_ARCHITECTURE §9.7 -> §13).

STAGE 4 sync writes append rows to ``SyncOutbox`` whenever a record is applied.
This relay drains those unconsumed rows and broadcasts them as realtime events,
connecting the offline sync pipeline to live WebSocket clients. Rows are marked
``consumed_at`` so each event is relayed exactly once.
"""
import logging

from django.db import transaction
from django.utils import timezone

from apps.realtime.services.publisher import publish_event
from apps.sync.models import SyncOutbox

logger = logging.getLogger(__name__)


def relay_tenant_outbox(*, tenant, batch_size: int = 200) -> dict:
    """Relay unconsumed outbox rows for one tenant. Returns a summary."""
    relayed = 0
    event_ids: list[str] = []

    with transaction.atomic():
        rows = list(
            SyncOutbox.objects.select_for_update(skip_locked=True)
            .filter(tenant=tenant, consumed_at__isnull=True)
            .order_by("created_at")[:batch_size]
        )
        now = timezone.now()
        for row in rows:
            hlc = (row.payload or {}).get("hlc") or {}
            scope = {"branch_id": (row.payload or {}).get("branch_id", "")}
            # Tenant-wide stream (every connection auto-joins this).
            envelope = publish_event(
                tenant_id=str(row.tenant_id),
                logical_group="tenant",
                event_type=f"sync.{row.entity_type}.{row.event_type.lower()}",
                payload=row.payload or {},
                scope=scope,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                hlc=hlc,
            )
            # Per-resource stream for targeted subscribers.
            publish_event(
                tenant_id=str(row.tenant_id),
                logical_group=f"resource:{row.entity_type}:{row.entity_id}",
                event_type=f"sync.{row.entity_type}.{row.event_type.lower()}",
                payload=row.payload or {},
                scope=scope,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                hlc=hlc,
            )
            row.consumed_at = now
            row.save(update_fields=["consumed_at", "updated_at"])
            relayed += 1
            event_ids.append(envelope["id"])

    if relayed:
        logger.info("realtime relay: tenant=%s relayed=%s", tenant.id, relayed)
    return {"relayed": relayed, "event_ids": event_ids}


def relay_all_pending(*, batch_size: int = 200) -> dict:
    """Relay unconsumed outbox rows across all tenants (used by Celery beat)."""
    from apps.tenancy.models import Tenant

    tenant_ids = (
        SyncOutbox.objects.filter(consumed_at__isnull=True)
        .values_list("tenant_id", flat=True)
        .distinct()
    )
    total = 0
    for tenant in Tenant.objects.filter(id__in=list(tenant_ids)):
        total += relay_tenant_outbox(tenant=tenant, batch_size=batch_size)["relayed"]
    return {"relayed": total}
