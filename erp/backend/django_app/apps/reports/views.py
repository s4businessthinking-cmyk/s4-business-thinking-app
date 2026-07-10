from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.rbac.services.permissions import user_has_permission
from apps.reports.models import ReportDefinition, ReportRun
from apps.reports.serializers import ReportDefinitionSerializer, ReportRunCreateSerializer, ReportRunSerializer
from apps.reports.services.queries import (
    REPORT_RUNNERS,
    ReportsError,
    get_crm_pipeline,
    get_dashboard_kpis,
    get_finance_trial_balance_report,
    get_hrm_headcount,
    get_inventory_stock_summary,
    get_purchase_summary,
    get_sales_summary,
    run_report,
)
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


class ReportCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.catalog.read")
        if denied:
            return denied
        qs = ReportDefinition.objects.filter(is_active=True).order_by("category", "code")
        category = (request.query_params.get("category") or "").strip().upper()
        if category:
            qs = qs.filter(category=category)
        return Response({"success": True, "reports": ReportDefinitionSerializer(qs, many=True).data})


class DashboardKpisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.dashboard.read")
        if denied:
            return denied
        return Response({"success": True, "kpis": get_dashboard_kpis(tenant=tenant)})


class InventoryStockSummaryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.inventory.read")
        if denied:
            return denied
        rows = get_inventory_stock_summary(tenant=tenant)
        return Response({"success": True, "rows": rows, "row_count": len(rows)})


class SalesSummaryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.sales.read")
        if denied:
            return denied
        return Response({"success": True, "summary": get_sales_summary(tenant=tenant)})


class PurchaseSummaryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.purchase.read")
        if denied:
            return denied
        return Response({"success": True, "summary": get_purchase_summary(tenant=tenant)})


class FinanceTrialBalanceReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.finance.read")
        if denied:
            return denied
        data = get_finance_trial_balance_report(tenant=tenant, company_id=request.query_params.get("company_id"))
        return Response({"success": True, **data})


class CrmPipelineReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.crm.read")
        if denied:
            return denied
        rows = get_crm_pipeline(tenant=tenant)
        return Response({"success": True, "pipeline": rows})


class HrmHeadcountReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.hrm.read")
        if denied:
            return denied
        rows = get_hrm_headcount(tenant=tenant)
        return Response({"success": True, "headcount": rows})


class ReportRunListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.run.read")
        if denied:
            return denied
        qs = ReportRun.objects.filter(tenant=tenant).select_related("report").order_by("-created_at")[:100]
        return Response({"success": True, "runs": ReportRunSerializer(qs, many=True).data})

    def post(self, request):
        serializer = ReportRunCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "reports.run")
        if denied:
            return denied
        code = serializer.validated_data["report_code"]
        if code not in REPORT_RUNNERS:
            return Response(
                {"success": False, "error": {"code": "REPORT_NOT_FOUND", "message": f"Unknown report: {code}"}},
                status=404,
            )
        try:
            result = run_report(
                tenant=tenant,
                report_code=code,
                parameters=serializer.validated_data.get("parameters") or {},
                actor_id=getattr(request.user, "id", None),
            )
        except ReportsError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "run": result}, status=201)
