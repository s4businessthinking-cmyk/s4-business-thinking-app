"""API key generation / verification (STAGE 14, §17).

Keys look like ``s4k_<prefix>_<secret>``. We persist only the SHA-256 hash of
the full raw key. The ``prefix`` is a fast, non-secret lookup handle.
"""
import hashlib
import secrets

from django.utils import timezone

from apps.security.models import ApiKey

KEY_NAMESPACE = "s4k"


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_key(*, tenant, name: str, scopes=None, created_by=None, expires_at=None):
    prefix = secrets.token_hex(4)  # 8 hex chars
    secret = secrets.token_urlsafe(32)
    raw = f"{KEY_NAMESPACE}_{prefix}_{secret}"
    api_key = ApiKey.objects.create(
        tenant=tenant,
        name=name,
        prefix=prefix,
        key_hash=_hash_key(raw),
        scopes=scopes or [],
        created_by=created_by,
        expires_at=expires_at,
    )
    return raw, api_key


def verify_key(raw: str):
    """Return the matching enabled, non-expired ApiKey or ``None``."""
    if not raw or raw.count("_") < 2:
        return None
    try:
        namespace, prefix, _ = raw.split("_", 2)
    except ValueError:
        return None
    if namespace != KEY_NAMESPACE:
        return None
    candidate = ApiKey.objects.filter(prefix=prefix, enabled=True).first()
    if not candidate:
        return None
    if candidate.expires_at and candidate.expires_at < timezone.now():
        return None
    if not secrets.compare_digest(candidate.key_hash, _hash_key(raw)):
        return None
    candidate.last_used_at = timezone.now()
    candidate.save(update_fields=["last_used_at", "updated_at"])
    return candidate


def revoke_key(api_key: ApiKey) -> ApiKey:
    api_key.enabled = False
    api_key.revoked_at = timezone.now()
    api_key.save(update_fields=["enabled", "revoked_at", "updated_at"])
    return api_key
