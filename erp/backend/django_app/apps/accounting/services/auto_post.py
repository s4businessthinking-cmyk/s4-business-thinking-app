from decimal import Decimal

from apps.accounting.services.posting import _q, create_journal_entry, get_account_by_subtype
from apps.inventory.services.resolver import get_default_company
from apps.purchase.models import GoodsReceiptLine


def post_grn_journal(*, tenant, grn, postings: list[dict] | None = None, actor_id=None) -> dict | None:
    """GRN (perpetual): DR Inventory / CR GR-IR clearing."""
    del postings  # stock postings carry balance snapshots; JE uses GRN line amounts
    lines = GoodsReceiptLine.objects.filter(grn=grn)
    total_value = sum((_q(line.amount) for line in lines), Decimal("0"))
    if total_value <= 0:
        return None

    company = get_default_company(tenant)
    inventory = get_account_by_subtype(tenant, company, "INVENTORY")
    grir = get_account_by_subtype(tenant, company, "GRIR")

    je = create_journal_entry(
        tenant=tenant,
        lines=[
            {"account_id": inventory.id, "debit": total_value, "credit": 0, "description": f"GRN {grn.grn_number}"},
            {"account_id": grir.id, "debit": 0, "credit": total_value, "description": f"GRN {grn.grn_number}"},
        ],
        posting_date=grn.receipt_date,
        source_doc_type="GRN",
        source_doc_id=grn.id,
        correlation_id=grn.correlation_id,
        idempotency_key=f"je-grn-{grn.id}",
        remarks=f"Auto JE for GRN {grn.grn_number}",
        actor_id=actor_id,
        auto_post=True,
    )
    return {"journal_id": str(je.id), "voucher_no": je.voucher_no, "amount": str(total_value)}


def post_pos_sale_journal(*, tenant, sale, actor_id=None) -> dict | None:
    """POS: DR Cash / CR Revenue + DR COGS / CR Inventory."""
    total = _q(sale.total_amount)
    if total <= 0:
        return None

    company = get_default_company(tenant)
    cash = get_account_by_subtype(tenant, company, "CASH")
    revenue = get_account_by_subtype(tenant, company, "REVENUE")
    cogs = get_account_by_subtype(tenant, company, "COGS")
    inventory = get_account_by_subtype(tenant, company, "INVENTORY")

    je = create_journal_entry(
        tenant=tenant,
        lines=[
            {
                "account_id": cash.id,
                "debit": total,
                "credit": 0,
                "description": f"POS {sale.invoice_number or sale.draft_number}",
            },
            {"account_id": revenue.id, "debit": 0, "credit": total, "description": "Sales revenue"},
            {"account_id": cogs.id, "debit": total, "credit": 0, "description": "COGS"},
            {"account_id": inventory.id, "debit": 0, "credit": total, "description": "Inventory reduction"},
        ],
        posting_date=sale.sale_date.date(),
        source_doc_type="POS_SALE",
        source_doc_id=sale.id,
        correlation_id=sale.correlation_id,
        idempotency_key=f"je-pos-{sale.id}",
        remarks=f"Auto JE for POS {sale.invoice_number or sale.draft_number}",
        actor_id=actor_id,
        auto_post=True,
    )
    return {"journal_id": str(je.id), "voucher_no": je.voucher_no, "amount": str(total)}
