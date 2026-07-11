"""
Django settings for S4 Business Thinking ERP.
"""
import logging
import os
from pathlib import Path

import environ
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent
ERP_ROOT = BASE_DIR.parent.parent
REPO_ROOT = ERP_ROOT.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173", "http://127.0.0.1:5173"]),
)

env_file = os.environ.get("DJANGO_ENV_FILE")
if env_file and Path(env_file).exists():
    environ.Env.read_env(env_file)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-only-change-in-production")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "channels",
    "corsheaders",
    "rest_framework",
    "apps.core",
    "apps.identity",
    "apps.auth_service",
    "apps.rbac",
    "apps.tenancy",
    "apps.licensing",
    "apps.sync",
    "apps.inventory",
    "apps.purchase",
    "apps.sales",
    "apps.accounting",
    "apps.hrm",
    "apps.crm",
    "apps.reports",
    "apps.realtime",
    "apps.devices",
    "apps.notifications",
    "apps.approvals",
    "apps.documents",
    "apps.customization",
    "apps.backup",
    "apps.security",
    "apps.ops",
    "apps.hardening",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.security.middleware.SecurityHeadersMiddleware",
    "apps.ops.middleware.RequestMetricsMiddleware",
    "apps.core.middleware.correlation.CorrelationIdMiddleware",
    "apps.tenancy.middleware.TenantMiddleware",
    "apps.hardening.idempotency.IdempotencyMiddleware",
    "apps.core.middleware.request_log.RequestLogMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

REDIS_URL = env("REDIS_URL", default="redis://127.0.0.1:6379/0")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL],
            "capacity": 1500,
            "expiry": 30,
        },
    }
}

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", default="s4_erp"),
        "USER": env("POSTGRES_USER", default="s4_erp"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="change_me_in_production"),
        "HOST": env("POSTGRES_HOST", default="localhost"),
        "PORT": env("POSTGRES_PORT", default="5432"),
        "CONN_MAX_AGE": 60,
        "OPTIONS": {"connect_timeout": 10},
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://127.0.0.1:6379/0"),
        "OPTIONS": {"socket_connect_timeout": 5},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Dubai"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Documents / attachments (STAGE 13.7 — §24 File / Document Storage)
MEDIA_ROOT = env("ERP_MEDIA_ROOT", default=str(BASE_DIR / "media"))
DOCUMENTS_MAX_UPLOAD_BYTES = env.int("DOCUMENTS_MAX_UPLOAD_BYTES", default=10 * 1024 * 1024)
# Allow base64-encoded attachment payloads (JSON) up to ~20MB request bodies.
DATA_UPLOAD_MAX_MEMORY_SIZE = env.int("DATA_UPLOAD_MAX_MEMORY_SIZE", default=20 * 1024 * 1024)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "identity.User"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
]

JWT_KEY_ID = env("JWT_KEY_ID", default="s4-erp-stage2")
JWT_ACCESS_TOKEN_TTL_SECONDS = env.int("JWT_ACCESS_TOKEN_TTL_SECONDS", default=300)
JWT_RSA_PRIVATE_KEY = (
    env("JWT_RSA_PRIVATE_KEY", default="").replace("\\n", "\n")
    or (
        __import__("base64").b64decode(env("JWT_RSA_PRIVATE_KEY_B64")).decode("utf-8")
        if env("JWT_RSA_PRIVATE_KEY_B64", default="")
        else ""
    )
)
JWT_RSA_PUBLIC_KEY = (
    env("JWT_RSA_PUBLIC_KEY", default="").replace("\\n", "\n")
    or (
        __import__("base64").b64decode(env("JWT_RSA_PUBLIC_KEY_B64")).decode("utf-8")
        if env("JWT_RSA_PUBLIC_KEY_B64", default="")
        else ""
    )
)

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.auth_service.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "EXCEPTION_HANDLER": "apps.core.exceptions.handlers.custom_exception_handler",
    "UNAUTHENTICATED_USER": None,
    # Rate limiting (STAGE 16 §5/§17.2). Generous defaults so normal ERP usage
    # is never throttled; login + self-test scopes are intentionally tight.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON", default="120/min"),
        "user": env("THROTTLE_USER", default="2000/min"),
        "login": env("THROTTLE_LOGIN", default="20/min"),
        "hardening_test": env("THROTTLE_HARDENING_TEST", default="5/min"),
    },
    # Behind a reverse proxy (nginx), set NUM_PROXIES so throttle identity uses
    # the real client IP from X-Forwarded-For instead of the proxy IP.
    "NUM_PROXIES": env.int("NUM_PROXIES", default=0) or None,
}

CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173"],
)
CORS_ALLOW_CREDENTIALS = True

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://127.0.0.1:6379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://127.0.0.1:6379/2")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 300

# Backup & DR (STAGE 14 — ERP_ARCHITECTURE §22): scheduled full backup + retention purge.
CELERY_BEAT_SCHEDULE = {
    "backup-nightly-full": {
        "task": "backup.run_scheduled_full",
        "schedule": crontab(hour=2, minute=30),
    },
    "backup-cleanup-expired": {
        "task": "backup.cleanup_expired",
        "schedule": crontab(hour=3, minute=30),
    },
}

ERP_APP_VERSION = env("ERP_APP_VERSION", default="0.11.0-stage11")

# Backup & DR (STAGE 14 — §22)
BACKUP_ROOT = env("ERP_BACKUP_ROOT", default=str(BASE_DIR / "backups"))
BACKUP_RETENTION_DAYS = env.int("BACKUP_RETENTION_DAYS", default=35)

# Observability (STAGE 15 — §16.4/§26): Prometheus scrape endpoint.
METRICS_ENABLED = env.bool("METRICS_ENABLED", default=True)
METRICS_TOKEN = env("METRICS_TOKEN", default="")

# Final hardening (STAGE 16 — §8/§17.8/§28.3): idempotent writes + upload safety.
IDEMPOTENCY_TTL_SECONDS = env.int("IDEMPOTENCY_TTL_SECONDS", default=86400)
UPLOAD_ALLOWED_CONTENT_TYPES = env.list("UPLOAD_ALLOWED_CONTENT_TYPES", default=[])

# Security headers (STAGE 14 — §17.7). CSP off by default so DRF/admin keep working.
SECURITY_CONTENT_SECURITY_POLICY = env("SECURITY_CONTENT_SECURITY_POLICY", default="")
SECURITY_HSTS_HEADER = env("SECURITY_HSTS_HEADER", default="max-age=31536000; includeSubDomains")
SECURITY_PERMISSIONS_POLICY = env(
    "SECURITY_PERMISSIONS_POLICY", default="geolocation=(), microphone=(), camera=()"
)

# Realtime (STAGE 11) — WebSocket tickets + replay ring buffer
REALTIME_WS_TICKET_TTL_SECONDS = env.int("REALTIME_WS_TICKET_TTL_SECONDS", default=30)
REALTIME_RING_BUFFER_SIZE = env.int("REALTIME_RING_BUFFER_SIZE", default=200)
REALTIME_RING_BUFFER_TTL_SECONDS = env.int("REALTIME_RING_BUFFER_TTL_SECONDS", default=600)
REALTIME_PRESENCE_TTL_SECONDS = env.int("REALTIME_PRESENCE_TTL_SECONDS", default=60)

LICENSE_PUBLIC_KEY_JWK = {
    "kty": "EC",
    "crv": "P-256",
    "x": env("LICENSE_PUBLIC_KEY_X", default="WiSfAOqBS1xH9jSSkapz39DiY1VZSp79KIGoq1LQ24E"),
    "y": env("LICENSE_PUBLIC_KEY_Y", default="85tpm-ntlp8d4-tuekifXYG5pjPtxzKQ_mpGbBvJCHo"),
}
ERP_BUILD_STATE_PATH = env(
    "ERP_BUILD_STATE_PATH",
    default=str(ERP_ROOT / "build-state.json"),
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(asctime)s [%(levelname)s] %(name)s %(correlation_id)s %(message)s",
        },
        "simple": {
            "format": "%(asctime)s [%(levelname)s] %(name)s %(message)s",
        },
    },
    "filters": {
        "correlation_id": {
            "()": "apps.core.logging.filters.CorrelationIdFilter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
            "filters": ["correlation_id"],
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "apps": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "celery": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

logging.getLogger(__name__).info("S4 ERP base settings loaded")
