from decimal import Decimal

from django.db import models as dj_models
from django.db.models import Count, Sum
from django.utils import timezone

from apps.accounting.services.posting import get_trial_balance
from apps.crm.models import Lead, Opportunity
from apps.hrm.models import Department, Employee
from apps.inventory.models import Item, ItemWarehouseBalance
from apps.inventory.services.resolver import get_default_company
from apps.purchase.models import GoodsReceiptNote, PurchaseOrder
from apps.sales.models import DeliveryNote, PosSale, SalesOrder


class ReportsError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _dec(value) -> str:
    if value is None:
        return "0"
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return str(value.quantize(Decimal("0.0001")))


def get_dashboard_kpis(*, tenant) -> dict:
    stock = ItemWarehouseBalance.objects.filter(tenant=tenant).aggregate(
        total_qty=Sum("on_hand_qty"),
        total_value=Sum("stock_value"),
    )
    return {
        "generated_at": timezone.now().isoformat(),
        "inventory": {
            "active_items": Item.objects.filter(tenant=tenant, is_active=True).count(),
            "total_on_hand_qty": _dec(stock["total_qty"]),
            "total_stock_value": _dec(stock["total_value"]),
        },
        "sales": {
            "open_sales_orders": SalesOrder.objects.filter(
                tenant=tenant,
                status__in=[SalesOrder.Status.CONFIRMED, SalesOrder.Status.PARTIALLY_DELIVERED],
            ).count(),
            "posted_pos_sales": PosSale.objects.filter(tenant=tenant, status=PosSale.Status.POSTED).count(),
            "pos_revenue": _dec(
                PosSale.objects.filter(tenant=tenant, status=PosSale.Status.POSTED).aggregate(t=Sum("total_amount"))["t"]
            ),
            "posted_deliveries": DeliveryNote.objects.filter(tenant=tenant, status=DeliveryNote.Status.POSTED).count(),
        },
        "purchase": {
            "open_purchase_orders": PurchaseOrder.objects.filter(
                tenant=tenant,
                status__in=[PurchaseOrder.Status.SUBMITTED, PurchaseOrder.Status.PARTIALLY_RECEIVED],
            ).count(),
            "posted_grns": GoodsReceiptNote.objects.filter(tenant=tenant, status=GoodsReceiptNote.Status.POSTED).count(),
        },
        "crm": {
            "open_leads": Lead.objects.filter(
                tenant=tenant,
                status__in=[Lead.Status.NEW, Lead.Status.CONTACTED, Lead.Status.QUALIFIED],
            ).count(),
            "pipeline_value": _dec(
                Opportunity.objects.filter(
                    tenant=tenant,
                    stage__in=[
                        Opportunity.Stage.PROSPECTING,
                        Opportunity.Stage.PROPOSAL,
                        Opportunity.Stage.NEGOTIATION,
                    ],
                ).aggregate(t=Sum("expected_value"))["t"]
            ),
        },
        "hrm": {
            "active_employees": Employee.objects.filter(tenant=tenant, status=Employee.Status.ACTIVE).count(),
            "departments": Department.objects.filter(tenant=tenant, is_active=True).count(),
        },
    }


def get_inventory_stock_summary(*, tenant) -> list[dict]:
    rows = (
        ItemWarehouseBalance.objects.filter(tenant=tenant)
        .select_related("item", "warehouse")
        .order_by("warehouse__code", "item__sku")
    )
    return [
        {
            "warehouse_code": row.warehouse.code,
            "warehouse_name": row.warehouse.name,
            "item_sku": row.item.sku,
            "item_name": row.item.name,
            "on_hand_qty": _dec(row.on_hand_qty),
            "stock_value": _dec(row.stock_value),
            "valuation_rate": _dec(row.valuation_rate),
        }
        for row in rows[:1000]
    ]


def get_sales_summary(*, tenant) -> dict:
    pos = PosSale.objects.filter(tenant=tenant, status=PosSale.Status.POSTED).aggregate(
        count=Count("id"),
        total=Sum("total_amount"),
    )
    so = SalesOrder.objects.filter(tenant=tenant).aggregate(
        count=Count("id"),
        total=Sum("total_amount"),
        delivered=Count("id", filter=dj_models.Q(status=SalesOrder.Status.DELIVERED)),
    )
    return {
        "pos_sales": {"count": pos["count"] or 0, "total_amount": _dec(pos["total"])},
        "sales_orders": {
            "count": so["count"] or 0,
            "delivered_count": so["delivered"] or 0,
            "total_amount": _dec(so["total"]),
        },
    }


