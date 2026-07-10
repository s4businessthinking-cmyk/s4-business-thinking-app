from django.urls import path

from apps.sync.views import SyncAckView, SyncHandshakeView, SyncPullView, SyncPushView, SyncStatusView

urlpatterns = [
    path("sync/handshake/", SyncHandshakeView.as_view(), name="sync-handshake"),
    path("sync/pull/", SyncPullView.as_view(), name="sync-pull"),
    path("sync/push/", SyncPushView.as_view(), name="sync-push"),
    path("sync/ack/", SyncAckView.as_view(), name="sync-ack"),
    path("sync/status/", SyncStatusView.as_view(), name="sync-status"),
]
