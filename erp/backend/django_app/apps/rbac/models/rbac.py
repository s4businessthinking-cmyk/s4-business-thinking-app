import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel


class Permission(BaseModel):
    class Kind(models.TextChoices):
        CRUD = "CRUD", "CRUD"
        ACTION = "ACTION", "Action"
        REPORT = "REPORT", "Report"
        ADMIN = "ADMIN", "Admin"

    code = models.CharField(max_length=128, unique=True, db_index=True)
    module = models.CharField(max_length=64, db_index=True)
    object = models.CharField(max_length=64, db_index=True)
    action = models.CharField(max_length=64, db_index=True)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.ACTION)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "rbac_permission"


class Role(BaseModel):
    class Kind(models.TextChoices):
        SYSTEM = "SYSTEM", "System"
        TENANT_DEFAULT = "TENANT_DEFAULT", "Tenant Default"
        CUSTOM = "CUSTOM", "Custom"

    code = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=128)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.SYSTEM)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    module_scope = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "rbac_role"


class RolePermission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name="permission_roles")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "rbac_role_permission"
        unique_together = [("role", "permission")]


class UserRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_users")
    valid_from = models.DateTimeField(default=timezone.now)
    valid_to = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "rbac_user_role"
        unique_together = [("user", "role")]
        indexes = [models.Index(fields=["user", "valid_from", "valid_to"])]
