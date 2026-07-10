from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.crm.models import Activity, Lead
from apps.crm.services import create_activity, create_lead, create_opportunity, publish_lead_to_sync
from apps.hrm.models import Employee, LeaveRequest
from apps.hrm.services import (
    approve_leave_request,
    create_department,
    create_employee,
    create_leave_request,
    publish_employee_to_sync,
    record_attendance,
    submit_leave_request,
)
from apps.rbac.services.seed import ensure_permissions, ensure_roles
from apps.sync.models import SyncEntityRegistry
from apps.tenancy.models import Tenant


class Command(BaseCommand):
    help = "Seed HRM departments/employees and CRM leads/opportunities for s4-demo tenant"

    def handle(self, *args, **options):
        perms = ensure_permissions()
        ensure_roles(perms)

        for entity_type, sync_class, merge_strategy, direction in [
            ("employee", "R", "server_wins", "server_to_client"),
            ("lead", "D", "lww", "bidirectional"),
            ("crm_opportunity", "D", "lww", "bidirectional"),
        ]:
            SyncEntityRegistry.objects.update_or_create(
                entity_type=entity_type,
                defaults={
                    "sync_class": sync_class,
                    "merge_strategy": merge_strategy,
                    "direction": direction,
                    "enabled": True,
                },
            )

        tenant = Tenant.objects.filter(slug="s4-demo").first()
        if not tenant:
            self.stdout.write(self.style.WARNING("s4-demo tenant not found"))
            return

        dept = create_department(tenant=tenant, code="OPS", name="Operations")
        create_department(tenant=tenant, code="SALES", name="Sales")

        if not Employee.objects.filter(tenant=tenant, employee_code="EMP-001").exists():
            emp = create_employee(
                tenant=tenant,
                employee_code="EMP-001",
                first_name="Ahmed",
                last_name="Khan",
                email="ahmed.khan@s4-demo.local",
                phone="+971500000201",
                designation="Store Manager",
                department_id=dept.id,
            )
            publish_employee_to_sync(emp)
            record_attendance(tenant=tenant, employee_id=emp.id, attendance_date=timezone.now().date(), check_in=True)
            leave = create_leave_request(
                tenant=tenant,
                employee_id=emp.id,
                leave_type=LeaveRequest.LeaveType.ANNUAL,
                from_date=date.today() + timedelta(days=30),
                to_date=date.today() + timedelta(days=32),
                reason="Family visit",
            )
            leave = submit_leave_request(tenant=tenant, leave_id=leave.id)
            approve_leave_request(tenant=tenant, leave_id=leave.id)
            self.stdout.write(self.style.SUCCESS(f"Seeded employee {emp.employee_code} with attendance + approved leave"))
        else:
            self.stdout.write(self.style.SUCCESS("Demo employee already exists"))

        if not Lead.objects.filter(tenant=tenant, lead_number="LD-000001").exists():
            lead = create_lead(
                tenant=tenant,
                name="Gulf Trading LLC",
                company_name="Gulf Trading LLC",
                email="sales@gulftrading.example",
                phone="+971500000301",
                source="WEBSITE",
                notes="Interested in bulk spare parts supply",
            )
            publish_lead_to_sync(lead)
            opp = create_opportunity(
                tenant=tenant,
                title="Annual supply contract",
                lead_id=lead.id,
                expected_value=50000,
                expected_close_date=date.today() + timedelta(days=45),
                probability=40,
            )
            create_activity(
                tenant=tenant,
                activity_type=Activity.ActivityType.CALL,
                subject="Intro call with procurement",
                notes="Discuss MOQ and delivery SLA",
                lead_id=lead.id,
                opportunity_id=opp.id,
            )
            self.stdout.write(self.style.SUCCESS(f"Seeded lead {lead.lead_number} + opportunity {opp.opp_number}"))
        else:
            self.stdout.write(self.style.SUCCESS("Demo CRM lead already exists"))

        self.stdout.write(self.style.SUCCESS(f"HRM/CRM seed complete for {tenant.slug}"))
