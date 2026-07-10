import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.core.models.audit import BaseModel


class Plan(BaseModel):
    code = models.CharField(max_length=32, unique=True, db_index=True)
    name = models.CharField(max_length=128)
    edition = models.CharField(max_length=32, default="STARTER")
    modules = models.JSONField(default=list, blank=True)
    limits = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "tenancy_plan"

    def __str__(self):
        return self.code


class Tenant(BaseModel):
    class Mode(models.TextChoices):
        SHARED = "SHARED", "Shared schema"
        SCHEMA = "SCHEMA", "Schema per tenant"
        DEDICATED = "DEDICATED", "Dedicated database"

    class Status(models.TextChoices):
        PROVISIONING = "PROVISIONING", "Provisioning"
        TRIAL = "TRIAL", "Trial"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        ARCHIVED = "ARCHIVED", "Archived"

    slug = models.SlugField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    mode = models.CharField(max_length=16, choices=Mode.choices, default=Mode.SHARED)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROVISIONING)
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="tenants")
    region = models.CharField(max_length=32, default="asia-dubai")
    trial_ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "tenancy_tenant"
        indexes = [models.Index(fields=["status", "created_at"])]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:64]
        super().save(*args, **kwargs)

    def __str__(self):
        return self.slug


class TenantUser(BaseModel):
    class Status(models.TextChoices):
        INVITED = "INVITED", "Invited"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="tenant_users")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tenant_memberships")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    is_owner = models.BooleanField(default=False)

    class Meta:
        db_table = "tenancy_tenant_user"
        unique_together = [("tenant", "user")]
        indexes = [models.Index(fields=["user", "status"])]


class Company(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="companies")
    legal_name = models.CharField(max_length=255)
    trade_name = models.CharField(max_length=255, blank=True, default="")
    base_currency = models.CharField(max_length=8, default="AED")
    country = models.CharField(max_length=2, default="AE")
    tax_registration_no = models.CharField(max_length=64, blank=True, default="")
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "tenancy_company"
        indexes = [models.Index(fields=["tenant", "is_default"])]


class Branch(BaseModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="branches")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "tenancy_branch"
        unique_together = [("company", "code")]
        indexes = [models.Index(fields=["company", "is_active"])]


class Warehouse(BaseModel):
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="warehouses")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "tenancy_warehouse"
        unique_together = [("branch", "code")]
