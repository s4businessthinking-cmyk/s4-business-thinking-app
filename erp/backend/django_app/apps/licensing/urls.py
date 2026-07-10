from django.urls import path

from apps.licensing.views import LicenseActivateView, LicenseStatusView

urlpatterns = [
    path("license/status/", LicenseStatusView.as_view(), name="license-status"),
    path("license/activate/", LicenseActivateView.as_view(), name="license-activate"),
]
