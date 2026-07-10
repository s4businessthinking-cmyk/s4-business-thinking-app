from django.utils.deprecation import MiddlewareMixin

from apps.tenancy.context import TenantContext
from apps.tenancy.models import Tenant
from apps.tenancy.services.resolver import set_request_tenant


class TenantMiddleware(MiddlewareMixin):
    HEADER = "HTTP_X_TENANT_ID"

    def process_request(self, request):
        TenantContext.clear()
        request.tenant = None

        tenant_id = request.META.get(self.HEADER)
        tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
        if not tenant_id and not tenant_slug:
            return None

        if tenant_id:
            tenant = Tenant.objects.filter(id=tenant_id).first()
        else:
            tenant = Tenant.objects.filter(slug=tenant_slug).first()

        if tenant:
            set_request_tenant(request, tenant)
        return None

    def process_response(self, request, response):
        TenantContext.clear()
        return response
