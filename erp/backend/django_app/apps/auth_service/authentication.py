from django.utils import timezone
from rest_framework import authentication, exceptions

from apps.auth_service.models import UserSession
from apps.auth_service.services.tokens import decode_access_token
from apps.identity.models import User


class JWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("utf-8")
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            return None
        token = parts[1]
        try:
            payload = decode_access_token(token)
        except Exception as exc:
            raise exceptions.AuthenticationFailed("Invalid or expired access token") from exc

        if payload.get("typ") != "access":
            raise exceptions.AuthenticationFailed("Invalid token type")

        tid = payload.get("tid")
        if tid:
            from apps.tenancy.context import TenantContext

            TenantContext.set(tenant_id=str(tid))

        try:
            user = User.objects.get(id=payload["sub"])
        except User.DoesNotExist as exc:
            raise exceptions.AuthenticationFailed("User not found") from exc

        if user.status == User.Status.DISABLED:
            raise exceptions.AuthenticationFailed("Account disabled")

        session = UserSession.objects.filter(id=payload["sid"], user=user, revoked_at__isnull=True).first()
        if not session or not session.is_active:
            raise exceptions.AuthenticationFailed("Session expired or revoked")

        request.auth_session_id = str(session.id)
        request.auth_device_id = payload.get("did")
        return user, payload
