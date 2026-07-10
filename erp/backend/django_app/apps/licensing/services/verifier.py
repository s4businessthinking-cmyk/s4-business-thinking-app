import base64
import hashlib
import json
import logging
from datetime import datetime, timezone as dt_timezone

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

LICENSE_KEY_PREFIX = "S4-LIC-v1"
LICENSE_APP_ID = "com.s4businessthinking.app"
VALID_PLANS = {"LIFETIME", "MONTHLY", "YEARLY", "CUSTOM"}


class LicenseVerificationError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _b64url_decode(value: str) -> bytes:
    normalized = value.replace("-", "+").replace("_", "/")
    padding = "=" * ((4 - len(normalized) % 4) % 4)
    return base64.b64decode(normalized + padding)


def _b64url_decode_text(value: str) -> str:
    return _b64url_decode(value).decode("utf-8")


def _normalize_license_key(license_key: str) -> str:
    return "".join(str(license_key or "").split())


def _load_license_public_key():
    jwk = settings.LICENSE_PUBLIC_KEY_JWK
    x = int.from_bytes(_b64url_decode(jwk["x"]), "big")
    y = int.from_bytes(_b64url_decode(jwk["y"]), "big")
    numbers = ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1())
    return numbers.public_key()


def _normalize_ecdsa_signature(signature_bytes: bytes) -> bytes:
    if len(signature_bytes) == 64:
        return signature_bytes
    # DER encoded ECDSA signature
    r, s = decode_dss_signature(signature_bytes)
    return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def parse_license_key(license_key: str) -> dict:
    normalized = _normalize_license_key(license_key)
    parts = normalized.split(".")
    if len(parts) != 3 or parts[0] != LICENSE_KEY_PREFIX:
        raise LicenseVerificationError("INVALID_LICENSE_KEY_FORMAT", "Invalid license key format.")
    try:
        payload = json.loads(_b64url_decode_text(parts[1]))
    except Exception as exc:
        raise LicenseVerificationError("INVALID_LICENSE_PAYLOAD_ENCODING", "Invalid payload encoding.") from exc
    return {
        "normalized_key": normalized,
        "prefix": parts[0],
        "payload_part": parts[1],
        "signature_part": parts[2],
        "payload": payload,
        "signing_input": f"{parts[0]}.{parts[1]}",
    }


def verify_license_signature(parsed: dict) -> None:
    public_key = _load_license_public_key()
    signature = _normalize_ecdsa_signature(_b64url_decode(parsed["signature_part"]))
    public_key.verify(
        signature,
        parsed["signing_input"].encode("utf-8"),
        ec.ECDSA(hashes.SHA256()),
    )


def validate_license_payload(payload: dict) -> dict:
    required = [
        "licenseId",
        "customerName",
        "shopName",
        "plan",
        "status",
        "issuedAt",
        "notBefore",
        "maxDevices",
        "features",
        "appId",
        "version",
    ]
    missing = [k for k in required if k not in payload or payload[k] in (None, "")]
    if missing:
        raise LicenseVerificationError("MISSING_PAYLOAD_FIELDS", f"Missing fields: {', '.join(missing)}")

    plan = str(payload.get("plan", "")).upper()
    if plan not in VALID_PLANS:
        raise LicenseVerificationError("INVALID_LICENSE_PLAN", "Invalid license plan.")

    if payload.get("status") != "ACTIVE":
        raise LicenseVerificationError("LICENSE_STATUS_NOT_ACTIVE", "License is not active.")

    if payload.get("appId") != LICENSE_APP_ID:
        raise LicenseVerificationError("LICENSE_APP_MISMATCH", "License app mismatch.")

    now_ms = int(datetime.now(dt_timezone.utc).timestamp() * 1000)
    issued_at = int(payload.get("issuedAt", 0))
    not_before = int(payload.get("notBefore", 0))
    expires_at = payload.get("expiresAt")

    if issued_at > now_ms:
        raise LicenseVerificationError("LICENSE_NOT_YET_VALID", "License not yet valid.")
    if not_before > now_ms:
        raise LicenseVerificationError("LICENSE_NOT_YET_VALID", "License not yet valid.")

    if plan != "LIFETIME":
        if expires_at is None:
            raise LicenseVerificationError("EXPIRES_AT_REQUIRED", "expiresAt required for non-lifetime plan.")
        if int(expires_at) < now_ms:
            raise LicenseVerificationError("LICENSE_EXPIRED", "License has expired.")

    return {
        "license_id": str(payload["licenseId"]),
        "plan": plan,
        "modules": list(payload.get("features") or []),
        "max_devices": int(payload.get("maxDevices") or 1),
        "valid_from": datetime.fromtimestamp(not_before / 1000, tz=dt_timezone.utc),
        "valid_to": (
            None
            if plan == "LIFETIME" or not expires_at
            else datetime.fromtimestamp(int(expires_at) / 1000, tz=dt_timezone.utc)
        ),
        "payload": payload,
    }


def license_key_fingerprint(license_key: str) -> str:
    normalized = _normalize_license_key(license_key)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def verify_and_parse_license_key(license_key: str) -> dict:
    parsed = parse_license_key(license_key)
    try:
        verify_license_signature(parsed)
    except Exception as exc:
        logger.warning("license_signature_invalid error=%s", exc)
        raise LicenseVerificationError("SIGNATURE_INVALID", "License signature is invalid.") from exc
    validated = validate_license_payload(parsed["payload"])
    validated["fingerprint"] = license_key_fingerprint(license_key)
    validated["normalized_key"] = parsed["normalized_key"]
    return validated
