"""Idempotency middleware (STAGE 16, ERP_ARCHITECTURE §8/§28.3).

Any mutating request (POST/PUT/PATCH) carrying an ``Idempotency-Key`` header has
its successful response cached (Redis) for a TTL. A replay with the same key +
method + path + credentials returns the stored response verbatim, marked with
``X-Idempotent-Replay: true`` — so retried writes never double-apply at the edge.
Requests without the header are completely unaffected.
"""
import hashlib

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse

_MUTATING = {"POST", "PUT", "PATCH"}


class IdempotencyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = request.META.get("HTTP_IDEMPOTENCY_KEY", "").strip()
        method = (request.method or "GET").upper()
        if not key or method not in _MUTATING:
            return self.get_response(request)

        cache_key = self._cache_key(request, key)
        cached = cache.get(cache_key)
        if cached:
            response = HttpResponse(
                cached["content"],
                status=cached["status"],
                content_type=cached["content_type"],
            )
            response["X-Idempotent-Replay"] = "true"
            return response

        response = self.get_response(request)
        try:
            status_code = getattr(response, "status_code", 500)
            if 200 <= status_code < 300 and not getattr(response, "streaming", False) and hasattr(response, "content"):
                ttl = int(getattr(settings, "IDEMPOTENCY_TTL_SECONDS", 86400))
                cache.set(
                    cache_key,
                    {
                        "content": response.content,
                        "status": status_code,
                        "content_type": response.get("Content-Type", "application/json"),
                    },
                    ttl,
                )
        except Exception:
            # Never let idempotency bookkeeping break the actual response.
            pass
        return response

    def _cache_key(self, request, key: str) -> str:
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        tenant = request.META.get("HTTP_X_TENANT_ID", "")
        raw = f"{request.method}|{request.path}|{key}|{tenant}|{auth}"
        return "idem:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()
