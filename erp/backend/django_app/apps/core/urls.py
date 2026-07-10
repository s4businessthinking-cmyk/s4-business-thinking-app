from django.urls import path

from apps.core.views.health import BuildStatusView, FullHealthView, LiveHealthView, ReadyHealthView

urlpatterns = [
    path("health/", FullHealthView.as_view(), name="health-full"),
    path("health/live/", LiveHealthView.as_view(), name="health-live"),
    path("health/ready/", ReadyHealthView.as_view(), name="health-ready"),
    path("build/status/", BuildStatusView.as_view(), name="build-status"),
]
