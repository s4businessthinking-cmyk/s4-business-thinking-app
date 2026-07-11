"""Approval workflow engine (STAGE 13.6).

Documents (PO/SO/JE/Leave/generic) are submitted for approval by
``document_type`` + ``document_id`` — no foreign keys into the source modules,
so existing schemas are never touched. A matching enabled workflow whose
``min_amount`` threshold is met drives a multi-step approval chain.
"""
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.approvals.models import (
    ApprovalAction,
    ApprovalRequest,
    ApprovalStep,
    ApprovalWorkflow,
)

logger = logging.getLogger(__name__)


class ApprovalError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _to_decimal(value, default="0") -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _notify(tenant, *, title, body, recipient_id, category="APPROVAL", severity="INFO",
            entity_id="", meta=None):
    try:
        from apps.notifications.services.dispatch import create_notification

        create_notification(
            tenant=tenant,
            title=title,
            body=body,
            recipient_id=recipient_id,
            category=category,
            severity=severity,
            entity_type="approvals.request",
            entity_id=entity_id,
            source_rule="approvals",
            meta=meta or {},
            realtime=True,
        )
    except Exception:  # pragma: no cover - notifications are best-effort
        logger.exception("approval notification failed request=%s", entity_id)


def resolve_workflow(*, tenant, document_type, amount):
    amount = _to_decimal(amount)
    return (
        ApprovalWorkflow.objects.filter(
            tenant=tenant, document_type=document_type, enabled=True, min_amount__lte=amount
        )
        .order_by("-min_amount")
        .first()
    )


def _ordered_steps(workflow) -> list[ApprovalStep]:
    return list(ApprovalStep.objects.filter(workflow=workflow).order_by("sequence"))


@transaction.atomic
def submit(*, tenant, document_type, document_id, requested_by=None, amount=0, meta=None):
    document_id = (document_id or "").strip()
    if not document_id:
        raise ApprovalError("DOCUMENT_ID_REQUIRED", "document_id is required", 400)

    workflow = resolve_workflow(tenant=tenant, document_type=document_type, amount=amount)
    steps = _ordered_steps(workflow) if workflow else []

    request = ApprovalRequest.objects.create(
        tenant=tenant,
        workflow=workflow,
        document_type=document_type,
        document_id=document_id,
        requested_by=requested_by,
        amount=_to_decimal(amount),
        meta=meta or {},
    )

    if not workflow or not steps:
        # No workflow / no steps → auto-approve (nothing to review).
        request.status = ApprovalRequest.Status.APPROVED
        request.current_sequence = 0
        request.save(update_fields=["status", "current_sequence", "updated_at"])
        return request

    request.current_sequence = steps[0].sequence
    request.save(update_fields=["current_sequence", "updated_at"])
    _notify(
        tenant,
        title=f"Approval needed: {document_type} {document_id}",
        body=f"Step {steps[0].sequence} — {steps[0].name}",
        recipient_id=None,
        severity="WARNING",
        entity_id=str(request.id),
        meta={"document_type": document_type, "document_id": document_id},
    )
    return request


@transaction.atomic
def act(*, tenant, request_id, actor_id, decision, comment=""):
    request = (
        ApprovalRequest.objects.select_for_update()
        .filter(tenant=tenant, id=request_id)
        .first()
    )
    if not request:
        raise ApprovalError("NOT_FOUND", "Approval request not found", 404)
    if request.status != ApprovalRequest.Status.PENDING:
        raise ApprovalError("NOT_PENDING", f"Request is {request.status}", 409)
    if decision not in {ApprovalAction.Decision.APPROVE, ApprovalAction.Decision.REJECT}:
        raise ApprovalError("INVALID_DECISION", "decision must be APPROVE or REJECT", 400)

    ApprovalAction.objects.create(
        tenant=tenant,
        request=request,
        sequence=request.current_sequence,
        actor_id=actor_id,
        decision=decision,
        comment=comment or "",
    )

    if decision == ApprovalAction.Decision.REJECT:
        request.status = ApprovalRequest.Status.REJECTED
        request.save(update_fields=["status", "updated_at"])
        _notify(
            tenant,
            title=f"Rejected: {request.document_type} {request.document_id}",
            body=comment or "Approval request rejected.",
            recipient_id=request.requested_by,
            severity="CRITICAL",
            entity_id=str(request.id),
        )
        return request

    # APPROVE → advance to the next step, or finalise.
    steps = _ordered_steps(request.workflow) if request.workflow else []
    next_step = next((s for s in steps if s.sequence > request.current_sequence), None)
    if next_step:
        request.current_sequence = next_step.sequence
        request.save(update_fields=["current_sequence", "updated_at"])
        return request

    request.status = ApprovalRequest.Status.APPROVED
    request.save(update_fields=["status", "updated_at"])
    _notify(
        tenant,
        title=f"Approved: {request.document_type} {request.document_id}",
        body="All approval steps completed.",
        recipient_id=request.requested_by,
        severity="INFO",
        entity_id=str(request.id),
    )
    return request


@transaction.atomic
def cancel(*, tenant, request_id, actor_id):
    request = (
        ApprovalRequest.objects.select_for_update()
        .filter(tenant=tenant, id=request_id)
        .first()
    )
    if not request:
        raise ApprovalError("NOT_FOUND", "Approval request not found", 404)
    if request.status != ApprovalRequest.Status.PENDING:
        raise ApprovalError("NOT_PENDING", f"Request is {request.status}", 409)
    request.status = ApprovalRequest.Status.CANCELLED
    request.save(update_fields=["status", "updated_at"])
    return request
