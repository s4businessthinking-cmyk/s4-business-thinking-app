import json
import logging
import time
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.db import connection

logger = logging.getLogger(__name__)


def check_postgresql() -> dict:
    started = time.perf_counter()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            row = cursor.fetchone()
        ok = row is not None and row[0] == 1
        return {
            "name": "postgresql",
            "status": "up" if ok else "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "detail": settings.DATABASES["default"]["NAME"],
        }
    except Exception as exc:
        logger.exception("postgresql_health_failed")
        return {
            "name": "postgresql",
            "status": "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": str(exc),
        }


def check_redis() -> dict:
    started = time.perf_counter()
    try:
        cache.set("health:ping", "pong", timeout=10)
        value = cache.get("health:ping")
        ok = value == "pong"
        return {
            "name": "redis",
            "status": "up" if ok else "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        logger.exception("redis_health_failed")
        return {
            "name": "redis",
            "status": "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": str(exc),
        }


def check_celery() -> dict:
    started = time.perf_counter()
    try:
        from config.celery import app as celery_app

        inspector = celery_app.control.inspect(timeout=3.0)
        ping = inspector.ping() if inspector else None
        ok = bool(ping)
        workers = list(ping.keys()) if ping else []
        return {
            "name": "celery",
            "status": "up" if ok else "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "workers": workers,
            "worker_count": len(workers),
        }
    except Exception as exc:
        logger.exception("celery_health_failed")
        return {
            "name": "celery",
            "status": "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": str(exc),
        }


def load_build_state() -> dict:
    path = Path(settings.ERP_BUILD_STATE_PATH)
    if not path.exists():
        fallback = Path(settings.BASE_DIR).parent.parent / "build-state.json"
        path = fallback if fallback.exists() else path
    if not path.exists():
        return {
            "error": f"build_state_not_found:{path}",
            "current_stage": None,
            "stages": [],
        }
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def aggregate_health() -> dict:
    services = [check_postgresql(), check_redis(), check_celery()]
    all_up = all(s["status"] == "up" for s in services)
    return {
        "status": "healthy" if all_up else "degraded",
        "app_version": settings.ERP_APP_VERSION,
        "services": services,
        "ready": all_up,
    }
