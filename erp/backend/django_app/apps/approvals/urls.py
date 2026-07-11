from django.urls import path

from apps.approvals.views import (
    ApprovalStatusView,
    RequestActionView,
    RequestView,
    WorkflowStepView,
    WorkflowView,
)

urlpatterns = [
    path("approvals/workflows/", WorkflowView.as_view(), name="approvals-workflows"),
    path("approvals/workflows/<uuid:workflow_id>/steps/", WorkflowStepView.as_view(), name="approvals-workflow-steps"),
    path("approvals/requests/", RequestView.as_view(), name="approvals-requests"),
    path("approvals/requests/action/", RequestActionView.as_view(), name="approvals-request-action"),
    path("approvals/status/", ApprovalStatusView.as_view(), name="approvals-status"),
]
