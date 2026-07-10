from rest_framework import serializers

from apps.reports.models import ReportDefinition, ReportRun


class ReportDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportDefinition
        fields = [
            "id",
            "code",
            "name",
            "category",
            "description",
            "permission_code",
            "supports_async",
            "default_format",
            "is_active",
        ]


class ReportRunSerializer(serializers.ModelSerializer):
    report_code = serializers.CharField(source="report.code", read_only=True)
    report_name = serializers.CharField(source="report.name", read_only=True)

    class Meta:
        model = ReportRun
        fields = [
            "id",
            "report_id",
            "report_code",
            "report_name",
            "status",
            "parameters",
            "result",
            "row_count",
            "error_message",
            "started_at",
            "completed_at",
            "created_at",
        ]


class ReportRunCreateSerializer(serializers.Serializer):
    report_code = serializers.CharField(max_length=64)
    parameters = serializers.DictField(required=False, default=dict)
