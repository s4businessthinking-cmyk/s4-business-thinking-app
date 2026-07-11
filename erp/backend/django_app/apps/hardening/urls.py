from django.urls import path

from apps.hardening.views import (
    HardeningStatusView,
    IdempotencySelfTestView,
    RateLimitSelfTestView,
)

urlpatterns = [
    path("hardening/status/", HardeningStatusView.as_view(), name="hardening-status"),
    path("hardening/selftest/rate-limit/", RateLimitSelfTestView.as_view(), name="hardening-rate-limit"),
    path("hardening/selftest/idempotency/", IdempotencySelfTestView.as_view(), name="hardening-idempotency"),
]
