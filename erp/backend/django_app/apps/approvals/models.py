from decimal import Decimal

from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class DocumentType(models.TextChoices):
    PURCHASE_ORDER = "PURCHASE_ORDER", "Purchase Order"
    SALES_ORDER = "SALES_ORDER", "Sales Order"
    JOURNAL_ENTRY = "JOURNAL_ENTRY", "Journal Entry"
    LEAVE_REQUEST = "LEAVE_REQUEST", "Leave Request"
    GENERIC = "GENERIC", "Generic"


class ApprovalWorkflow(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="approval_workflows")
    code = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=128)
    document_type = models.CharField(max_length=32, choices=DocumentType.choices, default=DocumentType.GENERIC)
    enabled = models.BooleanField(default=True)
    # Minimum document amount that triggers this workflow (0 = always applies).
    min_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal("0"))
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "approval_workflow"
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "document_type", "enabled"], name="appr_wf_tenant_doc_en_idx"),
        ]


class ApprovalStep(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="approval_steps")
    workflow = models.ForeignKey(ApprovalWorkflow, on_delete=models.CASCADE, related_name="steps")
    sequence = models.IntegerField(default=1)
    name = models.CharField(max_length=128)
    # Role code that is allowed to act on this step (blank = any approvals.act holder).
    approver_role = models.CharField(max_length=64, blank=True, default="")
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "approval_step"
        unique_together = [("workflow", "sequence")]
        ordering = ["sequence"]


class ApprovalRequest(BaseModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="approval_requests")
    workflow = models.ForeignKey(
        ApprovalWorkflow, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests"
    )
    document_type = models.CharField(max_length=32, choices=DocumentType.choices, default=DocumentType.GENERIC)
    document_id = models.CharField(max_length=64, db_index=True)
    requested_by = models.UUIDField(null=True, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal("0"))
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    current_sequence = models.IntegerField(default=0)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "approval_request"
        indexes = [
            models.Index(fields=["tenant", "status", "created_at"], name="appr_req_tenant_st_crt_idx"),
            models.Index(fields=["tenant", "document_type", "document_id"], name="appr_req_tenant_doc_idx"),
        ]


class ApprovalAction(BaseModel):
    class Decision(models.TextChoices):
        APPROVE = "APPROVE", "Approve"
        REJECT = "REJECT", "Reject"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="approval_actions")
    request = models.ForeignKey(ApprovalRequest, on_delete=models.CASCADE, related_name="actions")
    sequence = models.IntegerField(default=0)
    actor_id = models.UUIDField(null=True, blank=True)
    decision = models.CharField(max_length=16, choices=Decision.choices)
    comment = models.TextField(blank=True, default="")

    class Meta:
        db_table = "approval_action"
        indexes = [
            models.Index(fields=["tenant", "request", "sequence"], name="appr_act_tenant_req_idx"),
        ]
