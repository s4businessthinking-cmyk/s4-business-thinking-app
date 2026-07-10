from decimal import Decimal

from django.db import transaction
from django.db.models import Max

from apps.crm.models import Activity, Lead, Opportunity
from apps.hrm.services import _next_code
from apps.sales.models import Customer
from apps.sales.services.sales import publish_customer_to_sync
from apps.sync.models import server_hlc_now
from apps.sync.models.sync import SyncedRecord


class CrmError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def publish_lead_to_sync(lead: Lead) -> None:
    hlc = server_hlc_now()
    SyncedRecord.objects.update_or_create(
        tenant=lead.tenant,
        entity_type="lead",
        entity_id=str(lead.id),
        defaults={
            "payload": {
                "lead_number": lead.lead_number,
                "name": lead.name,
                "company_name": lead.company_name,
                "email": lead.email,
                "phone": lead.phone,
                "source": lead.source,
                "status": lead.status,
                "row_version": lead.row_version,
            },
            "hlc_wall_ms": hlc.wall_ms,
            "hlc_logical": hlc.logical,
            "hlc_node_id": "server",
            "is_deleted": lead.status == Lead.Status.LOST,
        },
    )


@transaction.atomic
def create_lead(
    *,
    tenant,
    name: str,
    company_name: str = "",
    email: str = "",
    phone: str = "",
    source: str = "",
    notes: str = "",
) -> Lead:
    lead_number = _next_code(tenant, "LD-", Lead, "lead_number")
    lead = Lead.objects.create(
        tenant=tenant,
        lead_number=lead_number,
        name=name,
        company_name=company_name,
        email=email,
        phone=phone,
        source=source,
        notes=notes,
        status=Lead.Status.NEW,
    )
    publish_lead_to_sync(lead)
    return lead


@transaction.atomic
def create_opportunity(
    *,
    tenant,
    title: str,
    lead_id=None,
    customer_id=None,
    expected_value=0,
    expected_close_date=None,
    probability: int = 10,
    remarks: str = "",
) -> Opportunity:
    lead = None
    customer = None
    if lead_id:
        lead = Lead.objects.filter(id=lead_id, tenant=tenant).first()
        if not lead:
            raise CrmError("LEAD_NOT_FOUND", "Lead not found.", 404)
    if customer_id:
        customer = Customer.objects.filter(id=customer_id, tenant=tenant).first()
        if not customer:
            raise CrmError("CUSTOMER_NOT_FOUND", "Customer not found.", 404)
    if not lead and not customer:
        raise CrmError("PARTY_REQUIRED", "Lead or customer is required.", 400)
    opp_number = _next_code(tenant, "OPP-", Opportunity, "opp_number")
    return Opportunity.objects.create(
        tenant=tenant,
        opp_number=opp_number,
        title=title,
        lead=lead,
        customer=customer,
        expected_value=Decimal(str(expected_value or 0)),
        expected_close_date=expected_close_date,
        probability=min(max(int(probability), 0), 100),
        remarks=remarks,
        stage=Opportunity.Stage.PROSPECTING,
    )


@transaction.atomic
def update_opportunity_stage(*, tenant, opportunity_id, stage: str) -> Opportunity:
    opp = Opportunity.objects.filter(id=opportunity_id, tenant=tenant).select_for_update(of=("self",)).first()
    if not opp:
        raise CrmError("OPPORTUNITY_NOT_FOUND", "Opportunity not found.", 404)
    valid = {c[0] for c in Opportunity.Stage.choices}
    if stage not in valid:
        raise CrmError("INVALID_STAGE", f"Invalid stage: {stage}.", 400)
    opp.stage = stage
    opp.save(update_fields=["stage", "updated_at", "row_version"])
    return opp


@transaction.atomic
def create_activity(
    *,
    tenant,
    activity_type: str,
    subject: str,
    notes: str = "",
    due_at=None,
    lead_id=None,
    opportunity_id=None,
    assigned_employee_id=None,
) -> Activity:
    lead = None
    opportunity = None
    if lead_id:
        lead = Lead.objects.filter(id=lead_id, tenant=tenant).first()
        if not lead:
            raise CrmError("LEAD_NOT_FOUND", "Lead not found.", 404)
    if opportunity_id:
        opportunity = Opportunity.objects.filter(id=opportunity_id, tenant=tenant).first()
        if not opportunity:
            raise CrmError("OPPORTUNITY_NOT_FOUND", "Opportunity not found.", 404)
    if not lead and not opportunity:
        raise CrmError("RELATED_REQUIRED", "Lead or opportunity is required.", 400)
    employee = None
    if assigned_employee_id:
        from apps.hrm.models import Employee

        employee = Employee.objects.filter(id=assigned_employee_id, tenant=tenant).first()
        if not employee:
            raise CrmError("EMPLOYEE_NOT_FOUND", "Employee not found.", 404)
    return Activity.objects.create(
        tenant=tenant,
        activity_type=activity_type,
        subject=subject,
        notes=notes,
        due_at=due_at,
        lead=lead,
        opportunity=opportunity,
        assigned_employee=employee,
        status=Activity.Status.OPEN,
    )


@transaction.atomic
def convert_lead_to_customer(*, tenant, lead_id, customer_code: str | None = None) -> dict:
    lead = Lead.objects.filter(id=lead_id, tenant=tenant).select_for_update(of=("self",)).first()
    if not lead:
        raise CrmError("LEAD_NOT_FOUND", "Lead not found.", 404)
    if lead.status == Lead.Status.CONVERTED and lead.converted_customer_id:
        return {
            "idempotent_replay": True,
            "lead_id": str(lead.id),
            "customer_id": str(lead.converted_customer_id),
            "customer_code": lead.converted_customer.code if lead.converted_customer else None,
        }
    if lead.status == Lead.Status.LOST:
        raise CrmError("LEAD_LOST", "Cannot convert a lost lead.", 409)
    code = (customer_code or f"CUS-{lead.lead_number.replace('LD-', '')}").upper()
    if Customer.objects.filter(tenant=tenant, code=code).exists():
        code = _next_code(tenant, "CUS-", Customer, "code")
    customer = Customer.objects.create(
        tenant=tenant,
        code=code,
        name=lead.name,
        email=lead.email,
        phone=lead.phone,
        address=lead.company_name,
        is_active=True,
    )
    publish_customer_to_sync(customer)
    lead.status = Lead.Status.CONVERTED
    lead.converted_customer = customer
    lead.save(update_fields=["status", "converted_customer", "updated_at", "row_version"])
    publish_lead_to_sync(lead)
    return {
        "idempotent_replay": False,
        "lead_id": str(lead.id),
        "customer_id": str(customer.id),
        "customer_code": customer.code,
    }
