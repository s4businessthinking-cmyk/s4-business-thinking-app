from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.approvals.models import ApprovalRequest, ApprovalStep, ApprovalWorkflow
from apps.approvals.serializers import (
    ActionSerializer,
    RequestSerializer,
    StepSerializer,
    SubmitSerializer,
    WorkflowCreateSerializer,
    WorkflowSerializer,
)
from apps.approvals.services import engine
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


class WorkflowView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "approvals.read")
        if denied:
            return denied
        workflows = ApprovalWorkflow.objects.filter(tenant=tenant).prefetch_related("steps").order_by("-created_at")
        return Response({"success": True, "workflows": WorkflowSerializer(workflows, many=True).data})

    @transaction.atomic
    def post(self, request):
        serializer = WorkflowCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "approvals.manage")
        if denied:
            return denied
        data = serializer.validated_data
        if ApprovalWorkflow.objects.filter(tenant=tenant, code=data["code"]).exists():
            return Response(
                {"success": False, "error": {"code": "DUPLICATE_CODE", "message": "Workflow code exists"}},
                status=409,
            )
        workflow = ApprovalWorkflow.objects.create(
            tenant=tenant,
            code=data["code"],
            name=data["name"],
            document_type=data.get("document_type"),
            enabled=data.get("enabled", True),
            min_amount=data.get("min_amount", 0),
        )
        for idx, step in enumerate(data.get("steps") or [], start=1):
            ApprovalStep.objects.create(
                tenant=tenant,
                workflow=workflow,
                sequence=int(step.get("sequence", idx)),
                name=str(step.get("name", f"Step {idx}"))[:128],
                approver_role=str(step.get("approver_role", ""))[:64],
            )
        workflow.refresh_from_db()
        return Response({"success": True, "workflow": WorkflowSerializer(workflow).data}, status=201)


class WorkflowStepView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, workflow_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "approvals.manage")
        if denied:
            return denied
        workflow = ApprovalWorkflow.objects.filter(tenant=tenant, id=workflow_id).first()
        if not workflow:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "Workflow not found"}}, status=404
            )
        sequence = int(request.data.get("sequence") or (ApprovalStep.objects.filter(workflow=workflow).count() + 1))
        if ApprovalStep.objects.filter(workflow=workflow, sequence=sequence).exists():
            return Response(
                {"success": False, "error": {"code": "DUPLICATE_SEQUENCE", "message": "Step sequence exists"}},
                status=409,
            )
        step = ApprovalStep.objects.create(
            tenant=tenant,
            workflow=workflow,
            sequence=sequence,
            name=str(request.data.get("name", f"Step {sequence}"))[:128],
            approver_role=str(request.data.get("approver_role", ""))[:64],
        )
        return Response({"success": True, "step": StepSerializer(step).data}, status=201)


class RequestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "approvals.read")
        if denied:
            return denied
        qs = ApprovalRequest.objects.filter(tenant=tenant).prefetch_related("actions").order_by("-created_at")
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({"success": True, "requests": RequestSerializer(qs[:100], many=True).data})

    def post(self, request):
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "approvals.read")
        if denied:
            return denied
        try:
            appr = engine.submit(
                tenant=tenant,
                document_type=serializer.validated_data.get("document_type"),
                document_id=serializer.validated_data["document_id"],
                requested_by=request.user.id,
                amount=serializer.validated_data.get("amount", 0),
            )
        except engine.ApprovalError as exc:
            return Response(
                {"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status
            )
        return Response({"success": True, "request": RequestSerializer(appr).data}, status=201)


class RequestActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "approvals.act")
        if denied:
            return denied
        try:
            appr = engine.act(
                tenant=tenant,
                request_id=serializer.validated_data["request_id"],
                actor_id=request.user.id,
                decision=serializer.validated_data["decision"],
                comment=serializer.validated_data.get("comment", ""),
            )
        except engine.ApprovalError as exc:
            return Response(
                {"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status
            )
        return Response({"success": True, "request": RequestSerializer(appr).data})


class ApprovalStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "approvals.read")
        if denied:
            return denied
        base = ApprovalRequest.objects.filter(tenant=tenant)
        return Response(
            {
                "success": True,
                "tenant_id": str(tenant.id),
                "workflows": ApprovalWorkflow.objects.filter(tenant=tenant).count(),
                "pending": base.filter(status=ApprovalRequest.Status.PENDING).count(),
                "approved": base.filter(status=ApprovalRequest.Status.APPROVED).count(),
                "rejected": base.filter(status=ApprovalRequest.Status.REJECTED).count(),
                "can_manage": user_has_permission(request.user, "approvals.manage"),
                "can_act": user_has_permission(request.user, "approvals.act"),
            }
        )
