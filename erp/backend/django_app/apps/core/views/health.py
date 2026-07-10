from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import AuditLogEntry
from apps.core.services.audit import write_audit_log
from apps.core.services.health import aggregate_health, load_build_state


class LiveHealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "success": True,
                "status": "alive",
                "timestamp": timezone.now().isoformat(),
            }
        )


class ReadyHealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        health = aggregate_health()
        code = status.HTTP_200_OK if health["ready"] else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response({"success": health["ready"], **health}, status=code)


class FullHealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        health = aggregate_health()
        write_audit_log(
            category=AuditLogEntry.Category.HEALTH,
            action="HEALTH_CHECK",
            correlation_id=getattr(request, "correlation_id", ""),
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            payload={"status": health["status"], "ready": health["ready"]},
        )
        code = status.HTTP_200_OK if health["ready"] else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response({"success": health["ready"], **health}, status=code)


class BuildStatusView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        state = load_build_state()
        health = aggregate_health()
        return Response(
            {
                "success": True,
                "architecture_locked": True,
                "backend": health,
                "build": state,
                "timestamp": timezone.now().isoformat(),
            }
        )
