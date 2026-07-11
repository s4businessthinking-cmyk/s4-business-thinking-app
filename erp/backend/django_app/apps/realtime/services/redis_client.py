"""Shared raw Redis client for realtime ring buffer + presence.

The Django cache backend does not expose list/sorted-set operations, so the
realtime replay ring buffer and presence sets use a dedicated Redis client
built from the same REDIS_URL used by the cache and channel layer.
"""
import redis
from django.conf import settings

_client = None


def get_redis():
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
    return _client
