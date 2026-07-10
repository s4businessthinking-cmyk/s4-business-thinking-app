from rest_framework import serializers

from apps.crm.models import Activity, Lead, Opportunity


class LeadSerializer(serializers.ModelSerializer):
    converted_customer_code = serializers.CharField(source="converted_customer.code", read_only=True, default="")

    class Meta:
        model = Lead
        fields = [
            "id",
            "lead_number",
            "name",
            "company_name",
            "email",
            "phone",
            "source",
            "status",
            "converted_customer_id",
            "converted_customer_code",
            "notes",
            "correlation_id",
            "row_version",
            "created_at",
        ]


class LeadCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    company_name = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    source = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class LeadConvertSerializer(serializers.Serializer):
    customer_code = serializers.CharField(max_length=32, required=False, allow_blank=True)


class OpportunitySerializer(serializers.ModelSerializer):
    lead_number = serializers.CharField(source="lead.lead_number", read_only=True, default="")
    customer_code = serializers.CharField(source="customer.code", read_only=True, default="")

    class Meta:
        model = Opportunity
        fields = [
            "id",
            "opp_number",
            "title",
            "lead_id",
            "lead_number",
            "customer_id",
            "customer_code",
            "stage",
            "expected_value",
            "expected_close_date",
            "probability",
            "remarks",
            "correlation_id",
            "row_version",
            "created_at",
        ]


class OpportunityCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    lead_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    expected_value = serializers.DecimalField(max_digits=18, decimal_places=4, required=False, default=0)
    expected_close_date = serializers.DateField(required=False, allow_null=True)
    probability = serializers.IntegerField(required=False, default=10, min_value=0, max_value=100)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class OpportunityStageSerializer(serializers.Serializer):
    stage = serializers.ChoiceField(choices=Opportunity.Stage.choices)


class ActivitySerializer(serializers.ModelSerializer):
    lead_number = serializers.CharField(source="lead.lead_number", read_only=True, default="")
    opp_number = serializers.CharField(source="opportunity.opp_number", read_only=True, default="")

    class Meta:
        model = Activity
        fields = [
            "id",
            "activity_type",
            "subject",
            "notes",
            "due_at",
            "completed_at",
            "status",
            "lead_id",
            "lead_number",
            "opportunity_id",
            "opp_number",
            "assigned_employee_id",
            "row_version",
            "created_at",
        ]


class ActivityCreateSerializer(serializers.Serializer):
    activity_type = serializers.ChoiceField(choices=Activity.ActivityType.choices)
    subject = serializers.CharField(max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    lead_id = serializers.UUIDField(required=False, allow_null=True)
    opportunity_id = serializers.UUIDField(required=False, allow_null=True)
    assigned_employee_id = serializers.UUIDField(required=False, allow_null=True)
