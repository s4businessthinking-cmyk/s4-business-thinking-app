import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone

from apps.accounting.models import Account, FiscalPeriod, GeneralLedgerEntry, JournalEntry, JournalLine
from apps.inventory.services.resolver import get_default_branch, get_default_company


class AccountingError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _q(value) -> Decimal:
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.00000001"))


def _next_voucher_no(tenant, prefix: str = "JE-") -> str:
    last = JournalEntry.objects.filter(tenant=tenant, voucher_no__startswith=prefix).aggregate(mx=Max("voucher_no")).get("mx")
    if not last:
        return f"{prefix}000001"
    try:
        seq = int(str(last).replace(prefix, "")) + 1
    except ValueError:
        seq = 1
    return f"{prefix}{seq:06d}"


def get_open_period(tenant, company, posting_date=None) -> FiscalPeriod:
    posting_date = posting_date or timezone.now().date()
    period = (
        FiscalPeriod.objects.filter(
            tenant=tenant,
            company=company,
            status=FiscalPeriod.Status.OPEN,
            start_date__lte=posting_date,
            end_date__gte=posting_date,
        )
        .order_by("start_date")
        .first()
    )
    if not period:
        raise AccountingError("PERIOD_CLOSED", "No open fiscal period for posting date.", 409)
    return period


def get_account_by_subtype(tenant, company, subtype: str) -> Account:
    account = Account.objects.filter(
        tenant=tenant,
        company=company,
        subtype=subtype,
        is_group=False,
        is_active=True,
    ).first()
    if not account:
        raise AccountingError("ACCOUNT_NOT_FOUND", f"Account with subtype {subtype} not found.", 404)
    return account


def validate_lines_balance(lines: list[dict]) -> tuple[Decimal, Decimal]:
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    for line in lines:
        debit = _q(line.get("debit") or 0)
        credit = _q(line.get("credit") or 0)
        if debit < 0 or credit < 0:
            raise AccountingError("INVALID_AMOUNT", "Debit and credit must be non-negative.")
        if debit > 0 and credit > 0:
            raise AccountingError("INVALID_LINE", "A line cannot have both debit and credit.")
        if debit == 0 and credit == 0:
            raise AccountingError("INVALID_LINE", "A line must have debit or credit.")
        total_debit += debit
        total_credit += credit
    if total_debit != total_credit:
        raise AccountingError(
            "UNBALANCED",
            f"Journal entry unbalanced: debit={total_debit} credit={total_credit}",
            409,
        )
    return total_debit, total_credit


@transaction.atomic
def create_journal_entry(
    *,
    tenant,
    lines: list[dict],
    posting_date=None,
    source_doc_type: str = "",
    source_doc_id=None,
    correlation_id=None,
    idempotency_key: str = "",
    remarks: str = "",
    actor_id=None,
    auto_post: bool = False,
) -> JournalEntry:
    if idempotency_key:
        existing = JournalEntry.objects.filter(tenant=tenant, idempotency_key=idempotency_key).first()
        if existing:
            return existing

    company = get_default_company(tenant)
    branch = get_default_branch(company)
    posting_date = posting_date or timezone.now().date()
    period = get_open_period(tenant, company, posting_date)
    validate_lines_balance(lines)

    je = JournalEntry.objects.create(
        tenant=tenant,
        company=company,
        branch=branch,
        voucher_no=_next_voucher_no(tenant),
        posting_date=posting_date,
        fiscal_period=period,
        source_doc_type=source_doc_type,
        source_doc_id=source_doc_id,
        correlation_id=correlation_id or uuid.uuid4(),
        idempotency_key=idempotency_key,
        remarks=remarks,
        posted_by=actor_id,
    )
    for idx, line in enumerate(lines, start=1):
        account = Account.objects.filter(id=line["account_id"], tenant=tenant, company=company, is_group=False).first()
        if not account:
            raise AccountingError("ACCOUNT_NOT_FOUND", f"Account {line.get('account_id')} not found.", 404)
        JournalLine.objects.create(
            journal_entry=je,
            line_no=idx,
            account=account,
            debit=_q(line.get("debit") or 0),
            credit=_q(line.get("credit") or 0),
            description=line.get("description", ""),
            party_type=line.get("party_type", ""),
            party_id=line.get("party_id"),
        )
    if auto_post:
        post_journal_entry(tenant=tenant, journal_id=je.id, actor_id=actor_id)
        je.refresh_from_db()
    return je


@transaction.atomic
def post_journal_entry(*, tenant, journal_id, actor_id=None) -> dict:
    je = JournalEntry.objects.filter(id=journal_id, tenant=tenant).select_for_update(of=("self",)).first()
    if not je:
        raise AccountingError("JE_NOT_FOUND", "Journal entry not found.", 404)
    if je.status == JournalEntry.Status.POSTED:
        return {"idempotent_replay": True, "journal_id": str(je.id), "voucher_no": je.voucher_no, "status": je.status}
    if je.status != JournalEntry.Status.DRAFT:
        raise AccountingError("INVALID_STATUS", f"Cannot post journal in status {je.status}.", 409)

    if je.fiscal_period.status not in {FiscalPeriod.Status.OPEN, FiscalPeriod.Status.SOFT_CLOSE}:
        raise AccountingError("PERIOD_CLOSED", "Fiscal period is closed for posting.", 409)

    lines = list(JournalLine.objects.filter(journal_entry=je).select_related("account"))
    validate_lines_balance([{"debit": l.debit, "credit": l.credit} for l in lines])

    for line in lines:
        GeneralLedgerEntry.objects.create(
            tenant=tenant,
            company=je.company,
            journal_entry=je,
            journal_line=line,
            account=line.account,
            posting_date=je.posting_date,
            fiscal_period=je.fiscal_period,
            debit=line.debit,
            credit=line.credit,
            currency=je.currency,
            correlation_id=je.correlation_id,
            source_doc_type=je.source_doc_type,
            source_doc_id=je.source_doc_id,
        )

    je.status = JournalEntry.Status.POSTED
    je.posted_at = timezone.now()
    je.posted_by = actor_id
    je.save(update_fields=["status", "posted_at", "posted_by", "updated_at", "row_version"])

    return {
        "idempotent_replay": False,
        "journal_id": str(je.id),
        "voucher_no": je.voucher_no,
        "status": je.status,
        "gl_lines": len(lines),
    }


def get_trial_balance(*, tenant, company_id=None) -> list[dict]:
    company = get_default_company(tenant)
    if company_id:
        from apps.tenancy.models import Company

        company = Company.objects.filter(id=company_id, tenant=tenant).first() or company

    qs = (
        GeneralLedgerEntry.objects.filter(tenant=tenant, company=company)
        .values("account_id", "account__code", "account__name", "account__account_type")
        .annotate(total_debit=Sum("debit"), total_credit=Sum("credit"))
        .order_by("account__code")
    )
    rows = []
    for row in qs:
        debit = _q(row["total_debit"] or 0)
        credit = _q(row["total_credit"] or 0)
        rows.append(
            {
                "account_id": str(row["account_id"]),
                "account_code": row["account__code"],
                "account_name": row["account__name"],
                "account_type": row["account__account_type"],
                "debit": str(debit),
                "credit": str(credit),
                "balance": str(debit - credit),
            }
        )
    return rows
