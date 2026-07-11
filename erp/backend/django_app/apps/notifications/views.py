from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import Notification, NotificationRule
from apps.notifications.serializers import (
    MarkReadSerializer,
    NotificationSerializer,
    RuleActionSerializer,
    RuleCreateSerializer,
    RuleSerializer,
)
from apps.notifications.services import dispatch, rules
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


def _visible_qs(tenant, user):
    return Notification.objects.filter(tenant=tenant).filter(
        Q(recipient_id__isnull=True) | Q(recipient_id=user.id)
    )


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "notifications.read")
        if denied:
            return denied
        qs = _visible_qs(tenant, request.user).order_by("-created_at")
        if request.query_params.get("unread") in {"1", "true", "yes"}:
            qs = qs.filter(is_read=False)
        notifications = qs[:100]
        return Response({"success": True, "notifications": NotificationSerializer(notifications, many=True).data})


class NotificationStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "notifications.read")
        if denied:
            return denied
        visible = _visible_qs(tenant, request.user)
        return Response(
            {
                "success": True,
                "tenant_id": str(tenant.id),
                "unread_count": visible.filter(is_read=False).count(),
                "total_count": visible.count(),
                "rules_count": NotificationRule.objects.filter(tenant=tenant).count(),
                "can_read": user_has_permission(request.user, "notifications.read"),
                "can_manage": user_has_permission(request.user, "notifications.manage"),
            }
        )


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "notifications.read")
        if denied:
            return denied
        notification = dispatch.mark_read(
            tenant=tenant,
            notification_id=serializer.validated_data["notification_id"],
            user_id=request.user.id,
        )
        if not notification:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "Notification not found"}},
                status=404,
            )
        return Response({"success": True, "notification": NotificationSerializer(notification).data})


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "notifications.read")
        if denied:
            return denied
        updated = dispatch.mark_all_read(tenant=tenant, user_id=request.user.id)
        return Response({"success": True, "updated": updated})


class NotificationRuleView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "notifications.manage")
        if denied:
            return denied
        rule_qs = NotificationRule.objects.filter(tenant=tenant).order_by("-created_at")
        return Response({"success": True, "rules": RuleSerializer(rule_qs, many=True).data})

    def post(self, request):
        serializer = RuleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "notifications.manage")
        if denied:
            return denied
        data = serializer.validated_data
        if NotificationRule.objects.filter(tenant=tenant, code=data["code"]).exists():
            return Response(
                {"success": False, "error": {"code": "DUPLICATE_CODE", "message": "Rule code already exists"}},
                status=409,
            )
        rule = NotificationRule.objects.create(
            tenant=tenant,
            code=data["code"],
            name=data["name"],
            trigger_type=data.get("trigger_type", NotificationRule.TriggerType.LOW_STOCK),
            category=data.get("category"),
            severity=data.get("severity"),
            enabled=data.get("enabled", True),
            realtime=data.get("realtime", True),
            config=data.get("config") or {},
        )
        return Response({"success": True, "rule": RuleSerializer(rule).data}, status=201)


class NotificationRuleActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RuleActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "notifications.manage")
        if denied:
            return denied
        rule = NotificationRule.objects.filter(tenant=tenant, id=serializer.validated_data["rule_id"]).first()
        if not rule:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "Rule not found"}},
                status=404,
            )
        action = serializer.validated_data["action"]
        if action == "run":
            try:
                result = rules.run_rule(tenant=tenant, rule=rule)
            except rules.RuleError as exc:
                return Response(
                    {"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status
                )
            return Response({"success": True, "run": result, "rule": RuleSerializer(rule).data})

        if action == "enable":
            rule.enabled = True
        elif action == "disable":
            rule.enabled = False
        else:  # toggle
            rule.enabled = not rule.enabled
        rule.save(update_fields=["enabled", "updated_at"])
        return Response({"success": True, "rule": RuleSerializer(rule).data})
