from django.urls import path

from apps.backup.views import (
    BackupActionView,
    BackupCreateView,
    BackupListView,
    BackupStatusView,
)

urlpatterns = [
    path("backup/status/", BackupStatusView.as_view(), name="backup-status"),
    path("backup/jobs/", BackupListView.as_view(), name="backup-jobs"),
    path("backup/run/", BackupCreateView.as_view(), name="backup-run"),
    path("backup/action/", BackupActionView.as_view(), name="backup-action"),
]
