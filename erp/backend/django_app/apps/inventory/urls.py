from django.urls import path

from apps.inventory.views import (
    ItemDetailView,
    ItemListCreateView,
    StockAdjustView,
    StockBalanceListView,
    StockLedgerListView,
    StockOpeningView,
)

urlpatterns = [
    path("inventory/items/", ItemListCreateView.as_view(), name="inventory-items"),
    path("inventory/items/<uuid:item_id>/", ItemDetailView.as_view(), name="inventory-item-detail"),
    path("inventory/stock/balance/", StockBalanceListView.as_view(), name="inventory-stock-balance"),
    path("inventory/stock/ledger/", StockLedgerListView.as_view(), name="inventory-stock-ledger"),
    path("inventory/stock/opening/", StockOpeningView.as_view(), name="inventory-stock-opening"),
    path("inventory/stock/adjust/", StockAdjustView.as_view(), name="inventory-stock-adjust"),
]
