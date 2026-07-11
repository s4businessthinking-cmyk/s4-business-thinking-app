from datetime import timedelta

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.devices.models import DesktopDevice, DeviceActivation
from apps.devices.serializers import (
    ActivationCreateSerializer,
    ActivationSerializer,
    DeviceActionSerializer,
    DeviceSerializer,
    HeartbeatSerializer,
    RedeemSerializer,
)
from apps.devices.services import provisioning, registry
from apps.devices.services.registry import resolve_update_target
from apps.rbac.services.permissions import user_has_permission
from apps.tenancy.models import Tenant
from apps.tenancy.services.resolver import (
    TenancyError,
    resolve_tenant_for_user,
    set_request_tenant,
)

# Devices considered "online" if they sent a heartbeat within this window.
ONLINE_WINDOW_SECONDS = 120


def _resolve_tenant(request):
    tenant_id = request.META.get("HTTP_X_TENANT_ID")
    tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
    tenant = resolve_tenant_for_user(user=request.user, tenant_id=tenant_id, tenant_slug=tenant_slug)
    set_request_tenant(request, tenant)
    return tenant


def _resolve_tenant_public(request):
    """Resolve tenant from headers for unauthenticated device endpoints."""
    tenant_id = request.META.get("HTTP_X_TENANT_ID")
    tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
    qs = Tenant.objects.all()
    tenant = None
    if tenant_id:
        tenant = qs.filter(id=tenant_id).first()
    elif tenant_slug:
        tenant = qs.filter(slug=tenant_slug).first()
    if not tenant:
        raise TenancyError("TENANT_NOT_FOUND", "Tenant not found (X-Tenant-Id/Slug required).", 404)
    if tenant.status in {Tenant.Status.SUSPENDED, Tenant.Status.ARCHIVED}:
        raise TenancyError("TENANT_SUSPENDED", "Tenant is not active.", 403)
    return tenant


def _tenant_error(exc):
    return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)


def _prov_error(exc):
    return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)


def _require_perm(request, code: str):
    if not user_has_permission(request.user, code):
        return Response(
            {"success": False, "error": {"code": "PERMISSION_DENIED", "message": f"Missing permission: {code}"}},
            status=403,
        )
    return None


class DeviceActivationView(APIView):
    """Create / list desktop activation codes (§20.10)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ActivationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "devices.provision")
        if denied:
            return denied
        try:
            activation = provisioning.create_activation(
                tenant=tenant,
                station_type=serializer.validated_data.get("station_type", ""),
                update_channel=serializer.validated_data.get("update_channel", ""),
                ttl_minutes=serializer.validated_data.get("ttl_minutes"),
                actor_id=getattr(request.user, "id", None),
            )
        except provisioning.ProvisioningError as exc:
            return _prov_error(exc)
        return Response({"success": True, "activation": ActivationSerializer(activation).data}, status=201)

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "devices.provision")
        if denied:
            return denied
        activations = DeviceActivation.objects.filter(tenant=tenant).order_by("-created_at")[:50]
        return Response({"success": True, "activations": ActivationSerializer(activations, many=True).data})


class DeviceRedeemView(APIView):
    """Redeem an activation code from a desktop client (first-run). Public."""

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = RedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant_public(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        try:
            device, device_key = provisioning.redeem_activation(
                tenant=tenant,
                code=serializer.validated_data["code"],
                device_uid=serializer.validated_data["device_uid"],
                name=serializer.validated_data.get("name", ""),
                platform=serializer.validated_data.get("platform", ""),
            )
        except provisioning.ProvisioningError as exc:
            return _prov_error(exc)
        return Response(
            {
                "success": True,
                "device": DeviceSerializer(device).data,
                "device_key": device_key,
                "update_target": resolve_update_target(device),
                "note": "Store device_key securely. It is shown only once.",
            },
            status=201,
        )


class DeviceHeartbeatView(APIView):
    """Desktop client heartbeat + update-target poll. Device-key authenticated."""

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = HeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant_public(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        try:
            device = registry.heartbeat(
                tenant=tenant,
                device_uid=serializer.validated_data["device_uid"],
                device_key=serializer.validated_data["device_key"],
                app_version=serializer.validated_data.get("app_version", ""),
            )
        except provisioning.ProvisioningError as exc:
            return _prov_error(exc)
        return Response(
            {
                "success": True,
                "device": DeviceSerializer(device).data,
                "update_target": resolve_update_target(device),
                "server_time": timezone.now().isoformat(),
            }
        )


class DeviceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "devices.read")
        if denied:
            return denied
        devices = DesktopDevice.objects.filter(tenant=tenant).order_by("-last_seen_at", "-created_at")[:200]
        return Response({"success": True, "devices": DeviceSerializer(devices, many=True).data})


class DeviceActionView(APIView):
    """Pin version / change channel / disable / enable a device (§20.7)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeviceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "devices.manage")
        if denied:
            return denied
        data = serializer.validated_data
        action = data["action"]
        try:
            if action == "pin_version":
                device = registry.pin_version(tenant=tenant, device_id=data["device_id"], version=data.get("version", ""))
            elif action == "set_channel":
                device = registry.set_channel(tenant=tenant, device_id=data["device_id"], channel=data.get("channel", ""))
            elif action == "disable":
                device = registry.set_status(tenant=tenant, device_id=data["device_id"], disabled=True)
            else:
                device = registry.set_status(tenant=tenant, device_id=data["device_id"], disabled=False)
        except provisioning.ProvisioningError as exc:
            return _prov_error(exc)
        return Response({"success": True, "device": DeviceSerializer(device).data})


class DeviceStatusView(APIView):
    """Summary counts for the build dashboard STAGE 12 panel."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "devices.read")
        if denied:
            return denied
        online_cutoff = timezone.now() - timedelta(seconds=ONLINE_WINDOW_SECONDS)
        base = DesktopDevice.objects.filter(tenant=tenant)
        pending_codes = DeviceActivation.objects.filter(tenant=tenant, consumed_at__isnull=True).count()
        return Response(
            {
                "success": True,
                "tenant_id": str(tenant.id),
                "total_devices": base.count(),
                "active_devices": base.filter(status=DesktopDevice.Status.ACTIVE).count(),
                "disabled_devices": base.filter(status=DesktopDevice.Status.DISABLED).count(),
                "online_devices": base.filter(last_seen_at__gte=online_cutoff).count(),
                "pending_activations": pending_codes,
                "can_read": user_has_permission(request.user, "devices.read"),
                "can_manage": user_has_permission(request.user, "devices.manage"),
                "can_provision": user_has_permission(request.user, "devices.provision"),
            }
        )
