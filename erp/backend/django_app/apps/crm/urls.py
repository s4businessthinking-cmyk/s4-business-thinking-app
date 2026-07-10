from django.urls import path

from apps.crm.views import (
    ActivityListCreateView,
    LeadConvertView,
    LeadListCreateView,
    OpportunityListCreateView,
    OpportunityStageView,
)

urlpatterns = [
    path("crm/leads/", LeadListCreateView.as_view(), name="crm-leads"),
    path("crm/leads/<uuid:lead_id>/convert/", LeadConvertView.as_view(), name="crm-lead-convert"),
    path("crm/opportunities/", OpportunityListCreateView.as_view(), name="crm-opportunities"),
    path("crm/opportunities/<uuid:opportunity_id>/stage/", OpportunityStageView.as_view(), name="crm-opportunity-stage"),
    path("crm/activities/", ActivityListCreateView.as_view(), name="crm-activities"),
]
