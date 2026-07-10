from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.identity.models import User
from apps.tenancy.models import Branch, Company, Plan, Tenant, TenantUser, Warehouse


class Command(BaseCommand):
    help = "Seed ERP tenancy plans and default demo tenant"

    def handle(self, *args, **options):
        plans = [
            ("STARTER", "Starter", "STARTER", ["sales", "purchase", "inventory"], {"users": 5, "branches": 1}),
            ("PROFESSIONAL", "Professional", "PROFESSIONAL", ["sales", "purchase", "inventory", "accounting"], {"users": 25, "branches": 5}),
            ("ENTERPRISE", "Enterprise", "ENTERPRISE", ["sales", "purchase", "inventory", "accounting", "pos", "hrm"], {"users": 9999, "branches": 999}),
        ]
        plan_map = {}
        for code, name, edition, modules, limits in plans:
            plan, _ = Plan.objects.get_or_create(
                code=code,
                defaults={"name": name, "edition": edition, "modules": modules, "limits": limits},
            )
            plan_map[code] = plan

        admin = User.objects.filter(email="admin@s4.local").first()
        if not admin:
            self.stdout.write(self.style.WARNING("admin@s4.local not found; run seed_erp_auth first"))
            return

        tenant, created = Tenant.objects.get_or_create(
            slug="s4-demo",
            defaults={
                "name": "S4 Demo Shop",
                "plan": plan_map["STARTER"],
                "status": Tenant.Status.TRIAL,
                "trial_ends_at": timezone.now() + timezone.timedelta(days=15),
            },
        )
        TenantUser.objects.get_or_create(
            tenant=tenant,
            user=admin,
            defaults={"status": TenantUser.Status.ACTIVE, "is_owner": True},
        )
        company, _ = Company.objects.get_or_create(
            tenant=tenant,
            legal_name="S4 Demo Trading LLC",
            defaults={"trade_name": "S4 Demo Shop", "is_default": True},
        )
        branch, _ = Branch.objects.get_or_create(
            company=company,
            code="MAIN",
            defaults={"name": "Main Branch", "is_default": True},
        )
        Warehouse.objects.get_or_create(
            branch=branch,
            code="WH01",
            defaults={"name": "Main Warehouse", "is_default": True},
        )

        self.stdout.write(self.style.SUCCESS(f"Tenancy seeded. Demo tenant: {tenant.slug} (created={created})"))
