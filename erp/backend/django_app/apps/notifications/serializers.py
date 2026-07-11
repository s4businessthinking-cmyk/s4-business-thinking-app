from rest_framework import serializers

from apps.notifications.models import (
    Notification,
    NotificationCategory,
    NotificationRule,
    NotificationSeverity,
)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "recipient_id",
            "title",
            "body",
            "category",
            "severity",
            "entity_type",
            "entity_id",
            "source_rule",
            "is_read",
            "read_at",
            "created_at",
        ]


class MarkReadSerializer(serializers.Serializer):
    notification_id = serializers.UUIDField()


class RuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationRule
        fields = [
            "id",
            "code",
            "name",
            "trigger_type",
            "category",
            "severity",
            "enabled",
            "realtime",
            "config",
            "last_run_at",
            "last_match_count",
            "created_at",
        ]


class RuleCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=128)
    trigger_type = serializers.ChoiceField(
        choices=NotificationRule.TriggerType.choices,
        required=False,
        default=NotificationRule.TriggerType.LOW_STOCK,
    )
    category = serializers.ChoiceField(
        choices=NotificationCategory.choices, required=False, default=NotificationCategory.INVENTORY
    )
    severity = serializers.ChoiceField(
        choices=NotificationSeverity.choices, required=False, default=NotificationSeverity.WARNING
    )
    enabled = serializers.BooleanField(required=False, default=True)
    realtime = serializers.BooleanField(required=False, default=True)
    config = serializers.DictField(required=False, default=dict)


class RuleActionSerializer(serializers.Serializer):
    rule_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=["run", "enable", "disable", "toggle"])
