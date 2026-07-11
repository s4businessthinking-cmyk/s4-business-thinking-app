"""Pluggable attachment storage (STAGE 13.7, ERP_ARCHITECTURE §24).

The default backend writes to the local filesystem under ``MEDIA_ROOT`` in a
tenant-partitioned layout. The interface (``save``/``read``/``delete``) is
deliberately small so an S3/GCS backend can be dropped in later without
touching callers.
"""
import os

from django.conf import settings


class LocalFileStorage:
    backend_name = "local"

    def _root(self) -> str:
        return str(settings.MEDIA_ROOT)

    def _abs_path(self, storage_key: str) -> str:
        # Prevent path traversal — storage_key is server-generated, but be safe.
        safe = storage_key.replace("..", "").lstrip("/\\")
        return os.path.join(self._root(), safe)

    def save(self, *, tenant_id: str, attachment_id: str, data: bytes) -> str:
        storage_key = f"{tenant_id}/{attachment_id}"
        abs_path = self._abs_path(storage_key)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "wb") as fh:
            fh.write(data)
        return storage_key

    def read(self, storage_key: str) -> bytes:
        with open(self._abs_path(storage_key), "rb") as fh:
            return fh.read()

    def delete(self, storage_key: str) -> None:
        try:
            os.remove(self._abs_path(storage_key))
        except FileNotFoundError:
            pass


def get_storage() -> LocalFileStorage:
    return LocalFileStorage()
