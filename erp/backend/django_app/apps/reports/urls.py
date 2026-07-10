from django.urls import path

from apps.reports.views import (
    CrmPipelineReportView,
    DashboardKpisView,
    FinanceTrialBalanceReportView,
    HrmHeadcountReportView,
    InventoryStockSummaryReportView,
    PurchaseSummaryReportView,
    ReportCatalogView,
    ReportRunListCreateView,
    SalesSummaryReportView,
)

urlpatterns = [
    path("reports/catalog/", ReportCatalogView.as_view(), name="reports-catalog"),
    path("reports/dashboard/kpis/", DashboardKpisView.as_view(), name="reports-dashboard-kpis"),
    path("reports/inventory/stock-summary/", InventoryStockSummaryReportView.as_view(), name="reports-inventory-stock"),
    path("reports/sales/summary/", SalesSummaryReportView.as_view(), name="reports-sales-summary"),
    path("reports/purchase/summary/", PurchaseSummaryReportView.as_view(), name="reports-purchase-summary"),
    path("reports/finance/trial-balance/", FinanceTrialBalanceReportView.as_view(), name="reports-finance-tb"),
    path("reports/crm/pipeline/", CrmPipelineReportView.as_view(), name="reports-crm-pipeline"),
    path("reports/hrm/headcount/", HrmHeadcountReportView.as_view(), name="reports-hrm-headcount"),
    path("reports/runs/", ReportRunListCreateView.as_view(), name="reports-runs"),
]
