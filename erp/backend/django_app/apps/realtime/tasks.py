"""Celery tasks for realtime relay (STAGE 11).

The relay is also runnable synchronously via the REST endpoint; this task lets
it be scheduled (e.g. Celery beat) so outbox events are broadcast continuously.
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="realtime.relay_all_pending")
def relay_all_pending_task(batch_size: int = 200) -> dict:
    from apps.realtime.services.relay import relay_all_pending

    result = relay_all_pending(batch_size=batch_size)
    logger.info("realtime.relay_all_pending relayed=%s", result.get("relayed"))
    return result
