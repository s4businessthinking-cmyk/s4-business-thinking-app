"""Presence tracking (STAGE 11, ERP_ARCHITECTURE §13.8).

Presence is stored in a Redis sorted set per tenant, scored by last-seen epoch
seconds. Members are ``<user_id>:<device_id>``. A heartbeat refreshes the score;
stale members (older than the presence TTL) are pruned on read.
"""
import time

from django.conf import settings

from apps.realtime.services.redis_client import get_redis


def _presence_key(tenant_id: str) -> str:
    return f"rt:presence:{tenant_id}"


def _member(user_id: str, device_id: str) -> str:
    return f"{user_id}:{device_id or '-'}"


def mark_online(tenant_id: str, user_id: str, device_id: str) -> None:
    r = get_redis()
    key = _presence_key(tenant_id)
    ttl = int(getattr(settings, "REALTIME_PRESENCE_TTL_SECONDS", 60))
    now = int(time.time())
    r.zadd(key, {_member(user_id, device_id): now})
    r.expire(key, ttl * 4)


def mark_offline(tenant_id: str, user_id: str, device_id: str) -> None:
    r = get_redis()
    r.zrem(_presence_key(tenant_id), _member(user_id, device_id))


def online_members(tenant_id: str) -> list[str]:
    r = get_redis()
    key = _presence_key(tenant_id)
    ttl = int(getattr(settings, "REALTIME_PRESENCE_TTL_SECONDS", 60))
    cutoff = int(time.time()) - ttl
    r.zremrangebyscore(key, 0, cutoff)
    return list(r.zrange(key, 0, -1))


def online_count(tenant_id: str) -> int:
    return len(online_members(tenant_id))