def get_purchase_summary(*, tenant) -> dict:
    po = PurchaseOrder.objects.filter(tenant=tenant).aggregate(
        count=Count("id"),
        total=Sum("total_amount"),
        received=Count("id", filter=dj_models.Q(status=PurchaseOrder.Status.RECEIVED)),
    )
    grn = GoodsReceiptNote.objects.filter(tenant=tenant, status=GoodsReceiptNote.Status.POSTED).aggregate(
        count=Count("id"),
    )
    return {
        "purchase_orders": {
            "count": po["count"] or 0,
            "received_count": po["received"] or 0,
            "total_amount": _dec(po["total"]),
        },
        "posted_grns": grn["count"] or 0,
    }


def get_crm_pipeline(*, tenant) -> list[dict]:
    rows = (
        Opportunity.objects.filter(tenant=tenant)
        .values("stage")
        .annotate(count=Count("id"), total_value=Sum("expected_value"))
        .order_by("stage")
    )
    return [
        {
            "stage": row["stage"],
            "count": row["count"],
            "total_value": _dec(row["total_value"]),
        }
        for row in rows
    ]


def get_hrm_headcount(*, tenant) -> list[dict]:
    rows = (
        Employee.objects.filter(tenant=tenant, status=Employee.Status.ACTIVE)
        .values("department__code", "department__name")
        .annotate(headcount=Count("id"))
        .order_by("department__code")
    )
    return [
        {
            "department_code": row["department__code"] or "UNASSIGNED",
            "department_name": row["department__name"] or "Unassigned",
            "headcount": row["headcount"],
        }
        for row in rows
    ]


def get_finance_trial_balance_report(*, tenant, company_id=None) -> dict:
    company = get_default_company(tenant)
    rows = get_trial_balance(tenant=tenant, company_id=company_id)
    total_debit = sum((Decimal(r["debit"]) for r in rows), Decimal("0"))
    total_credit = sum((Decimal(r["credit"]) for r in rows), Decimal("0"))
    return {
        "company_id": str(company.id),
        "company_name": company.trade_name or company.legal_name,
        "trial_balance": rows,
        "totals": {
            "debit": str(total_debit),
            "credit": str(total_credit),
            "balanced": total_debit == total_credit,
        },
    }


REPORT_RUNNERS = {
    "dashboard.kpis": get_dashboard_kpis,
    "inventory.stock_summary": get_inventory_stock_summary,
    "sales.summary": get_sales_summary,
    "purchase.summary": get_purchase_summary,
    "finance.trial_balance": get_finance_trial_balance_report,
    "crm.pipeline": get_crm_pipeline,
    "hrm.headcount": get_hrm_headcount,
}


def run_report(*, tenant, report_code: str, parameters: dict | None = None, actor_id=None) -> dict:
    from apps.reports.models import ReportDefinition, ReportRun

    definition = ReportDefinition.objects.filter(code=report_code, is_active=True).first()
    if not definition:
        raise ReportsError("REPORT_NOT_FOUND", f"Report {report_code} not found.", 404)
    runner = REPORT_RUNNERS.get(report_code)
    if not runner:
        raise ReportsError("RUNNER_NOT_FOUND", f"No runner for report {report_code}.", 500)

    run = ReportRun.objects.create(
        tenant=tenant,
        report=definition,
        status=ReportRun.Status.RUNNING,
        parameters=parameters or {},
        started_at=timezone.now(),
        requested_by=actor_id,
    )
    try:
        params = parameters or {}
        if report_code == "finance.trial_balance":
            result = runner(tenant=tenant, company_id=params.get("company_id"))
        else:
            result = runner(tenant=tenant)
        row_count = len(result) if isinstance(result, list) else 1
        run.status = ReportRun.Status.COMPLETED
        run.result = {"data": result}
        run.row_count = row_count
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "result", "row_count", "completed_at", "updated_at", "row_version"])
        return {
            "run_id": str(run.id),
            "report_code": report_code,
            "status": run.status,
            "row_count": row_count,
            "data": result,
        }
    except Exception as exc:
        run.status = ReportRun.Status.FAILED
        run.error_message = str(exc)
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "error_message", "completed_at", "updated_at", "row_version"])
        raise ReportsError("REPORT_FAILED", str(exc), 500) from exc
