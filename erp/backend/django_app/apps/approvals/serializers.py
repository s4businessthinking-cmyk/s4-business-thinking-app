from rest_framework import serializers

from apps.approvals.models import (
    ApprovalAction,
    ApprovalRequest,
    ApprovalStep,
    ApprovalWorkflow,
    DocumentType,
)


class WorkflowCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=128)
    document_type = serializers.ChoiceField(choices=DocumentType.choices, required=False, default=DocumentType.GENERIC)
    enabled = serializers.BooleanField(required=False, default=True)
    min_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0)
    steps = serializers.ListField(child=serializers.DictField(), required=False, default=list)


class StepSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApprovalStep
        fields = ["id", "sequence", "name", "approver_role"]


class WorkflowSerializer(serializers.ModelSerializer):
    steps = StepSerializer(many=True, read_only=True)

    class Meta:
        model = ApprovalWorkflow
        fields = ["id", "code", "name", "document_type", "enabled", "min_amount", "steps", "created_at"]


class SubmitSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(choices=DocumentType.choices, required=False, default=DocumentType.GENERIC)
    document_id = serializers.CharField(max_length=64)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0)


class ActionSerializer(serializers.Serializer):
    request_id = serializers.UUIDField()
    decision = serializers.ChoiceField(choices=ApprovalAction.Decision.choices)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class ActionLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApprovalAction
        fields = ["id", "sequence", "actor_id", "decision", "comment", "created_at"]


class RequestSerializer(serializers.ModelSerializer):
    actions = ActionLogSerializer(many=True, read_only=True)

    class Meta:
        model = ApprovalRequest
        fields = [
            "id",
            "document_type",
            "document_id",
            "amount",
            "status",
            "current_sequence",
            "requested_by",
            "actions",
            "created_at",
        ]
