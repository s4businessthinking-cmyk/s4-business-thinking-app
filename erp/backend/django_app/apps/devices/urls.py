from django.urls import path

from apps.devices.views import (
    DeviceActionView,
    DeviceActivationView,
    DeviceHeartbeatView,
    DeviceListView,
    DeviceRedeemView,
    DeviceStatusView,
)

urlpatterns = [
    path("devices/activations/", DeviceActivationView.as_view(), name="devices-activations"),
    path("devices/redeem/", DeviceRedeemView.as_view(), name="devices-redeem"),
    path("devices/heartbeat/", DeviceHeartbeatView.as_view(), name="devices-heartbeat"),
    path("devices/list/", DeviceListView.as_view(), name="devices-list"),
    path("devices/action/", DeviceActionView.as_view(), name="devices-action"),
    path("devices/status/", DeviceStatusView.as_view(), name="devices-status"),
]
