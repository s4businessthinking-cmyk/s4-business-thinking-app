"""Attachment create/read (STAGE 13.7)."""
import base64
import binascii
import hashlib

from django.conf import settings

from apps.documents.models import Attachment
from apps.documents.services.storage import get_storage


class AttachmentError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def create_attachment(*, tenant, entity_type, entity_id, filename, content_type, content_base64, uploaded_by=None):
    entity_type = (entity_type or "").strip()
    entity_id = (entity_id or "").strip()
    filename = (filename or "").strip()
    if not entity_type or not entity_id:
        raise AttachmentError("ENTITY_REQUIRED", "entity_type and entity_id are required", 400)
    if not filename:
        raise AttachmentError("FILENAME_REQUIRED", "filename is required", 400)

    # Upload hardening (STAGE 16 §17.8) — reject dangerous file types.
    try:
        from apps.hardening.validators import UploadRejected, validate_upload

        try:
            validate_upload(filename, content_type)
        except UploadRejected as exc:
            raise AttachmentError("UPLOAD_REJECTED", str(exc), 415)
    except ImportError:
        pass

    try:
        data = base64.b64decode(content_base64 or "", validate=True)
    except (binascii.Error, ValueError):
        raise AttachmentError("INVALID_BASE64", "content_base64 is not valid base64", 400)

    if not data:
        raise AttachmentError("EMPTY_FILE", "Attachment content is empty", 400)

    max_bytes = getattr(settings, "DOCUMENTS_MAX_UPLOAD_BYTES", 10 * 1024 * 1024)
    if len(data) > max_bytes:
        raise AttachmentError("FILE_TOO_LARGE", f"File exceeds {max_bytes} bytes", 413)

    checksum = hashlib.sha256(data).hexdigest()

    attachment = Attachment.objects.create(
        tenant=tenant,
        entity_type=entity_type[:64],
        entity_id=entity_id[:64],
        filename=filename[:255],
        content_type=(content_type or "application/octet-stream")[:128],
        size_bytes=len(data),
        checksum_sha256=checksum,
        uploaded_by=uploaded_by,
    )

    storage = get_storage()
    storage_key = storage.save(tenant_id=str(tenant.id), attachment_id=str(attachment.id), data=data)
    attachment.storage_backend = storage.backend_name
    attachment.storage_key = storage_key
    attachment.save(update_fields=["storage_backend", "storage_key", "updated_at"])
    return attachment


def read_attachment_bytes(attachment: Attachment) -> bytes:
    return get_storage().read(attachment.storage_key)


def soft_delete(attachment: Attachment) -> None:
    attachment.is_deleted = True
    attachment.save(update_fields=["is_deleted", "updated_at"])
    try:
        get_storage().delete(attachment.storage_key)
    except Exception:
        pass
