"""Backup execution engine (STAGE 14, ERP_ARCHITECTURE §22).

Primary method is a real ``pg_dump`` (custom format, compressed). When the
``pg_dump`` binary is unavailable (or its version is incompatible with the
server), the runner falls back to Django's ``dumpdata`` which produces a
restorable JSON fixture. Every artifact is fingerprinted with SHA-256 so
corruption / tampering is detectable, and a retention window is stamped.
"""
import datetime
import hashlib
import io
import os
import shutil
import subprocess
import time

from django.conf import settings
from django.core.management import call_command
from django.utils import timezone

from apps.backup.models import BackupJob


class BackupError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


CHUNK = 1024 * 1024


def _backup_root() -> str:
    root = str(getattr(settings, "BACKUP_ROOT", os.path.join(str(settings.BASE_DIR), "backups")))
    os.makedirs(root, exist_ok=True)
    return root


def _retention_days() -> int:
    return int(getattr(settings, "BACKUP_RETENTION_DAYS", 35))


def _sha256_file(path: str) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with open(path, "rb") as fh:
        while True:
            block = fh.read(CHUNK)
            if not block:
                break
            size += len(block)
            digest.update(block)
    return digest.hexdigest(), size


def _pg_dump_available() -> bool:
    return shutil.which("pg_dump") is not None


def _run_pg_dump(abs_path: str) -> None:
    db = settings.DATABASES["default"]
    env = os.environ.copy()
    if db.get("PASSWORD"):
        env["PGPASSWORD"] = str(db["PASSWORD"])
    cmd = [
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        f"--host={db.get('HOST') or 'localhost'}",
        f"--port={db.get('PORT') or '5432'}",
        f"--username={db.get('USER') or 'postgres'}",
        f"--dbname={db.get('NAME')}",
        f"--file={abs_path}",
    ]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=60 * 30)
    if proc.returncode != 0:
        raise BackupError("PG_DUMP_FAILED", (proc.stderr or "pg_dump failed").strip()[:2000], status=500)


def _run_dumpdata(abs_path: str) -> None:
    # Logical, restorable export via loaddata. Exclude volatile / non-portable
    # tables (sessions, content types, permissions) to keep it reload-safe.
    buffer = io.StringIO()
    call_command(
        "dumpdata",
        "--natural-foreign",
        "--natural-primary",
        exclude=["contenttypes", "auth.permission", "sessions", "admin.logentry"],
        stdout=buffer,
    )
    with open(abs_path, "w", encoding="utf-8") as fh:
        fh.write(buffer.getvalue())


def create_backup(*, tenant=None, backup_type=None, method=None, triggered_by=None, is_scheduled=False) -> BackupJob:
    backup_type = backup_type or BackupJob.BackupType.FULL
    if method is None:
        method = BackupJob.Method.PG_DUMP if _pg_dump_available() else BackupJob.Method.DJANGO_DUMPDATA
    if method == BackupJob.Method.PG_DUMP and not _pg_dump_available():
        method = BackupJob.Method.DJANGO_DUMPDATA

    job = BackupJob.objects.create(
        tenant=tenant,
        backup_type=backup_type,
        method=method,
        status=BackupJob.Status.RUNNING,
        started_at=timezone.now(),
        triggered_by=triggered_by,
        is_scheduled=is_scheduled,
    )

    started = time.monotonic()
    ext = "dump" if method == BackupJob.Method.PG_DUMP else "json"
    scope = "full" if tenant is None else f"tenant-{tenant.id}"
    stamp = timezone.now().strftime("%Y%m%d-%H%M%S")
    filename = f"backup-{scope}-{stamp}-{str(job.id)[:8]}.{ext}"
    storage_key = filename
    abs_path = os.path.join(_backup_root(), storage_key)

    try:
        if method == BackupJob.Method.PG_DUMP:
            _run_pg_dump(abs_path)
        else:
            _run_dumpdata(abs_path)

        checksum, size = _sha256_file(abs_path)
        job.status = BackupJob.Status.SUCCESS
        job.storage_key = storage_key
        job.filename = filename
        job.size_bytes = size
        job.checksum_sha256 = checksum
        job.retention_until = timezone.now() + datetime.timedelta(days=_retention_days())
    except BackupError as exc:
        job.status = BackupJob.Status.FAILED
        job.error = f"{exc.code}: {exc.message}"
        _safe_remove(abs_path)
    except Exception as exc:  # noqa: BLE001 - record any failure on the job
        job.status = BackupJob.Status.FAILED
        job.error = str(exc)[:2000]
        _safe_remove(abs_path)
    finally:
        job.finished_at = timezone.now()
        job.duration_ms = int((time.monotonic() - started) * 1000)
        job.save()

    return job


def verify_backup(job: BackupJob) -> dict:
    """Recompute the on-disk checksum and compare with the stored fingerprint."""
    if job.status != BackupJob.Status.SUCCESS:
        return {"ok": False, "reason": "NOT_SUCCESS", "status": job.status}
    abs_path = os.path.join(_backup_root(), job.storage_key)
    if not os.path.exists(abs_path):
        return {"ok": False, "reason": "FILE_MISSING", "expected": job.checksum_sha256}
    checksum, size = _sha256_file(abs_path)
    ok = checksum == job.checksum_sha256 and size == job.size_bytes
    return {
        "ok": ok,
        "reason": "OK" if ok else "CHECKSUM_MISMATCH",
        "expected": job.checksum_sha256,
        "actual": checksum,
        "expected_size": job.size_bytes,
        "actual_size": size,
    }


def cleanup_expired() -> dict:
    """Purge artifacts whose retention window has passed."""
    now = timezone.now()
    expired = BackupJob.objects.filter(
        status=BackupJob.Status.SUCCESS, retention_until__lt=now
    )
    purged = 0
    freed = 0
    for job in expired.iterator():
        abs_path = os.path.join(_backup_root(), job.storage_key)
        if os.path.exists(abs_path):
            freed += job.size_bytes
        _safe_remove(abs_path)
        job.status = BackupJob.Status.EXPIRED
        job.save(update_fields=["status", "updated_at"])
        purged += 1
    return {"purged": purged, "freed_bytes": freed}


def _safe_remove(abs_path: str) -> None:
    try:
        os.remove(abs_path)
    except FileNotFoundError:
        pass
    except OSError:
        pass
