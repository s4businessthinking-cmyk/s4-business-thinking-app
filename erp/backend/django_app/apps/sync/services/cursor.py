import hashlib
import hmac
import json
from typing import Any

from django.conf import settings


def _signing_key() -> bytes:
    return str(settings.SECRET_KEY).encode("utf-8")


def sign_cursor(tenant_id: str, device_id: str, entity_type: str, wall_ms: int, logical: int, entity_id: str) -> str:
    payload = json.dumps(
        {
            "tenant_id": str(tenant_id),
            "device_id": device_id,
            "entity_type": entity_type,
            "wall_ms": wall_ms,
            "logical": logical,
            "entity_id": entity_id,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hmac.new(_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest


def verify_cursor(
    tenant_id: str,
    device_id: str,
    entity_type: str,
    wall_ms: int,
    logical: int,
    entity_id: str,
    signature: str,
) -> bool:
    if not signature:
        return False
    expected = sign_cursor(tenant_id, device_id, entity_type, wall_ms, logical, entity_id)
    return hmac.compare_digest(expected, signature)
