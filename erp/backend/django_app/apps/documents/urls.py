from django.urls import path

from apps.documents.views import (
    AttachmentDeleteView,
    AttachmentDownloadView,
    AttachmentListCreateView,
    DocumentsStatusView,
)

urlpatterns = [
    path("documents/attachments/", AttachmentListCreateView.as_view(), name="documents-attachments"),
    path("documents/attachments/<uuid:attachment_id>/download/", AttachmentDownloadView.as_view(), name="documents-download"),
    path("documents/attachments/<uuid:attachment_id>/delete/", AttachmentDeleteView.as_view(), name="documents-delete"),
    path("documents/status/", DocumentsStatusView.as_view(), name="documents-status"),
]
