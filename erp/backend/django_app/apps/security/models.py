from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class ApiKey(BaseModel):
    """Per-tenant API key (STAGE 14, ERP_ARCHITECTURE §17).

    Only a SHA-256 hash of the secret is stored; the raw key is shown exactly
    once at creation. ``prefix`` is a non-secret lookup handle so verification
    doesn't require scanning every row.
    """

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="api_keys")
    name = models.CharField(max_length=128)
    prefix = models.CharField(max_length=16, db_index=True)
    key_hash = models.CharField(max_length=64)
    scopes = models.JSONField(default=list, blank=True)
    enabled = models.BooleanField(default=True, db_index=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.UUIDField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "api_key"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "enabled"], name="apikey_tenant_enabled_idx"),
        ]

    def __str__(self):
        return f"ApiKey<{self.prefix}:{self.name}>"


class SecurityPolicy(BaseModel):
    """Per-tenant security policy knobs (§17). One row per tenant."""

    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name="security_policy")
    password_min_length = models.IntegerField(default=8)
    password_require_complexity = models.BooleanField(default=True)
    session_ttl_minutes = models.IntegerField(default=720)
    max_login_attempts = models.IntegerField(default=5)
    lockout_minutes = models.IntegerField(default=15)
    require_mfa = models.BooleanField(default=False)
    ip_allowlist = models.JSONField(default=list, blank=True)
    updated_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "security_policy"

    def __str__(self):
        return f"SecurityPolicy<{self.tenant_id}>"
