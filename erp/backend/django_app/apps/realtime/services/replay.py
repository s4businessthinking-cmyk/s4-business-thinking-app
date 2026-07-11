"""Replay ring buffer (STAGE 11, ERP_ARCHITECTURE §13.7).

Each logical group keeps a short, bounded, TTL'd ring buffer in Redis so a
client reconnecting with ``last_event_id`` (a monotonic per-group sequence) can
replay recently missed events without a full REST refresh.
"""
import json

from django.conf import settings

from apps.realtime.services.redis_client import get_redis


def _ring_key(tenant_id: str, logical_group: str) -> str:
    return f"rt:ring:{tenant_id}:{logical_group}"


def _seq_key(tenant_id: str, logical_group: str) -> str:
    return f"rt:seq:{tenant_id}:{logical_group}"


def next_seq(tenant_id: str, logical_group: str) -> int:
    r = get_redis()
    return int(r.incr(_seq_key(tenant_id, logical_group)))


def append_event(tenant_id: str, logical_group: str, envelope: dict) -> None:
    r = get_redis()
    key = _ring_key(tenant_id, logical_group)
    size = int(getattr(settings, "REALTIME_RING_BUFFER_SIZE", 200))
    ttl = int(getattr(settings, "REALTIME_RING_BUFFER_TTL_SECONDS", 600))
    pipe = r.pipeline()
    pipe.lpush(key, json.dumps(envelope))
    pipe.ltrim(key, 0, size - 1)
    pipe.expire(key, ttl)
    pipe.execute()


def read_since(tenant_id: str, logical_group: str, last_event_seq: int = 0, limit: int = 200) -> list[dict]:
    """Return events with seq > last_event_seq, oldest first."""
    r = get_redis()
    key = _ring_key(tenant_id, logical_group)
    raw_items = r.lrange(key, 0, limit - 1)  # newest first
    events: list[dict] = []
    for raw in raw_items:
        try:
            env = json.loads(raw)
        except (ValueError, TypeError):
            continue
        if int(env.get("seq") or 0) > int(last_event_seq or 0):
            events.append(env)
    events.sort(key=lambda e: int(e.get("seq") or 0))
    return events
