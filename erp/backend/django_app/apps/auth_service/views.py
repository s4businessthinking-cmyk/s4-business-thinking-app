from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auth_service.models import UserSession
from apps.auth_service.serializers import LoginSerializer, LogoutSerializer, RefreshSerializer, RevokeSessionSerializer
from apps.auth_service.services.auth import AuthError, login_user, logout_session, refresh_session
from apps.rbac.services.permissions import get_user_permissions


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = login_user(
                email=data["email"],
                password=data["password"],
                device_fingerprint=data["device_fingerprint"],
                device_name=data.get("device_name", ""),
                platform=data.get("platform", "web"),
                tenant_slug=data.get("tenant_slug", ""),
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                correlation_id=getattr(request, "correlation_id", ""),
            )
        except AuthError as exc:
            return Response(
                {"success": False, "error": {"code": exc.code, "message": exc.message}},
                status=exc.status,
            )
        return Response({"success": True, **result})


class RefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = refresh_session(
                refresh_token=serializer.validated_data["refresh_token"],
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except AuthError as exc:
            return Response(
                {"success": False, "error": {"code": exc.code, "message": exc.message}},
                status=exc.status,
            )
        return Response({"success": True, **result})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        logout_session(refresh_token=serializer.validated_data["refresh_token"])
        return Response({"success": True, "message": "Logged out"})


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        user = request.user
        return Response(
            {
                "success": True,
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "status": user.status,
                    "platform_role": user.platform_role,
                    "email_verified": user.email_verified,
                    "last_login": user.last_login.isoformat() if user.last_login else None,
                },
                "permissions": sorted(get_user_permissions(user)),
            }
        )


class SessionsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        sessions = (
            UserSession.objects.select_related("device")
            .filter(user=request.user)
            .order_by("-last_used_at")[:20]
        )
        current_id = getattr(request, "auth_session_id", None)
        payload = []
        for s in sessions:
            payload.append(
                {
                    "id": str(s.id),
                    "device_name": s.device.name,
                    "platform": s.device.platform,
                    "ip_address": s.ip_address,
                    "last_used_at": s.last_used_at.isoformat(),
                    "expires_at": s.expires_at.isoformat(),
                    "active": s.is_active,
                    "current": str(s.id) == current_id,
                }
            )
        return Response({"success": True, "sessions": payload})


class RevokeSessionView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        serializer = RevokeSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = UserSession.objects.filter(id=serializer.validated_data["session_id"], user=request.user).first()
        if not session:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "Session not found"}},
                status=status.HTTP_404_NOT_FOUND,
            )
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at", "updated_at"])
        return Response({"success": True, "message": "Session revoked"})
