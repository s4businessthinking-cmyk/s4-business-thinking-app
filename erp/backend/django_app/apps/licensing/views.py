from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.licensing.models import LicenseDevice
from apps.licensing.serializers import ActivateLicenseSerializer
from apps.licensing.services.activation import activate_tenant_license, serialize_license_status
from apps.tenancy.services.resolver import TenancyError, resolve_tenant_for_user, set_request_tenant


class LicenseStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.META.get("HTTP_X_TENANT_ID")
        tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
        try:
            tenant = resolve_tenant_for_user(
                user=request.user,
                tenant_id=tenant_id,
                tenant_slug=tenant_slug,
            )
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)

        set_request_tenant(request, tenant)
        active_devices = LicenseDevice.objects.filter(tenant=tenant, revoked_at__isnull=True).count()
        return Response({"success": True, "license": serialize_license_status(tenant, active_devices=active_devices)})


class LicenseActivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ActivateLicenseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tenant_id = request.META.get("HTTP_X_TENANT_ID")
        tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
        try:
            tenant = resolve_tenant_for_user(
                user=request.user,
                tenant_id=tenant_id,
                tenant_slug=tenant_slug,
            )
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)

        result = activate_tenant_license(
            tenant=tenant,
            license_key=serializer.validated_data["license_key"],
            device_fingerprint=serializer.validated_data["device_fingerprint"],
            device_name=serializer.validated_data.get("device_name", ""),
            platform=serializer.validated_data.get("platform", "web"),
            actor_id=request.user.id,
            correlation_id=getattr(request, "correlation_id", ""),
        )
        status = 200 if result.get("success") else 400
        return Response(result, status=status)
