from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounting.models import Account, FiscalPeriod, GeneralLedgerEntry, JournalEntry
from apps.accounting.serializers import (
    AccountSerializer,
    FiscalPeriodSerializer,
    GeneralLedgerSerializer,
    JournalCreateSerializer,
    JournalEntrySerializer,
)
from apps.accounting.services.posting import AccountingError, create_journal_entry, get_trial_balance, post_journal_entry
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


class AccountListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "accounting.account.read")
        if denied:
            return denied
        qs = Account.objects.filter(tenant=tenant, is_active=True).order_by("code")
        if request.query_params.get("postable_only", "0") == "1":
            qs = qs.filter(is_group=False)
        search = (request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search))
        return Response({"success": True, "accounts": AccountSerializer(qs[:500], many=True).data})


class FiscalPeriodListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "accounting.report.read")
        if denied:
            return denied
        qs = FiscalPeriod.objects.filter(tenant=tenant).select_related("fiscal_year").order_by("-start_date")
        return Response({"success": True, "periods": FiscalPeriodSerializer(qs[:100], many=True).data})


class JournalListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "accounting.je.read")
        if denied:
            return denied
        qs = JournalEntry.objects.filter(tenant=tenant).prefetch_related("lines__account").select_related("fiscal_period").order_by("-posting_date", "-created_at")
        status = (request.query_params.get("status") or "").strip().upper()
        if status:
            qs = qs.filter(status=status)
        return Response({"success": True, "journals": JournalEntrySerializer(qs[:200], many=True).data})

    def post(self, request):
        serializer = JournalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "accounting.je.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            je = create_journal_entry(
                tenant=tenant,
                lines=data["lines"],
                posting_date=data.get("posting_date"),
                remarks=data.get("remarks", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor_id=getattr(request.user, "id", None),
                auto_post=False,
            )
        except AccountingError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        je = JournalEntry.objects.filter(id=je.id).prefetch_related("lines__account").select_related("fiscal_period").first()
        return Response({"success": True, "journal": JournalEntrySerializer(je).data}, status=201)


class JournalPostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, journal_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "accounting.je.post")
        if denied:
            return denied
        try:
            result = post_journal_entry(
                tenant=tenant,
                journal_id=journal_id,
                actor_id=getattr(request.user, "id", None),
            )
        except AccountingError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        je = JournalEntry.objects.filter(id=journal_id, tenant=tenant).prefetch_related("lines__account").select_related("fiscal_period").first()
        return Response({"success": True, "result": result, "journal": JournalEntrySerializer(je).data if je else None})


class GeneralLedgerListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "accounting.gl.read")
        if denied:
            return denied
        qs = (
            GeneralLedgerEntry.objects.filter(tenant=tenant)
            .select_related("account", "journal_entry")
            .order_by("-posting_date", "-created_at")
        )
        account_id = request.query_params.get("account_id")
        if account_id:
            qs = qs.filter(account_id=account_id)
        return Response({"success": True, "gl_entries": GeneralLedgerSerializer(qs[:500], many=True).data})


class TrialBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "accounting.report.read")
        if denied:
            return denied
        rows = get_trial_balance(tenant=tenant, company_id=request.query_params.get("company_id"))
        total_debit = sum((float(r["debit"]) for r in rows), 0.0)
        total_credit = sum((float(r["credit"]) for r in rows), 0.0)
        return Response(
            {
                "success": True,
                "trial_balance": rows,
                "totals": {
                    "debit": str(total_debit),
                    "credit": str(total_credit),
                    "balanced": abs(total_debit - total_credit) < 0.0001,
                },
            }
        )
