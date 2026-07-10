from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.sync.models import (
    HLC,
    SyncConflict,
    SyncEntityRegistry,
    SyncInbox,
    SyncOutbox,
    SyncedRecord,
    hlc_from_dict,
    server_hlc_now,
)
from apps.sync.services.conflict import record_conflict, resolve_lww


def _inbox_cached_result(inbox: SyncInbox) -> dict[str, Any]:
    return {
        "client_op_id": inbox.client_op_id,
        "status": inbox.result_status,
        "server_id": inbox.result_payload.get("server_id"),
        "row_version": inbox.result_payload.get("row_version"),
        "conflict": inbox.result_payload.get("conflict"),
        "idempotent_replay": True,
    }


def _emit_outbox(tenant, entity_type: str, entity_id: str, event_type: str, payload: dict) -> None:
    SyncOutbox.objects.create(
        tenant=tenant,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
    )


@transaction.atomic
def apply_push_op(*, tenant, device_id: str, op: dict) -> dict[str, Any]:
    client_op_id = str(op.get("id") or op.get("client_op_id") or "")
    entity_type = str(op.get("entity_type") or "")
    entity_id = str(op.get("entity_id") or "")
    operation = str(op.get("op") or op.get("operation") or "UPDATE").upper()
    payload = op.get("payload") or {}
    prev_row_version = int(op.get("prev_row_version") or 0)
    client_hlc = hlc_from_dict(op.get("hlc"))

    if not client_op_id or not entity_type:
        return {
            "client_op_id": client_op_id or "unknown",
            "status": "REJECTED",
            "conflict": {"code": "C6", "message": "Missing client_op_id or entity_type"},
        }

    existing_inbox = SyncInbox.objects.filter(
        tenant=tenant, device_id=device_id, client_op_id=client_op_id
    ).first()
    if existing_inbox:
        return _inbox_cached_result(existing_inbox)

    registry = SyncEntityRegistry.objects.filter(entity_type=entity_type, enabled=True).first()
    if not registry:
        result = {
            "client_op_id": client_op_id,
            "status": "REJECTED",
            "conflict": {"code": "C6", "message": f"Unknown entity type: {entity_type}"},
        }
        SyncInbox.objects.create(
            tenant=tenant,
            device_id=device_id,
            client_op_id=client_op_id,
            entity_type=entity_type,
            entity_id=entity_id,
            operation=operation,
            result_status=SyncInbox.Status.REJECTED,
            result_payload=result,
            conflict_code="C6",
        )
        return result

    sync_class = registry.sync_class

    if sync_class == SyncEntityRegistry.SyncClass.REFERENCE:
        result = {
            "client_op_id": client_op_id,
            "status": "REJECTED",
            "conflict": {"code": "C6", "message": "Reference entities are server-master (read-only on client push)"},
        }
        SyncInbox.objects.create(
            tenant=tenant,
            device_id=device_id,
            client_op_id=client_op_id,
            entity_type=entity_type,
            entity_id=entity_id,
            operation=operation,
            result_status=SyncInbox.Status.REJECTED,
            result_payload=result,
            conflict_code="C6",
        )
        return result

    if sync_class == SyncEntityRegistry.SyncClass.TRANSACTIONAL:
        result = {
            "client_op_id": client_op_id,
            "status": "CONFLICT",
            "conflict": {
                "code": "C4",
                "message": "Transactional posting not enabled until domain module is active (STAGE 7+)",
            },
        }
        record_conflict(
            tenant=tenant,
            entity_type=entity_type,
            entity_id=entity_id or client_op_id,
            conflict_code="C4",
            client_payload=payload,
            server_payload={},
        )
        SyncInbox.objects.create(
            tenant=tenant,
            device_id=device_id,
            client_op_id=client_op_id,
            entity_type=entity_type,
            entity_id=entity_id,
            operation=operation,
            result_status=SyncInbox.Status.CONFLICT,
            result_payload=result,
            conflict_code="C4",
        )
        return result

    record = None
    if entity_id:
        record = SyncedRecord.objects.filter(tenant=tenant, entity_type=entity_type, entity_id=entity_id).first()

    if operation == "DELETE":
        if not record:
            result = {
                "client_op_id": client_op_id,
                "status": "APPLIED",
                "server_id": entity_id,
                "row_version": 0,
            }
        else:
            record.is_deleted = True
            record.hlc_wall_ms = client_hlc.wall_ms
            record.hlc_logical = client_hlc.logical
            record.hlc_node_id = client_hlc.node_id
            record.row_version += 1
            record.save(update_fields=["is_deleted", "hlc_wall_ms", "hlc_logical", "hlc_node_id", "row_version", "updated_at"])
            _emit_outbox(tenant, entity_type, entity_id, "DELETE", {"hlc": client_hlc.as_dict()})
            result = {
                "client_op_id": client_op_id,
                "status": "APPLIED",
                "server_id": entity_id,
                "row_version": record.row_version,
            }
        SyncInbox.objects.create(
            tenant=tenant,
            device_id=device_id,
            client_op_id=client_op_id,
            entity_type=entity_type,
            entity_id=entity_id,
            operation=operation,
            result_status=SyncInbox.Status.APPLIED,
            result_payload=result,
        )
        return result

    if record and prev_row_version and record.row_version != prev_row_version:
        server_hlc = HLC(record.hlc_wall_ms, record.hlc_logical, record.hlc_node_id)
        winner = resolve_lww(client_hlc, server_hlc)
        if winner == "server":
            conflict = record_conflict(
                tenant=tenant,
                entity_type=entity_type,
                entity_id=entity_id,
                conflict_code="C2",
                client_payload=payload,
                server_payload=record.payload,
            )
            result = {
                "client_op_id": client_op_id,
                "status": "CONFLICT",
                "conflict": {
                    "code": "C2",
                    "message": "Stale row_version — server wins",
                    "server_row_version": record.row_version,
                    "server_payload": record.payload,
                    "conflict_id": str(conflict.id),
                },
            }
            SyncInbox.objects.create(
                tenant=tenant,
                device_id=device_id,
                client_op_id=client_op_id,
                entity_type=entity_type,
                entity_id=entity_id,
                operation=operation,
                result_status=SyncInbox.Status.CONFLICT,
                result_payload=result,
                conflict_code="C2",
            )
            return result

    if not entity_id:
        import uuid

        entity_id = str(uuid.uuid4())

    if record:
        if sync_class in (SyncEntityRegistry.SyncClass.DOCUMENT, SyncEntityRegistry.SyncClass.SETTINGS):
            merged = {**(record.payload or {}), **(payload or {})}
        else:
            merged = payload
        record.payload = merged
        record.is_deleted = False
        record.hlc_wall_ms = client_hlc.wall_ms
        record.hlc_logical = client_hlc.logical
        record.hlc_node_id = client_hlc.node_id
        record.row_version += 1
        record.save()
        event = "UPDATE"
    else:
        record = SyncedRecord.objects.create(
            tenant=tenant,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=payload,
            hlc_wall_ms=client_hlc.wall_ms,
            hlc_logical=client_hlc.logical,
            hlc_node_id=client_hlc.node_id,
            is_deleted=False,
        )
        event = "CREATE"

    _emit_outbox(
        tenant,
        entity_type,
        entity_id,
        event,
        {"payload": record.payload, "hlc": client_hlc.as_dict(), "row_version": record.row_version},
    )

    result = {
        "client_op_id": client_op_id,
        "status": "APPLIED",
        "server_id": entity_id,
        "row_version": record.row_version,
    }
    SyncInbox.objects.create(
        tenant=tenant,
        device_id=device_id,
        client_op_id=client_op_id,
        entity_type=entity_type,
        entity_id=entity_id,
        operation=operation,
        result_status=SyncInbox.Status.APPLIED,
        result_payload=result,
    )
    return result


def push_ops(*, tenant, device_id: str, ops: list[dict], client_hlc: dict | None) -> dict[str, Any]:
    from apps.sync.services.handshake import validate_client_clock

    client = hlc_from_dict(client_hlc)
    clock_error = validate_client_clock(client)
    if clock_error:
        return {"success": False, "error": clock_error}

    sorted_ops = sorted(ops, key=lambda o: (hlc_from_dict(o.get("hlc")).wall_ms, hlc_from_dict(o.get("hlc")).logical))
    results = [apply_push_op(tenant=tenant, device_id=device_id, op=op) for op in sorted_ops]
    return {"success": True, "results": results, "server_hlc": server_hlc_now().as_dict()}


def ack_ops(*, tenant, device_id: str, acked_op_ids: list[str]) -> dict[str, Any]:
    updated = SyncInbox.objects.filter(
        tenant=tenant,
        device_id=device_id,
        client_op_id__in=acked_op_ids,
    ).update(updated_at=timezone.now())
    return {"success": True, "acked_count": updated, "server_hlc": server_hlc_now().as_dict()}
