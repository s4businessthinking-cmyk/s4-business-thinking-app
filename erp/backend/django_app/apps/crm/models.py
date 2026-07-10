import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.hrm.models import Employee
from apps.sales.models import Customer
from apps.tenancy.models import Tenant


class Lead(BaseModel):
    class Status(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        QUALIFIED = "QUALIFIED", "Qualified"
        LOST = "LOST", "Lost"
        CONVERTED = "CONVERTED", "Converted"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="crm_leads")
    lead_number = models.CharField(max_length=32, db_index=True)
    name = models.CharField(max_length=255)
    company_name = models.CharField(max_length=255, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    source = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW, db_index=True)
    correlation_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    converted_customer = models.ForeignKey(
        Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="converted_leads"
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "crm_lead"
        unique_together = [("tenant", "lead_number")]
        indexes = [models.Index(fields=["tenant", "status", "created_at"])]


class Opportunity(BaseModel):
    class Stage(models.TextChoices):
        PROSPECTING = "PROSPECTING", "Prospecting"
        PROPOSAL = "PROPOSAL", "Proposal"
        NEGOTIATION = "NEGOTIATION", "Negotiation"
        WON = "WON", "Won"
        LOST = "LOST", "Lost"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="crm_opportunities")
    opp_number = models.CharField(max_length=32, db_index=True)
    title = models.CharField(max_length=255)
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.SET_NULL, related_name="opportunities")
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="opportunities")
    stage = models.CharField(max_length=16, choices=Stage.choices, default=Stage.PROSPECTING, db_index=True)
    expected_value = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    expected_close_date = models.DateField(null=True, blank=True)
    probability = models.PositiveSmallIntegerField(default=10)
    correlation_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    remarks = models.TextField(blank=True, default="")

    class Meta:
        db_table = "crm_opportunity"
        unique_together = [("tenant", "opp_number")]
        indexes = [models.Index(fields=["tenant", "stage", "expected_close_date"])]


class Activity(BaseModel):
    class ActivityType(models.TextChoices):
        CALL = "CALL", "Call"
        MEETING = "MEETING", "Meeting"
        EMAIL = "EMAIL", "Email"
        NOTE = "NOTE", "Note"
        TASK = "TASK", "Task"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        DONE = "DONE", "Done"
        CANCELLED = "CANCELLED", "Cancelled"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="crm_activities")
    activity_type = models.CharField(max_length=16, choices=ActivityType.choices, default=ActivityType.NOTE)
    subject = models.CharField(max_length=255)
    notes = models.TextField(blank=True, default="")
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True)
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.CASCADE, related_name="activities")
    opportunity = models.ForeignKey(Opportunity, null=True, blank=True, on_delete=models.CASCADE, related_name="activities")
    assigned_employee = models.ForeignKey(
        Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_activities"
    )

    class Meta:
        db_table = "crm_activity"
        indexes = [models.Index(fields=["tenant", "status", "due_at"])]
