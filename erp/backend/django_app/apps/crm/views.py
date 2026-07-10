from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.crm.models import Activity, Lead, Opportunity
from apps.crm.serializers import (
    ActivityCreateSerializer,
    ActivitySerializer,
    LeadConvertSerializer,
    LeadCreateSerializer,
    LeadSerializer,
    OpportunityCreateSerializer,
    OpportunitySerializer,
    OpportunityStageSerializer,
)
from apps.crm.services import (
    CrmError,
    convert_lead_to_customer,
    create_activity,
    create_lead,
    create_opportunity,
    update_opportunity_stage,
)
from apps.rbac.services.permissions import user_has_permission
from apps.tenancy.services.resolver import TenancyError, resolve_tenant_for_user, set_request_tenant


def _resolve_tenant(request):
    tenant_id = request.META.get("HTTP_X_TENANT_ID")
    tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
    tenant = resolve_tenant_for_user(user=request.user, tenant_id=tenant_id, tenant_slug=tenant_slug)
    set_request_tenant(request, tenant)
    return tenant


def _require_perm(request, code: str):
    if not user_has_permission(request.user, code):
        return Response(
            {"success": False, "error": {"code": "PERMISSION_DENIED", "message": f"Missing permission: {code}"}},
            status=403,
        )
    return None


class LeadListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "crm.lead.read")
        if denied:
            return denied
        qs = Lead.objects.filter(tenant=tenant).select_related("converted_customer").order_by("-created_at")[:200]
        return Response({"success": True, "leads": LeadSerializer(qs, many=True).data})

    def post(self, request):
        serializer = LeadCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "crm.lead.create")
        if denied:
            return denied
        try:
            lead = create_lead(tenant=tenant, **serializer.validated_data)
        except CrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "lead": LeadSerializer(lead).data}, status=201)


class LeadConvertView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, lead_id):
        serializer = LeadConvertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "crm.lead.convert")
        if denied:
            return denied
        code = serializer.validated_data.get("customer_code") or None
        try:
            result = convert_lead_to_customer(tenant=tenant, lead_id=lead_id, customer_code=code)
        except CrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        lead = Lead.objects.filter(id=lead_id, tenant=tenant).select_related("converted_customer").first()
        return Response({"success": True, "result": result, "lead": LeadSerializer(lead).data if lead else None})


class OpportunityListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "crm.opportunity.read")
        if denied:
            return denied
        qs = Opportunity.objects.filter(tenant=tenant).select_related("lead", "customer").order_by("-created_at")[:200]
        return Response({"success": True, "opportunities": OpportunitySerializer(qs, many=True).data})

    def post(self, request):
        serializer = OpportunityCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "crm.opportunity.create")
        if denied:
            return denied
        try:
            opp = create_opportunity(tenant=tenant, **serializer.validated_data)
        except CrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "opportunity": OpportunitySerializer(opp).data}, status=201)


class OpportunityStageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, opportunity_id):
        serializer = OpportunityStageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "crm.opportunity.update")
        if denied:
            return denied
        try:
            opp = update_opportunity_stage(
                tenant=tenant,
                opportunity_id=opportunity_id,
                stage=serializer.validated_data["stage"],
            )
        except CrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "opportunity": OpportunitySerializer(opp).data})


class ActivityListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "crm.activity.read")
        if denied:
            return denied
        qs = Activity.objects.filter(tenant=tenant).select_related("lead", "opportunity").order_by("-created_at")[:200]
        return Response({"success": True, "activities": ActivitySerializer(qs, many=True).data})

    def post(self, request):
        serializer = ActivityCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "crm.activity.create")
        if denied:
            return denied
        try:
            activity = create_activity(tenant=tenant, **serializer.validated_data)
        except CrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "activity": ActivitySerializer(activity).data}, status=201)
