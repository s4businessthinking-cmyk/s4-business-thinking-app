from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backup.models import BackupJob
from apps.backup.serializers import (
    BackupActionSerializer,
    BackupCreateSerializer,
    BackupJobSerializer,
)
from apps.backup.services import runner
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


def _scoped_qs(tenant):
    # A tenant admin sees their per-tenant exports plus system-wide full backups.
    from django.db.models import Q

    return BackupJob.objects.filter(Q(tenant=tenant) | Q(tenant__isnull=True))


class BackupStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "backup.read")
        if denied:
            return denied
        qs = _scoped_qs(tenant)
        last_success = qs.filter(status=BackupJob.Status.SUCCESS).order_by("-created_at").first()
        return Response(
            {
                "success": True,
                "tenant_id": str(tenant.id),
                "total_jobs": qs.count(),
                "success_count": qs.filter(status=BackupJob.Status.SUCCESS).count(),
                "failed_count": qs.filter(status=BackupJob.Status.FAILED).count(),
                "last_success_at": last_success.finished_at if last_success else None,
                "last_success_size": last_success.size_bytes if last_success else 0,
                "can_read": user_has_permission(request.user, "backup.read"),
                "can_manage": user_has_permission(request.user, "backup.manage"),
            }
        )


class BackupListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "backup.read")
        if denied:
            return denied
        jobs = _scoped_qs(tenant).order_by("-created_at")[:100]
        return Response({"success": True, "jobs": BackupJobSerializer(jobs, many=True).data})


class BackupCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = BackupCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "backup.manage")
        if denied:
            return denied
        data = serializer.validated_data
        backup_type = data.get("backup_type", BackupJob.BackupType.FULL)
        job = runner.create_backup(
            tenant=tenant if backup_type == BackupJob.BackupType.TENANT else None,
            backup_type=backup_type,
            method=data.get("method"),
            triggered_by=request.user.id,
        )
        status = 201 if job.status == BackupJob.Status.SUCCESS else 200
        return Response({"success": job.status == BackupJob.Status.SUCCESS, "job": BackupJobSerializer(job).data}, status=status)


class BackupActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = BackupActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "backup.manage")
        if denied:
            return denied
        job = _scoped_qs(tenant).filter(id=serializer.validated_data["job_id"]).first()
        if not job:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "Backup job not found"}},
                status=404,
            )
        result = runner.verify_backup(job)
        return Response({"success": True, "verify": result, "job": BackupJobSerializer(job).data})
