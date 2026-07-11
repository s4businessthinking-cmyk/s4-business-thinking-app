import uuid

from django.conf import settings
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.hardening.throttling import HardeningTestThrottle
from apps.hardening.validators import DEFAULT_BLOCKED_EXTENSIONS
from apps.rbac.services.permissions import user_has_permission


class HardeningStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not user_has_permission(request.user, "hardening.read"):
            return Response(
                {"success": False, "error": {"code": "PERMISSION_DENIED", "message": "Missing permission: hardening.read"}},
                status=403,
            )
        rates = settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {})
        blocked = getattr(settings, "UPLOAD_BLOCKED_EXTENSIONS", DEFAULT_BLOCKED_EXTENSIONS)
        return Response(
            {
                "success": True,
                "throttle_rates": rates,
                "idempotency_ttl_seconds": int(getattr(settings, "IDEMPOTENCY_TTL_SECONDS", 86400)),
                "upload_blocked_extensions": sorted(blocked),
                "upload_max_bytes": int(getattr(settings, "DOCUMENTS_MAX_UPLOAD_BYTES", 10 * 1024 * 1024)),
                "uniform_errors": True,
                "self_test": {
                    "rate_limit": "/api/v1/hardening/selftest/rate-limit/",
                    "idempotency": "/api/v1/hardening/selftest/idempotency/",
                },
            }
        )


class RateLimitSelfTestView(APIView):
    """Tightly throttled endpoint (see ``hardening_test`` rate). Hammer it from
    the dashboard to observe a real 429 with the uniform error envelope."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [HardeningTestThrottle]

    def get(self, request):
        return Response(
            {
                "success": True,
                "message": "within rate limit",
                "at": timezone.now().isoformat(),
            }
        )


class IdempotencySelfTestView(APIView):
    """POST returns a fresh random value. Repeat with the same ``Idempotency-Key``
    header and the middleware returns the identical cached response."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(
            {
                "success": True,
                "value": str(uuid.uuid4()),
                "at": timezone.now().isoformat(),
                "note": "Send header 'Idempotency-Key: <same>' twice to get the same value back.",
            }
        )
