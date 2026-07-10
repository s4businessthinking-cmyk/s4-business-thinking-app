from typing import Any

from django.db.models import Q

from apps.sync.models import HLC, SyncDeviceCursor, SyncEntityRegistry, SyncedRecord, hlc_from_dict
from apps.sync.services.cursor import sign_cursor, verify_cursor
from apps.sync.services.handshake import PULL_PAGE_SIZE


def _record_to_row(record: SyncedRecord) -> dict[str, Any]:
    return {
        "entity_type": record.entity_type,
        "entity_id": record.entity_id,
        "payload": record.payload,
        "row_version": record.row_version,
        "hlc": {
            "wall_ms": record.hlc_wall_ms,
            "logical": record.hlc_logical,
            "node_id": record.hlc_node_id,
        },
        "is_deleted": record.is_deleted,
    }


def pull_entity_batch(
    *,
    tenant,
    device_id: str,
    entity_type: str,
    cursor: dict | None,
) -> dict[str, Any]:
    registry = SyncEntityRegistry.objects.filter(entity_type=entity_type, enabled=True).first()
    if not registry:
        return {
            "entity_type": entity_type,
            "batch": [],
            "next_cursor": cursor or {},
            "has_more": False,
            "error": {"code": "UNKNOWN_ENTITY", "message": f"Unknown entity type: {entity_type}"},
        }

    cursor_wall = int((cursor or {}).get("wall_ms") or 0)
    cursor_logical = int((cursor or {}).get("logical") or 0)
    cursor_entity_id = str((cursor or {}).get("entity_id") or "")
    cursor_sig = str((cursor or {}).get("signature") or "")

    if cursor and not verify_cursor(
        str(tenant.id),
        device_id,
        entity_type,
        cursor_wall,
        cursor_logical,
        cursor_entity_id,
        cursor_sig,
    ):
        return {
            "entity_type": entity_type,
            "batch": [],
            "next_cursor": cursor or {},
            "has_more": False,
            "error": {"code": "INVALID_CURSOR", "message": "Cursor signature verification failed"},
        }

    qs = SyncedRecord.objects.filter(tenant=tenant, entity_type=entity_type).order_by(
        "hlc_wall_ms", "hlc_logical", "entity_id"
    )
    if cursor_wall or cursor_logical or cursor_entity_id:
        qs = qs.filter(
            Q(hlc_wall_ms__gt=cursor_wall)
            | Q(hlc_wall_ms=cursor_wall, hlc_logical__gt=cursor_logical)
            | Q(hlc_wall_ms=cursor_wall, hlc_logical=cursor_logical, entity_id__gt=cursor_entity_id)
        )

    rows = list(qs[: PULL_PAGE_SIZE + 1])
    has_more = len(rows) > PULL_PAGE_SIZE
    batch_rows = rows[:PULL_PAGE_SIZE]
    batch = [_record_to_row(r) for r in batch_rows]

    if batch_rows:
        last = batch_rows[-1]
        next_cursor = {
            "wall_ms": last.hlc_wall_ms,
            "logical": last.hlc_logical,
            "entity_id": last.entity_id,
            "signature": sign_cursor(
                str(tenant.id),
                device_id,
                entity_type,
                last.hlc_wall_ms,
                last.hlc_logical,
                last.entity_id,
            ),
        }
    else:
        next_cursor = {
            "wall_ms": cursor_wall,
            "logical": cursor_logical,
            "entity_id": cursor_entity_id,
            "signature": sign_cursor(
                str(tenant.id),
                device_id,
                entity_type,
                cursor_wall,
                cursor_logical,
                cursor_entity_id,
            ),
        }

    SyncDeviceCursor.objects.update_or_create(
        tenant=tenant,
        device_id=device_id,
        entity_type=entity_type,
        defaults={
            "cursor_wall_ms": next_cursor["wall_ms"],
            "cursor_logical": next_cursor["logical"],
            "cursor_entity_id": next_cursor["entity_id"],
            "cursor_signature": next_cursor["signature"],
        },
    )

    return {
        "entity_type": entity_type,
        "batch": batch,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


def pull_entities(
    *,
    tenant,
    device_id: str,
    entity_types: list[str],
    cursors: dict[str, dict],
    client_hlc: dict | None,
) -> dict[str, Any]:
    from apps.sync.models import server_hlc_now
    from apps.sync.services.handshake import validate_client_clock

    client = hlc_from_dict(client_hlc)
    clock_error = validate_client_clock(client)
    if clock_error:
        return {"success": False, "error": clock_error}

    results = []
    for entity_type in entity_types:
        results.append(
            pull_entity_batch(
                tenant=tenant,
                device_id=device_id,
                entity_type=entity_type,
                cursor=cursors.get(entity_type),
            )
        )

    return {
        "success": True,
        "results": results,
        "server_hlc": server_hlc_now().as_dict(),
    }
