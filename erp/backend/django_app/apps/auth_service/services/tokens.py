import base64
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone as dt_timezone

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


def _load_private_key():
    pem = getattr(settings, "JWT_RSA_PRIVATE_KEY", "")
    if pem:
        return serialization.load_pem_private_key(pem.encode("utf-8"), password=None)
    if settings.DEBUG:
        logger.warning("JWT_RSA_PRIVATE_KEY missing; generating ephemeral dev key")
        return rsa.generate_private_key(public_exponent=65537, key_size=2048)
    raise RuntimeError("JWT_RSA_PRIVATE_KEY is required in production")


def _load_public_key():
    pem = getattr(settings, "JWT_RSA_PUBLIC_KEY", "")
    if pem:
        return serialization.load_pem_public_key(pem.encode("utf-8"))
    private = _load_private_key()
    return private.public_key()


def issue_access_token(*, user_id, session_id, device_id, tenant_id=None) -> str:
    now = datetime.now(dt_timezone.utc)
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "did": str(device_id),
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.JWT_ACCESS_TOKEN_TTL_SECONDS)).timestamp()),
        "typ": "access",
    }
    if tenant_id:
        payload["tid"] = str(tenant_id)
    private_key = _load_private_key()
    return jwt.encode(
        payload,
        private_key,
        algorithm="RS256",
        headers={"kid": settings.JWT_KEY_ID},
    )


def decode_access_token(token: str) -> dict:
    public_key = _load_public_key()
    return jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        options={"require": ["exp", "sub", "sid", "did", "jti"]},
    )


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def b64_pem(pem_text: str) -> str:
    return base64.b64encode(pem_text.encode("utf-8")).decode("ascii")


def pem_from_b64(value: str) -> str:
    return base64.b64decode(value.encode("ascii")).decode("utf-8")
