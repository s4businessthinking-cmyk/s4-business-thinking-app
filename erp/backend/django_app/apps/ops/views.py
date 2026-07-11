from django.conf import settings
from django.http import HttpResponse
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services.health import aggregate_health, load_build_state
from apps.ops import metrics
from apps.rbac.services.permissions import user_has_permission


def _health_gauges() -> list:
    health = aggregate_health()
    samples = []
    for svc in health.get("services", []):
        name = svc.get("name", "unknown")
        samples.append({
            "name": "s4_service_up",
            "labels": {"service": name},
            "value": 1 if svc.get("status") == "up" else 0,
            "help": "Service health (1=up, 0=down).",
        })
        if "latency_ms" in svc:
            samples.append({
                "name": "s4_service_latency_ms",
                "labels": {"service": name},
                "value": svc["latency_ms"],
                "help": "Service health-check latency in ms.",
            })
        if "worker_count" in svc:
            samples.append({
                "name": "s4_celery_worker_count",
                "labels": None,
                "value": svc["worker_count"],
                "help": "Number of live Celery workers.",
            })
    samples.append({"name": "s4_ready", "labels": None, "value": 1 if health.get("ready") else 0, "help": "Overall readiness (1=ready)."})
    try:
        state = load_build_state()
        if isinstance(state.get("current_stage"), int):
            samples.append({"name": "s4_build_stage", "labels": None, "value": state["current_stage"], "help": "Current ERP build stage."})
    except Exception:
        pass
    return samples


class MetricsView(APIView):
    """Prometheus scrape endpoint (§16.4). Open by default; optionally gated by
    ``METRICS_TOKEN`` (Bearer) for internet-exposed deployments."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        if not getattr(settings, "METRICS_ENABLED", True):
            return HttpResponse("metrics disabled\n", status=404, content_type="text/plain")

        token = getattr(settings, "METRICS_TOKEN", "")
        if token:
            auth = request.META.get("HTTP_AUTHORIZATION", "")
            if auth != f"Bearer {token}":
                return HttpResponse("unauthorized\n", status=401, content_type="text/plain")

        body = metrics.render(extra=_health_gauges())
        return HttpResponse(body, content_type="text/plain; version=0.0.4; charset=utf-8")


class OpsStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not user_has_permission(request.user, "ops.read"):
            return Response(
                {"success": False, "error": {"code": "PERMISSION_DENIED", "message": "Missing permission: ops.read"}},
                status=403,
            )
        health = aggregate_health()
        return Response(
            {
                "success": True,
                "app_version": settings.ERP_APP_VERSION,
                "ready": health["ready"],
                "status": health["status"],
                "services": health["services"],
                "metrics": metrics.snapshot(),
                "metrics_endpoint": "/api/v1/metrics/",
                "metrics_protected": bool(getattr(settings, "METRICS_TOKEN", "")),
            }
        )
