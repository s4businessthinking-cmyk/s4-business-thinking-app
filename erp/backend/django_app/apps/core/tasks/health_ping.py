from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task(name="apps.core.tasks.health_ping")
def health_ping() -> dict:
    logger.info("celery_health_ping_executed")
    return {"ok": True, "task": "health_ping"}
