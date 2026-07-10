import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.identity.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACTIVE = "ACTIVE", "Active"
        LOCKED = "LOCKED", "Locked"
        DISABLED = "DISABLED", "Disabled"

    class PlatformRole(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
        SUPPORT = "SUPPORT", "Support"
        NONE = "NONE", "None"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    phone = models.CharField(max_length=32, blank=True, default="", db_index=True)
    full_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    platform_role = models.CharField(
        max_length=16,
        choices=PlatformRole.choices,
        default=PlatformRole.NONE,
    )
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    email_verified = models.BooleanField(default=False)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    lockout_until = models.DateTimeField(null=True, blank=True)
    last_login = models.DateTimeField(null=True, blank=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        db_table = "identity_user"
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["platform_role"]),
        ]

    def __str__(self):
        return self.email

    @property
    def is_locked(self) -> bool:
        if self.status == self.Status.LOCKED:
            return True
        if self.lockout_until and self.lockout_until > timezone.now():
            return True
        return False

    def clear_lockout(self):
        self.failed_attempts = 0
        self.lockout_until = None
        if self.status == self.Status.LOCKED:
            self.status = self.Status.ACTIVE
