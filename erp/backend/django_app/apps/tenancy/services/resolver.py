from apps.tenancy.context import TenantContext
from apps.tenancy.models import Tenant, TenantUser


class TenancyError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def user_tenant_queryset(user):
    return Tenant.objects.filter(
        tenant_users__user=user,
        tenant_users__status=TenantUser.Status.ACTIVE,
    ).distinct()


def resolve_tenant_for_user(*, user, tenant_id: str | None = None, tenant_slug: str | None = None) -> Tenant:
    qs = user_tenant_queryset(user)
    if tenant_id:
        tenant = qs.filter(id=tenant_id).first()
    elif tenant_slug:
        tenant = qs.filter(slug=tenant_slug).first()
    else:
        tenant = qs.order_by("created_at").first()
    if not tenant:
        raise TenancyError("TENANT_NOT_FOUND", "No active tenant membership found for user.", 404)
    if tenant.status in {Tenant.Status.SUSPENDED, Tenant.Status.ARCHIVED}:
        raise TenancyError("TENANT_SUSPENDED", "Tenant is not active.", 403)
    return tenant


def set_request_tenant(request, tenant: Tenant):
    request.tenant = tenant
    TenantContext.set(tenant_id=str(tenant.id), tenant_slug=tenant.slug)
