from django.urls import path

from apps.ops.views import MetricsView, OpsStatusView

urlpatterns = [
    path("metrics/", MetricsView.as_view(), name="ops-metrics"),
    path("ops/status/", OpsStatusView.as_view(), name="ops-status"),
]
