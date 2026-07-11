from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services import audit
from apps.rbac.services.permissions import user_has_permission
from apps.security.models import ApiKey
from apps.security.serializers import (
    ApiKeyActionSerializer,
    ApiKeyCreateSerializer,
    ApiKeySerializer,
    AuditVerifySerializer,
    SecurityPolicySerializer,
    SecurityPolicyUpdateSerializer,
)
from apps.security.services import apikeys, policy as policy_service
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


class SecurityStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "security.read")
        if denied:
            return denied
        policy = policy_service.get_or_create_policy(tenant)
        return Response(
            {
                "success": True,
                "tenant_id": str(tenant.id),
                "api_keys_active": ApiKey.objects.filter(tenant=tenant, enabled=True).count(),
                "api_keys_total": ApiKey.objects.filter(tenant=tenant).count(),
                "require_mfa": policy.require_mfa,
                "can_read": user_has_permission(request.user, "security.read"),
                "can_manage": user_has_permission(request.user, "security.manage"),
                "can_verify_audit": user_has_permission(request.user, "audit.verify"),
            }
        )


class SecurityPolicyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "security.read")
        if denied:
            return denied
        policy = policy_service.get_or_create_policy(tenant)
        return Response({"success": True, "policy": SecurityPolicySerializer(policy).data})

    def post(self, request):
        serializer = SecurityPolicyUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "security.manage")
        if denied:
            return denied
        policy = policy_service.update_policy(tenant, serializer.validated_data, updated_by=request.user.id)
        return Response({"success": True, "policy": SecurityPolicySerializer(policy).data})


class ApiKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "security.read")
        if denied:
            return denied
        keys = ApiKey.objects.filter(tenant=tenant).order_by("-created_at")[:100]
        return Response({"success": True, "keys": ApiKeySerializer(keys, many=True).data})

    def post(self, request):
        serializer = ApiKeyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "security.manage")
        if denied:
            return denied
        raw, api_key = apikeys.generate_key(
            tenant=tenant,
            name=serializer.validated_data["name"],
            scopes=serializer.validated_data.get("scopes") or [],
            created_by=request.user.id,
        )
        # raw key returned exactly once — never persisted in plaintext.
        return Response(
            {"success": True, "api_key": ApiKeySerializer(api_key).data, "secret": raw},
            status=201,
        )


class ApiKeyActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ApiKeyActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "security.manage")
        if denied:
            return denied
        api_key = ApiKey.objects.filter(tenant=tenant, id=serializer.validated_data["key_id"]).first()
        if not api_key:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "API key not found"}},
                status=404,
            )
        apikeys.revoke_key(api_key)
        return Response({"success": True, "api_key": ApiKeySerializer(api_key).data})


class AuditVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AuditVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "audit.verify")
        if denied:
            return denied
        result = audit.verify_chain(limit=serializer.validated_data.get("limit"))
        return Response({"success": True, "verify": result})
