from django.urls import path

from apps.tenancy.views import TenantCreateView, TenantCurrentView, TenantListView

urlpatterns = [
    path("tenants/", TenantListView.as_view(), name="tenant-list"),
    path("tenants/current/", TenantCurrentView.as_view(), name="tenant-current"),
    path("tenants/create/", TenantCreateView.as_view(), name="tenant-create"),
]
