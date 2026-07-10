import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Branch, Company, Tenant

from .coa import Account, FiscalPeriod


class JournalEntry(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        REVERSED = "REVERSED", "Reversed"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="journal_entries")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="journal_entries")
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.PROTECT, related_name="journal_entries")
    voucher_no = models.CharField(max_length=32, db_index=True)
    posting_date = models.DateField(default=timezone.now, db_index=True)
    fiscal_period = models.ForeignKey(FiscalPeriod, on_delete=models.PROTECT, related_name="journal_entries")
    source_doc_type = models.CharField(max_length=32, blank=True, default="", db_index=True)
    source_doc_id = models.UUIDField(null=True, blank=True, db_index=True)
    currency = models.CharField(max_length=8, default="AED")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True)
    correlation_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    idempotency_key = models.CharField(max_length=128, blank=True, default="", db_index=True)
    reversal_of = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversals")
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.UUIDField(null=True, blank=True)
    remarks = models.TextField(blank=True, default="")
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "accounting_journal_entry"
        unique_together = [("tenant", "voucher_no")]
        indexes = [models.Index(fields=["tenant", "status", "posting_date"])]


class JournalLine(BaseModel):
    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="journal_lines")
    debit = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    credit = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    description = models.CharField(max_length=255, blank=True, default="")
    party_type = models.CharField(max_length=32, blank=True, default="")
    party_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "accounting_journal_line"
        unique_together = [("journal_entry", "line_no")]
        ordering = ["line_no"]


class GeneralLedgerEntry(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="gl_entries")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="gl_entries")
    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.PROTECT, related_name="gl_entries")
    journal_line = models.ForeignKey(JournalLine, on_delete=models.PROTECT, related_name="gl_entries")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="gl_entries")
    posting_date = models.DateField(db_index=True)
    fiscal_period = models.ForeignKey(FiscalPeriod, on_delete=models.PROTECT, related_name="gl_entries")
    debit = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    credit = models.DecimalField(max_digits=28, decimal_places=8, default=Decimal("0"))
    currency = models.CharField(max_length=8, default="AED")
    correlation_id = models.UUIDField(db_index=True)
    source_doc_type = models.CharField(max_length=32, blank=True, default="")
    source_doc_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "accounting_general_ledger_entry"
        indexes = [
            models.Index(fields=["tenant", "company", "posting_date"]),
            models.Index(fields=["tenant", "account", "posting_date"]),
        ]
        ordering = ["posting_date", "created_at"]
