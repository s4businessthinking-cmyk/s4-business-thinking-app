from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class ReportDefinition(BaseModel):
    class Category(models.TextChoices):
        INVENTORY = "INVENTORY", "Inventory"
        SALES = "SALES", "Sales"
        PURCHASE = "PURCHASE", "Purchase"
        FINANCE = "FINANCE", "Finance"
        CRM = "CRM", "CRM"
        HRM = "HRM", "HRM"
        DASHBOARD = "DASHBOARD", "Dashboard"

    code = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=16, choices=Category.choices, db_index=True)
    description = models.TextField(blank=True, default="")
    permission_code = models.CharField(max_length=64, default="reports.run")
    is_active = models.BooleanField(default=True)
    supports_async = models.BooleanField(default=False)
    default_format = models.CharField(max_length=16, default="JSON")

    class Meta:
        db_table = "reports_definition"
        ordering = ["category", "code"]


class ReportRun(BaseModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="report_runs")
    report = models.ForeignKey(ReportDefinition, on_delete=models.PROTECT, related_name="runs")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    parameters = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    row_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    requested_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "reports_run"
        indexes = [models.Index(fields=["tenant", "status", "created_at"])]
