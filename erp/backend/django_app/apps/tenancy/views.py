from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.tenancy.models import Branch, Company, Plan, Tenant, TenantUser, Warehouse
from apps.tenancy.serializers import CreateTenantSerializer
from apps.tenancy.services.presenters import serialize_tenant
from apps.tenancy.services.resolver import TenancyError, resolve_tenant_for_user, set_request_tenant, user_tenant_queryset


class TenantListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenants = user_tenant_queryset(request.user).select_related("plan").order_by("name")
        return Response({"success": True, "tenants": [serialize_tenant(t) for t in tenants]})


class TenantCurrentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.META.get("HTTP_X_TENANT_ID")
        tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
        try:
            tenant = resolve_tenant_for_user(
                user=request.user,
                tenant_id=tenant_id,
                tenant_slug=tenant_slug,
            )
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        set_request_tenant(request, tenant)
        return Response({"success": True, "tenant": serialize_tenant(tenant)})


class TenantCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.platform_role != User.PlatformRole.SUPER_ADMIN and not request.user.is_superuser:
            return Response(
                {"success": False, "error": {"code": "FORBIDDEN", "message": "Super admin required."}},
                status=403,
            )

        serializer = CreateTenantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        plan = Plan.objects.filter(code=data.get("plan_code") or "STARTER").first()
        if not plan:
            return Response(
                {"success": False, "error": {"code": "PLAN_NOT_FOUND", "message": "Plan not found."}},
                status=404,
            )

        with transaction.atomic():
            tenant = Tenant.objects.create(
                name=data["name"],
                slug=data.get("slug") or "",
                plan=plan,
                status=Tenant.Status.TRIAL,
                trial_ends_at=timezone.now() + timezone.timedelta(days=15),
            )
            company = Company.objects.create(
                tenant=tenant,
                legal_name=data.get("company_name") or data["name"],
                trade_name=data["name"],
                is_default=True,
            )
            branch = Branch.objects.create(
                company=company,
                code="MAIN",
                name=data.get("branch_name") or "Main Branch",
                is_default=True,
            )
            Warehouse.objects.create(branch=branch, code="WH01", name="Main Warehouse", is_default=True)

            owner_email = (data.get("owner_email") or request.user.email).lower()
            owner = User.objects.filter(email=owner_email).first() or request.user
            TenantUser.objects.create(tenant=tenant, user=owner, status=TenantUser.Status.ACTIVE, is_owner=True)

        return Response({"success": True, "tenant": serialize_tenant(tenant)}, status=201)
