from apps.sync.models import SyncConflict


def resolve_lww(client_hlc, server_hlc) -> str:
    cmp = client_hlc.compare(server_hlc)
    if cmp >= 0:
        return "client"
    return "server"


def record_conflict(
    *,
    tenant,
    entity_type: str,
    entity_id: str,
    conflict_code: str,
    client_payload: dict,
    server_payload: dict,
) -> SyncConflict:
    return SyncConflict.objects.create(
        tenant=tenant,
        entity_type=entity_type,
        entity_id=entity_id,
        conflict_code=conflict_code,
        client_payload=client_payload,
        server_payload=server_payload,
        resolution="pending",
    )
