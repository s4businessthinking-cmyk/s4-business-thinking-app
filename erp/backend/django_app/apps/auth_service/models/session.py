import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel


class Device(BaseModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    fingerprint = models.CharField(max_length=128, db_index=True)
    name = models.CharField(max_length=128, blank=True, default="")
    platform = models.CharField(max_length=64, blank=True, default="web")
    trusted = models.BooleanField(default=False)
    last_seen = models.DateTimeField(default=timezone.now)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "auth_device"
        unique_together = [("user", "fingerprint")]
        indexes = [models.Index(fields=["user", "last_seen"])]


class UserSession(BaseModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions")
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="sessions")
    refresh_token_hash = models.CharField(max_length=128, unique=True, db_index=True)
    family_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "auth_session"
        indexes = [
            models.Index(fields=["user", "expires_at"]),
            models.Index(fields=["family_id"]),
        ]

    @property
    def is_active(self) -> bool:
        if self.revoked_at:
            return False
        return self.expires_at > timezone.now()


class LoginHistory(BaseModel):
    class Result(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        FAIL = "FAIL", "Fail"
        LOCKED = "LOCKED", "Locked"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="login_history",
    )
    email = models.EmailField(db_index=True)
    result = models.CharField(max_length=16, choices=Result.choices)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    device_fingerprint = models.CharField(max_length=128, blank=True, default="")
    failure_reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "auth_login_history"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["email", "created_at"])]
