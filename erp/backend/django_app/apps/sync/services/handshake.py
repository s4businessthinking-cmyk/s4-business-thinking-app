from typing import Any

from apps.sync.models import HLC, SYNC_SCHEMA_VERSION, SyncEntityRegistry, server_hlc_now

MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
PULL_PAGE_SIZE = 500


def validate_client_clock(client_hlc: HLC) -> dict[str, Any] | None:
    server = server_hlc_now()
    skew = abs(server.wall_ms - client_hlc.wall_ms)
    if skew > MAX_CLOCK_SKEW_MS:
        return {
            "code": "C3",
            "message": f"Client clock skew {skew}ms exceeds allowed {MAX_CLOCK_SKEW_MS}ms",
            "server_hlc": server.as_dict(),
        }
    return None


def build_handshake_payload(*, reset_cursor: bool = False) -> dict[str, Any]:
    entities = SyncEntityRegistry.objects.filter(enabled=True).order_by("entity_type")
    entity_classes = [
        {
            "entity_type": row.entity_type,
            "sync_class": row.sync_class,
            "merge_strategy": row.merge_strategy,
            "direction": row.direction,
        }
        for row in entities
    ]
    server = server_hlc_now()
    return {
        "schema_version": SYNC_SCHEMA_VERSION,
        "server_time": server.wall_ms,
        "server_hlc": server.as_dict(),
        "entity_classes": entity_classes,
        "reset_cursor": reset_cursor,
        "policy": {
            "max_clock_skew_ms": MAX_CLOCK_SKEW_MS,
            "pull_page_size": PULL_PAGE_SIZE,
            "conflict_codes": ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11"],
        },
    }
