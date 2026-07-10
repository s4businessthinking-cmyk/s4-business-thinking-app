import logging
from datetime import timedelta

from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone

from apps.auth_service.models import Device, LoginHistory, UserSession
from apps.auth_service.services.throttle import AccountLockout, LoginThrottle
from apps.auth_service.services.tokens import generate_refresh_token, hash_refresh_token, issue_access_token
from apps.core.models.audit import AuditLogEntry
from apps.core.services.audit import write_audit_log
from apps.identity.models import User
from apps.rbac.services.permissions import get_user_permissions
from apps.tenancy.services.presenters import serialize_tenant
from apps.tenancy.services.resolver import TenancyError, resolve_tenant_for_user

logger = logging.getLogger(__name__)


class AuthError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


@transaction.atomic
def login_user(
    *,
    email: str,
    password: str,
    device_fingerprint: str,
    device_name: str = "",
    platform: str = "web",
    tenant_slug: str = "",
    ip_address: str | None = None,
    user_agent: str = "",
    correlation_id: str = "",
) -> dict:
    normalized_email = email.strip().lower()
    throttle = LoginThrottle(normalized_email, ip_address)
    if throttle.is_blocked():
        _log_login(None, normalized_email, LoginHistory.Result.LOCKED, ip_address, user_agent, device_fingerprint, "rate_limited")
        raise AuthError("RATE_LIMITED", "Too many login attempts. Try again later.", 429)

    user = User.objects.filter(email=normalized_email).first()
    if not user:
        throttle.record_failure()
        _log_login(None, normalized_email, LoginHistory.Result.FAIL, ip_address, user_agent, device_fingerprint, "invalid_credentials")
        raise AuthError("INVALID_CREDENTIALS", "Invalid email or password.", 401)

    if user.status == User.Status.DISABLED:
        _log_login(user, normalized_email, LoginHistory.Result.FAIL, ip_address, user_agent, device_fingerprint, "disabled")
        raise AuthError("ACCOUNT_DISABLED", "Account is disabled.", 403)

    if user.is_locked:
        _log_login(user, normalized_email, LoginHistory.Result.LOCKED, ip_address, user_agent, device_fingerprint, "locked")
        raise AuthError("ACCOUNT_LOCKED", "Account is temporarily locked.", 423)

    authed = authenticate(username=normalized_email, password=password)
    if not authed:
        AccountLockout.register_failure(user)
        throttle.record_failure()
        _log_login(user, normalized_email, LoginHistory.Result.FAIL, ip_address, user_agent, device_fingerprint, "invalid_credentials")
        raise AuthError("INVALID_CREDENTIALS", "Invalid email or password.", 401)

    if user.status == User.Status.PENDING:
        user.status = User.Status.ACTIVE
        user.save(update_fields=["status", "updated_at"])

    AccountLockout.reset(user)
    throttle.clear()

    tenant = None
    tenant_payload = None
    try:
        tenant = resolve_tenant_for_user(user=user, tenant_slug=tenant_slug or None)
        tenant_payload = serialize_tenant(tenant)
    except TenancyError:
        tenant = None

    device, _ = Device.objects.update_or_create(
        user=user,
        fingerprint=device_fingerprint[:128],
        defaults={
            "name": device_name[:128],
            "platform": platform[:64],
            "last_seen": timezone.now(),
            "revoked_at": None,
        },
    )

    refresh_raw = generate_refresh_token()
    expires_at = timezone.now() + timedelta(days=30)
    session = UserSession.objects.create(
        user=user,
        device=device,
        refresh_token_hash=hash_refresh_token(refresh_raw),
        ip_address=ip_address,
        user_agent=user_agent[:2000],
        expires_at=expires_at,
    )

    access = issue_access_token(
        user_id=user.id,
        session_id=session.id,
        device_id=device.id,
        tenant_id=tenant.id if tenant else None,
    )
    user.last_login = timezone.now()
    user.save(update_fields=["last_login", "updated_at"])

    _log_login(user, normalized_email, LoginHistory.Result.SUCCESS, ip_address, user_agent, device_fingerprint, "")
    write_audit_log(
        category=AuditLogEntry.Category.AUTH,
        action="AUTH_LOGIN_SUCCESS",
        actor_id=user.id,
        correlation_id=correlation_id,
        ip_address=ip_address,
        user_agent=user_agent,
        payload={"session_id": str(session.id), "device_id": str(device.id)},
    )

    return {
        "access_token": access,
        "refresh_token": refresh_raw,
        "token_type": "Bearer",
        "expires_in": 300,
        "user": _serialize_user(user),
        "tenant": tenant_payload,
        "permissions": sorted(get_user_permissions(user)),
    }


@transaction.atomic
def refresh_session(*, refresh_token: str, ip_address: str | None = None, user_agent: str = "") -> dict:
    token_hash = hash_refresh_token(refresh_token)
    session = UserSession.objects.select_related("user", "device").filter(refresh_token_hash=token_hash).first()
    if not session or not session.is_active:
        raise AuthError("INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired.", 401)

    user = session.user
    if user.status == User.Status.DISABLED or user.is_locked:
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at", "updated_at"])
        raise AuthError("ACCOUNT_BLOCKED", "Account is not allowed to refresh tokens.", 403)

    new_refresh = generate_refresh_token()
    session.refresh_token_hash = hash_refresh_token(new_refresh)
    session.last_used_at = timezone.now()
    session.expires_at = timezone.now() + timedelta(days=30)
    session.ip_address = ip_address or session.ip_address
    session.user_agent = user_agent[:2000] or session.user_agent
    session.save(
        update_fields=[
            "refresh_token_hash",
            "last_used_at",
            "expires_at",
            "ip_address",
            "user_agent",
            "updated_at",
        ]
    )

    access = issue_access_token(user_id=user.id, session_id=session.id, device_id=session.device_id)
    return {
        "access_token": access,
        "refresh_token": new_refresh,
        "token_type": "Bearer",
        "expires_in": 300,
    }


def logout_session(*, refresh_token: str) -> None:
    token_hash = hash_refresh_token(refresh_token)
    session = UserSession.objects.filter(refresh_token_hash=token_hash).first()
    if session and session.is_active:
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at", "updated_at"])


def _serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "status": user.status,
        "platform_role": user.platform_role,
        "email_verified": user.email_verified,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }


def _log_login(user, email, result, ip, ua, fingerprint, reason):
    LoginHistory.objects.create(
        user=user,
        email=email,
        result=result,
        ip_address=ip,
        user_agent=ua[:2000] if ua else "",
        device_fingerprint=fingerprint[:128],
        failure_reason=reason[:255],
    )
