from datetime import date

from django.core.management.base import BaseCommand

from apps.accounting.models import Account, FiscalPeriod, FiscalYear, JournalEntry
from apps.accounting.services.auto_post import post_grn_journal, post_pos_sale_journal
from apps.inventory.services.resolver import get_default_company
from apps.purchase.models import GoodsReceiptNote
from apps.rbac.services.seed import ensure_permissions, ensure_roles
from apps.sales.models import PosSale
from apps.tenancy.models import Tenant


GCC_COA = [
    ("1000", "Cash on Hand", Account.AccountType.ASSET, Account.Subtype.CASH),
    ("1100", "Bank Account", Account.AccountType.ASSET, Account.Subtype.BANK),
    ("1200", "Inventory", Account.AccountType.ASSET, Account.Subtype.INVENTORY),
    ("1300", "Accounts Receivable", Account.AccountType.ASSET, Account.Subtype.AR),
    ("2000", "Accounts Payable", Account.AccountType.LIABILITY, Account.Subtype.AP),
    ("2100", "GR/IR Clearing", Account.AccountType.LIABILITY, Account.Subtype.GRIR),
    ("2200", "VAT Payable", Account.AccountType.LIABILITY, Account.Subtype.TAX_PAYABLE),
    ("3000", "Owner Equity", Account.AccountType.EQUITY, Account.Subtype.OTHER),
    ("4000", "Sales Revenue", Account.AccountType.INCOME, Account.Subtype.REVENUE),
    ("5000", "Cost of Goods Sold", Account.AccountType.EXPENSE, Account.Subtype.COGS),
    ("5100", "Operating Expenses", Account.AccountType.EXPENSE, Account.Subtype.OTHER),
]


class Command(BaseCommand):
    help = "Seed GCC chart of accounts, fiscal periods, and backfill auto journal entries"

    def handle(self, *args, **options):
        perms = ensure_permissions()
        ensure_roles(perms)

        tenant = Tenant.objects.filter(slug="s4-demo").first()
        if not tenant:
            self.stdout.write(self.style.WARNING("s4-demo tenant not found"))
            return

        company = get_default_company(tenant)
        for code, name, account_type, subtype in GCC_COA:
            Account.objects.update_or_create(
                tenant=tenant,
                company=company,
                code=code,
                defaults={
                    "name": name,
                    "account_type": account_type,
                    "subtype": subtype,
                    "is_group": False,
                    "currency": "AED",
                    "is_active": True,
                },
            )

        fy, _ = FiscalYear.objects.update_or_create(
            tenant=tenant,
            company=company,
            name="FY-2026",
            defaults={
                "start_date": date(2026, 1, 1),
                "end_date": date(2026, 12, 31),
                "is_active": True,
            },
        )
        FiscalPeriod.objects.update_or_create(
            tenant=tenant,
            company=company,
            name="2026-OPEN",
            defaults={
                "fiscal_year": fy,
                "start_date": date(2026, 1, 1),
                "end_date": date(2026, 12, 31),
                "status": FiscalPeriod.Status.OPEN,
            },
        )

        for grn in GoodsReceiptNote.objects.filter(tenant=tenant, status=GoodsReceiptNote.Status.POSTED):
            if not JournalEntry.objects.filter(tenant=tenant, source_doc_type="GRN", source_doc_id=grn.id).exists():
                result = post_grn_journal(tenant=tenant, grn=grn)
                if result:
                    self.stdout.write(self.style.SUCCESS(f"Backfilled JE for GRN {grn.grn_number}: {result['voucher_no']}"))

        for sale in PosSale.objects.filter(tenant=tenant, status=PosSale.Status.POSTED):
            if not JournalEntry.objects.filter(tenant=tenant, source_doc_type="POS_SALE", source_doc_id=sale.id).exists():
                result = post_pos_sale_journal(tenant=tenant, sale=sale)
                if result:
                    self.stdout.write(
                        self.style.SUCCESS(f"Backfilled JE for POS {sale.invoice_number or sale.draft_number}: {result['voucher_no']}")
                    )

        self.stdout.write(self.style.SUCCESS(f"Accounting seed complete for {tenant.slug}"))
