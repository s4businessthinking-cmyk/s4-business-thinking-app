from django.urls import path

from apps.security.views import (
    ApiKeyActionView,
    ApiKeyView,
    AuditVerifyView,
    SecurityPolicyView,
    SecurityStatusView,
)

urlpatterns = [
    path("security/status/", SecurityStatusView.as_view(), name="security-status"),
    path("security/policy/", SecurityPolicyView.as_view(), name="security-policy"),
    path("security/api-keys/", ApiKeyView.as_view(), name="security-api-keys"),
    path("security/api-keys/action/", ApiKeyActionView.as_view(), name="security-api-keys-action"),
    path("security/audit/verify/", AuditVerifyView.as_view(), name="security-audit-verify"),
]
