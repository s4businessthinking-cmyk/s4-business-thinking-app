from django.urls import path

from apps.sales.views import (
    CustomerListCreateView,
    DeliveryCreateFromSoView,
    DeliveryListView,
    DeliveryPostView,
    PosSaleListCreateView,
    PosSalePostView,
    PosTerminalListCreateView,
    SalesOrderConfirmView,
    SalesOrderListCreateView,
)

urlpatterns = [
    path("sales/customers/", CustomerListCreateView.as_view(), name="sales-customers"),
    path("sales/orders/", SalesOrderListCreateView.as_view(), name="sales-orders"),
    path("sales/orders/<uuid:so_id>/confirm/", SalesOrderConfirmView.as_view(), name="sales-order-confirm"),
    path("sales/deliveries/", DeliveryListView.as_view(), name="sales-deliveries"),
    path("sales/deliveries/from-so/", DeliveryCreateFromSoView.as_view(), name="sales-delivery-from-so"),
    path("sales/deliveries/<uuid:delivery_id>/post/", DeliveryPostView.as_view(), name="sales-delivery-post"),
    path("pos/terminals/", PosTerminalListCreateView.as_view(), name="pos-terminals"),
    path("pos/sales/", PosSaleListCreateView.as_view(), name="pos-sales"),
    path("pos/sales/<uuid:sale_id>/post/", PosSalePostView.as_view(), name="pos-sale-post"),
]
