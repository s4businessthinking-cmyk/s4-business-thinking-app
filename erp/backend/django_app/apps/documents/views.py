import base64

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.documents.models import Attachment
from apps.documents.serializers import AttachmentSerializer, AttachmentUploadSerializer
from apps.documents.services import attachments
from apps.rbac.services.permissions import user_has_permission
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


class AttachmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "documents.read")
        if denied:
            return denied
        qs = Attachment.objects.filter(tenant=tenant, is_deleted=False)
        entity_type = request.query_params.get("entity_type")
        entity_id = request.query_params.get("entity_id")
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        qs = qs.order_by("-created_at")[:200]
        return Response({"success": True, "attachments": AttachmentSerializer(qs, many=True).data})

    def post(self, request):
        serializer = AttachmentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "documents.manage")
        if denied:
            return denied
        try:
            attachment = attachments.create_attachment(
                tenant=tenant,
                entity_type=serializer.validated_data["entity_type"],
                entity_id=serializer.validated_data["entity_id"],
                filename=serializer.validated_data["filename"],
                content_type=serializer.validated_data.get("content_type", ""),
                content_base64=serializer.validated_data["content_base64"],
                uploaded_by=request.user.id,
            )
        except attachments.AttachmentError as exc:
            return Response(
                {"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status
            )
        return Response({"success": True, "attachment": AttachmentSerializer(attachment).data}, status=201)


class AttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attachment_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "documents.read")
        if denied:
            return denied
        attachment = Attachment.objects.filter(tenant=tenant, id=attachment_id, is_deleted=False).first()
        if not attachment:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "Attachment not found"}}, status=404
            )
        try:
            data = attachments.read_attachment_bytes(attachment)
        except FileNotFoundError:
            return Response(
                {"success": False, "error": {"code": "CONTENT_MISSING", "message": "Stored file missing"}},
                status=410,
            )
        # JSON response with base64 keeps parity with the JSON-only API + dashboard.
        if request.query_params.get("raw") in {"1", "true"}:
            response = HttpResponse(data, content_type=attachment.content_type)
            response["Content-Disposition"] = f'attachment; filename="{attachment.filename}"'
            return response
        return Response(
            {
                "success": True,
                "attachment": AttachmentSerializer(attachment).data,
                "content_base64": base64.b64encode(data).decode("ascii"),
            }
        )


class AttachmentDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, attachment_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "documents.manage")
        if denied:
            return denied
        attachment = Attachment.objects.filter(tenant=tenant, id=attachment_id, is_deleted=False).first()
        if not attachment:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "Attachment not found"}}, status=404
            )
        attachments.soft_delete(attachment)
        return Response({"success": True})


class DocumentsStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "documents.read")
        if denied:
            return denied
        qs = Attachment.objects.filter(tenant=tenant, is_deleted=False)
        total_size = sum(qs.values_list("size_bytes", flat=True))
        return Response(
            {
                "success": True,
                "tenant_id": str(tenant.id),
                "attachment_count": qs.count(),
                "total_bytes": total_size,
                "can_manage": user_has_permission(request.user, "documents.manage"),
            }
        )
