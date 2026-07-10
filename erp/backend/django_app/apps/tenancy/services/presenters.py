from apps.licensing.services.activation import serialize_license_status
from apps.tenancy.models import Tenant


def serialize_tenant(tenant: Tenant) -> dict:
    company = tenant.companies.filter(is_default=True).first() or tenant.companies.first()
    branch = company.branches.filter(is_default=True).first() if company else None
    return {
        "id": str(tenant.id),
        "slug": tenant.slug,
        "name": tenant.name,
        "status": tenant.status,
        "mode": tenant.mode,
        "plan": tenant.plan.code if tenant.plan_id else None,
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        "company": {
            "id": str(company.id),
            "legal_name": company.legal_name,
        }
        if company
        else None,
        "branch": {
            "id": str(branch.id),
            "code": branch.code,
            "name": branch.name,
        }
        if branch
        else None,
        "license": serialize_license_status(tenant),
    }
