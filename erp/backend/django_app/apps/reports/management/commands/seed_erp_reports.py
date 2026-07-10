from django.core.management.base import BaseCommand

from apps.reports.models import ReportDefinition
from apps.rbac.services.seed import ensure_permissions, ensure_roles


CATALOG = [
    ("dashboard.kpis", "Executive KPI Dashboard", ReportDefinition.Category.DASHBOARD, "Cross-module KPI snapshot", "reports.dashboard.read"),
    ("inventory.stock_summary", "Stock Balance Summary", ReportDefinition.Category.INVENTORY, "On-hand qty and value by warehouse/item", "reports.inventory.read"),
    ("sales.summary", "Sales Summary", ReportDefinition.Category.SALES, "POS and sales order totals", "reports.sales.read"),
    ("purchase.summary", "Purchase Summary", ReportDefinition.Category.PURCHASE, "PO and GRN totals", "reports.purchase.read"),
    ("finance.trial_balance", "Trial Balance", ReportDefinition.Category.FINANCE, "Posted GL trial balance", "reports.finance.read"),
    ("crm.pipeline", "CRM Pipeline", ReportDefinition.Category.CRM, "Opportunity count and value by stage", "reports.crm.read"),
    ("hrm.headcount", "HRM Headcount", ReportDefinition.Category.HRM, "Active employees by department", "reports.hrm.read"),
]


class Command(BaseCommand):
    help = "Seed report catalog definitions"

    def handle(self, *args, **options):
        perms = ensure_permissions()
        ensure_roles(perms)
        for code, name, category, description, permission_code in CATALOG:
            ReportDefinition.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "category": category,
                    "description": description,
                    "permission_code": permission_code,
                    "is_active": True,
                    "supports_async": False,
                    "default_format": "JSON",
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Reports catalog seeded: {len(CATALOG)} definitions"))
