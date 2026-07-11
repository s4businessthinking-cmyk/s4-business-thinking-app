"""File upload hardening (STAGE 16, ERP_ARCHITECTURE §17.8).

Rejects dangerous executable/script file types by extension, and (optionally)
enforces a content-type allowlist. Size limits are enforced by the caller.
"""
import os

from django.conf import settings

DEFAULT_BLOCKED_EXTENSIONS = {
    ".exe", ".dll", ".com", ".msi", ".scr", ".bat", ".cmd", ".ps1", ".vbs",
    ".sh", ".bash", ".jar", ".js", ".mjs", ".php", ".phtml", ".pl", ".py",
    ".rb", ".cgi", ".asp", ".aspx", ".jsp", ".htaccess",
}


class UploadRejected(Exception):
    pass


def validate_upload(filename: str, content_type: str) -> None:
    blocked = set(getattr(settings, "UPLOAD_BLOCKED_EXTENSIONS", DEFAULT_BLOCKED_EXTENSIONS))
    ext = os.path.splitext(filename or "")[1].lower()
    if ext and ext in blocked:
        raise UploadRejected(f"File type '{ext}' is not allowed")

    allowlist = getattr(settings, "UPLOAD_ALLOWED_CONTENT_TYPES", [])
    if allowlist and content_type and content_type not in allowlist:
        raise UploadRejected(f"Content-type '{content_type}' is not allowed")
