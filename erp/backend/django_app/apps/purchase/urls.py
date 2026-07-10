from django.urls import path

from apps.purchase.views import (
    GrnCreateFromPoView,
    GrnListView,
    GrnPostView,
    PurchaseOrderDetailView,
    PurchaseOrderListCreateView,
    PurchaseOrderSubmitView,
    SupplierListCreateView,
)

urlpatterns = [
    path("purchase/suppliers/", SupplierListCreateView.as_view(), name="purchase-suppliers"),
    path("purchase/orders/", PurchaseOrderListCreateView.as_view(), name="purchase-orders"),
    path("purchase/orders/<uuid:po_id>/", PurchaseOrderDetailView.as_view(), name="purchase-order-detail"),
    path("purchase/orders/<uuid:po_id>/submit/", PurchaseOrderSubmitView.as_view(), name="purchase-order-submit"),
    path("purchase/grn/", GrnListView.as_view(), name="purchase-grn-list"),
    path("purchase/grn/from-po/", GrnCreateFromPoView.as_view(), name="purchase-grn-from-po"),
    path("purchase/grn/<uuid:grn_id>/post/", GrnPostView.as_view(), name="purchase-grn-post"),
]
