import json

from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.rbac.services.permissions import user_has_permission
from apps.realtime.serializers import (
    PublishTestSerializer,
    RelayOutboxSerializer,
    WsTicketSerializer,
)
from apps.realtime.services.presence import online_count, online_members
from apps.realtime.services.publisher import publish_event
from apps.realtime.services.relay import relay_tenant_outbox
from apps.realtime.services.replay import read_since
from apps.realtime.services.tickets import consume_ticket, issue_ticket
from apps.sync.models import SyncOutbox
from apps.tenancy.services.resolver import (
    TenancyError,
    resolve_tenant_for_user,
    set_request_tenant,
)


def _resolve_tenant(request):
    tenant_id = request.META.get("HTTP_X_TENANT_ID")
    tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
    tenant = resolve_tenant_for_user(user=request.user, tenant_id=tenant_id, tenant_slug=tenant_slug)
    set_request_tenant(request, tenant)
    return tenant


def _tenant_error(exc):
    return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)


def _require_perm(request, code: str):
    if not user_has_permission(request.user, code):
        return Response(
            {"success": False, "error": {"code": "PERMISSION_DENIED", "message": f"Missing permission: {code}"}},
            status=403,
        )
    return None


class WsTicketView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = WsTicketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)

        device_id = serializer.validated_data.get("device_id") or getattr(request, "auth_device_id", "") or ""
        result = issue_ticket(
            user_id=str(request.user.id),
            tenant_id=str(tenant.id),
            device_id=str(device_id),
            email=getattr(request.user, "email", ""),
        )
        return Response(
            {
                "success": True,
                "ticket": result["ticket"],
                "expires_in": result["expires_in"],
                "ws_path": "/ws/realtime/",
                "tenant_id": str(tenant.id),
                "device_id": str(device_id),
            }
        )


class RealtimeRelayView(APIView):
    """Drain unconsumed sync outbox rows for the tenant into realtime events."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RelayOutboxSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "realtime.publish")
        if denied:
            return denied
        result = relay_tenant_outbox(tenant=tenant, batch_size=serializer.validated_data["batch_size"])
        return Response({"success": True, **result})


class RealtimePublishTestView(APIView):
    """Publish a single ad-hoc event (used by the build dashboard live test)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PublishTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "realtime.publish")
        if denied:
            return denied
        envelope = publish_event(
            tenant_id=str(tenant.id),
            logical_group=serializer.validated_data["group"] or "tenant",
            event_type=serializer.validated_data["event_type"],
            payload={
                "message": serializer.validated_data.get("message") or "",
                "actor": getattr(request.user, "email", ""),
            },
        )
        return Response({"success": True, "envelope": envelope})


class RealtimeStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        outbox_pending = SyncOutbox.objects.filter(tenant=tenant, consumed_at__isnull=True).count()
        return Response(
            {
                "success": True,
                "tenant_id": str(tenant.id),
                "presence_online": online_count(str(tenant.id)),
                "presence_members": online_members(str(tenant.id)),
                "outbox_pending": outbox_pending,
                "ws_path": "/ws/realtime/",
                "can_publish": user_has_permission(request.user, "realtime.publish"),
                "can_subscribe": user_has_permission(request.user, "realtime.subscribe"),
            }
        )


class RealtimeSseView(APIView):
    """SSE fallback (ERP_ARCHITECTURE §13.7) for networks that block WebSockets.

    Ticket + group are passed as query params. Returns a bounded snapshot of
    events since ``last_event_id`` in text/event-stream format, then closes so
    the client reconnects. This is a degraded fallback, not a long-lived stream.
    """

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        token = request.query_params.get("ticket", "")
        ticket = consume_ticket(token)
        if not ticket:
            return Response(
                {"success": False, "error": {"code": "INVALID_TICKET", "message": "Invalid or expired ticket"}},
                status=401,
            )
        tenant_id = str(ticket["tenant_id"])
        logical = request.query_params.get("group", "tenant") or "tenant"
        last_event_id = int(request.query_params.get("last_event_id") or 0)
        events = read_since(tenant_id, logical, last_event_id)

        def stream():
            yield "retry: 3000\n\n"
            for env in events:
                yield f"id: {env.get('seq', 0)}\nevent: {env.get('type', 'message')}\n"
                yield f"data: {json.dumps(env)}\n\n"
            yield ": end-of-snapshot\n\n"

        response = StreamingHttpResponse(stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
