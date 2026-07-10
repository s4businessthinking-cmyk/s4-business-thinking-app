from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.sync.models import (
    SYNC_SCHEMA_VERSION,
    SyncConflict,
    SyncDeviceCursor,
    SyncEntityRegistry,
    SyncInbox,
    SyncOutbox,
    SyncedRecord,
    server_hlc_now,
)
from apps.sync.serializers import SyncAckSerializer, SyncHandshakeSerializer, SyncPullSerializer, SyncPushSerializer
from apps.sync.services.handshake import build_handshake_payload
from apps.sync.services.pull import pull_entities
from apps.sync.services.push import ack_ops, push_ops
from apps.tenancy.services.resolver import TenancyError, resolve_tenant_for_user, set_request_tenant


def _resolve_tenant(request):
    tenant_id = request.META.get("HTTP_X_TENANT_ID")
    tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
    tenant = resolve_tenant_for_user(
        user=request.user,
        tenant_id=tenant_id,
        tenant_slug=tenant_slug,
    )
    set_request_tenant(request, tenant)
    return tenant


class SyncHandshakeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SyncHandshakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)

        client_schema = int(serializer.validated_data.get("schema_version") or 0)
        reset_cursor = client_schema > 0 and client_schema < SYNC_SCHEMA_VERSION
        payload = build_handshake_payload(reset_cursor=reset_cursor)
        payload["success"] = True
        payload["tenant_id"] = str(tenant.id)
        payload["device_id"] = serializer.validated_data["device_id"]
        return Response(payload)


class SyncPullView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SyncPullSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)

        result = pull_entities(
            tenant=tenant,
            device_id=serializer.validated_data["device_id"],
            entity_types=serializer.validated_data["entity_types"],
            cursors=serializer.validated_data.get("cursors") or {},
            client_hlc=serializer.validated_data.get("client_hlc"),
        )
        status = 200 if result.get("success") else 409
        return Response(result, status=status)


class SyncPushView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SyncPushSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)

        result = push_ops(
            tenant=tenant,
            device_id=serializer.validated_data["device_id"],
            ops=serializer.validated_data["ops"],
            client_hlc=serializer.validated_data.get("client_hlc"),
        )
        status = 200 if result.get("success") else 409
        return Response(result, status=status)


class SyncAckView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SyncAckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)

        result = ack_ops(
            tenant=tenant,
            device_id=serializer.validated_data["device_id"],
            acked_op_ids=serializer.validated_data.get("acked_op_ids") or [],
        )
        return Response(result)


class SyncStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)

        device_id = request.query_params.get("device_id", "")
        pending_conflicts = SyncConflict.objects.filter(tenant=tenant, resolution="pending").count()
        inbox_pending = SyncInbox.objects.filter(tenant=tenant, result_status="CONFLICT").count()
        outbox_pending = SyncOutbox.objects.filter(tenant=tenant, consumed_at__isnull=True).count()
        replica_count = SyncedRecord.objects.filter(tenant=tenant, is_deleted=False).count()
        entity_types = list(
            SyncEntityRegistry.objects.filter(enabled=True).values_list("entity_type", flat=True)
        )

        cursor_info = []
        if device_id:
            for row in SyncDeviceCursor.objects.filter(tenant=tenant, device_id=device_id):
                cursor_info.append(
                    {
                        "entity_type": row.entity_type,
                        "cursor": {
                            "wall_ms": row.cursor_wall_ms,
                            "logical": row.cursor_logical,
                            "entity_id": row.cursor_entity_id,
                            "signature": row.cursor_signature,
                        },
                        "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
                    }
                )

        return Response(
            {
                "success": True,
                "schema_version": SYNC_SCHEMA_VERSION,
                "server_hlc": server_hlc_now().as_dict(),
                "tenant_id": str(tenant.id),
                "device_id": device_id or None,
                "entity_types": entity_types,
                "replica_count": replica_count,
                "pending_conflicts": pending_conflicts,
                "inbox_conflicts": inbox_pending,
                "outbox_pending": outbox_pending,
                "cursors": cursor_info,
            }
        )
