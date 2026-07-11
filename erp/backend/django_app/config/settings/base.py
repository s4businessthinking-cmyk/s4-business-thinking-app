"""
Django settings for S4 Business Thinking ERP.
"""
import logging
import os
from pathlib import Path

import environ

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
    "apps.core.middleware.correlation.CorrelationIdMiddleware",
    "apps.tenancy.middleware.TenantMiddleware",
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

ERP_APP_VERSION = env("ERP_APP_VERSION", default="0.11.0-stage11")

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
