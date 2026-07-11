from django.urls import path

from apps.notifications.views import (
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationRuleActionView,
    NotificationRuleView,
    NotificationStatusView,
)

urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path("notifications/status/", NotificationStatusView.as_view(), name="notifications-status"),
    path("notifications/mark-read/", NotificationMarkReadView.as_view(), name="notifications-mark-read"),
    path("notifications/mark-all-read/", NotificationMarkAllReadView.as_view(), name="notifications-mark-all-read"),
    path("notifications/rules/", NotificationRuleView.as_view(), name="notifications-rules"),
    path("notifications/rules/action/", NotificationRuleActionView.as_view(), name="notifications-rules-action"),
]
