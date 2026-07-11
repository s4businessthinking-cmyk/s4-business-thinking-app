from django.urls import path

from apps.realtime.views import (
    RealtimePublishTestView,
    RealtimeRelayView,
    RealtimeSseView,
    RealtimeStatusView,
    WsTicketView,
)

urlpatterns = [
    path("realtime/ws-ticket/", WsTicketView.as_view(), name="realtime-ws-ticket"),
    path("realtime/relay-outbox/", RealtimeRelayView.as_view(), name="realtime-relay-outbox"),
    path("realtime/publish-test/", RealtimePublishTestView.as_view(), name="realtime-publish-test"),
    path("realtime/status/", RealtimeStatusView.as_view(), name="realtime-status"),
    path("realtime/sse/", RealtimeSseView.as_view(), name="realtime-sse"),
]
