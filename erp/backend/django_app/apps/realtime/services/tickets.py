"""Short-lived, single-use WebSocket tickets (STAGE 11, ERP_ARCHITECTURE §13.3).

The main JWT access token is never sent over the WebSocket. Instead an
authenticated REST call issues a random, single-use ticket (default 30s TTL)
stored in the Redis-backed Django cache. The WS consumer consumes (deletes) the
ticket on connect, binding the connection to (tenant, user, device).
"""
import secrets

from django.conf import settings
from django.core.cache import cache

_TICKET_PREFIX = "ws_ticket:"


def _ticket_key(token: str) -> str:
    return f"{_TICKET_PREFIX}{token}"


def issue_ticket(*, user_id: str, tenant_id: str, device_id: str, email: str = "") -> dict:
    token = secrets.token_urlsafe(32)
    ttl = int(getattr(settings, "REALTIME_WS_TICKET_TTL_SECONDS", 30))
    payload = {
        "user_id": str(user_id),
        "tenant_id": str(tenant_id),
        "device_id": str(device_id or ""),
        "email": email or "",
    }
    cache.set(_ticket_key(token), payload, timeout=ttl)
    return {"ticket": token, "expires_in": ttl}


def consume_ticket(token: str) -> dict | None:
    """Return ticket payload and delete it (single-use). None if invalid/expired."""
    if not token:
        return None
    key = _ticket_key(token)
    payload = cache.get(key)
    if payload is None:
        return None
    cache.delete(key)
    return payload
