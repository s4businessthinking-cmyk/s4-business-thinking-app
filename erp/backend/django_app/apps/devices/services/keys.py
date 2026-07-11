"""Device key + activation code helpers (STAGE 12, ERP_ARCHITECTURE §20.3/§20.10).

The device key is shown to the desktop client exactly once (at activation); only
its SHA-256 hash is stored server-side. Heartbeats authenticate by presenting
the plaintext key, which is re-hashed and compared in constant time.
"""
import hashlib
import hmac
import secrets


def generate_device_key() -> tuple[str, str]:
    plaintext = secrets.token_urlsafe(32)
    return plaintext, hash_device_key(plaintext)


def hash_device_key(plaintext: str) -> str:
    return hashlib.sha256((plaintext or "").encode("utf-8")).hexdigest()


def verify_device_key(plaintext: str, stored_hash: str) -> bool:
    if not plaintext or not stored_hash:
        return False
    return hmac.compare_digest(hash_device_key(plaintext), stored_hash)


def generate_activation_code() -> str:
    """Human-friendly, unambiguous activation code, e.g. S4-7F3K-9QA2."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I,O,0,1
    part1 = "".join(secrets.choice(alphabet) for _ in range(4))
    part2 = "".join(secrets.choice(alphabet) for _ in range(4))
    return f"S4-{part1}-{part2}"
