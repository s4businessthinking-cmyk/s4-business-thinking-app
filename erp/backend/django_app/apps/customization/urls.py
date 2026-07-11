from django.urls import path

from apps.customization.views import (
    CustomizationStatusView,
    FieldDefView,
    FieldValueView,
    SequenceNextView,
    SequenceView,
)

urlpatterns = [
    path("customization/fields/", FieldDefView.as_view(), name="customization-fields"),
    path("customization/values/", FieldValueView.as_view(), name="customization-values"),
    path("customization/sequences/", SequenceView.as_view(), name="customization-sequences"),
    path("customization/sequences/next/", SequenceNextView.as_view(), name="customization-sequences-next"),
    path("customization/status/", CustomizationStatusView.as_view(), name="customization-status"),
]
