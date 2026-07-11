"""Scheduled backup + retention tasks (STAGE 14, §22).

Wired into Celery beat via ``CELERY_BEAT_SCHEDULE`` in settings. Failures are
recorded on the ``BackupJob`` row rather than raised, so a bad run never wedges
the worker.
"""
import logging

from celery import shared_task

from apps.backup.models import BackupJob
from apps.backup.services import runner

logger = logging.getLogger(__name__)


@shared_task(name="backup.run_scheduled_full")
def run_scheduled_full_backup():
    job = runner.create_backup(backup_type=BackupJob.BackupType.FULL, is_scheduled=True)
    logger.info("scheduled_backup status=%s id=%s", job.status, job.id)
    return {"id": str(job.id), "status": job.status}


@shared_task(name="backup.cleanup_expired")
def cleanup_expired_backups():
    result = runner.cleanup_expired()
    logger.info("backup_cleanup purged=%s", result.get("purged"))
    return result
