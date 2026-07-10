from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.auth_service.urls")),
    path("api/v1/", include("apps.tenancy.urls")),
    path("api/v1/", include("apps.licensing.urls")),
    path("api/v1/", include("apps.sync.urls")),
    path("api/v1/", include("apps.inventory.urls")),
    path("api/v1/", include("apps.purchase.urls")),
    path("api/v1/", include("apps.sales.urls")),
    path("api/v1/", include("apps.accounting.urls")),
    path("api/v1/", include("apps.hrm.urls")),
    path("api/v1/", include("apps.crm.urls")),
    path("api/v1/", include("apps.reports.urls")),
]
