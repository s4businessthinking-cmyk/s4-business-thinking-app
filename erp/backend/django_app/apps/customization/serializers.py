from rest_framework import serializers

from apps.customization.models import (
    CustomFieldDef,
    CustomFieldValue,
    FieldType,
    NumberSequence,
)


class FieldDefCreateSerializer(serializers.Serializer):
    entity_type = serializers.CharField(max_length=64)
    code = serializers.CharField(max_length=64)
    label = serializers.CharField(max_length=128)
    field_type = serializers.ChoiceField(choices=FieldType.choices, required=False, default=FieldType.TEXT)
    options = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    required = serializers.BooleanField(required=False, default=False)
    sort_order = serializers.IntegerField(required=False, default=0)


class FieldDefSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomFieldDef
        fields = ["id", "entity_type", "code", "label", "field_type", "options", "required", "enabled", "sort_order"]


class SetValueSerializer(serializers.Serializer):
    field_id = serializers.UUIDField()
    entity_id = serializers.CharField(max_length=64)
    value = serializers.CharField(required=False, allow_blank=True, default="")


class FieldValueSerializer(serializers.ModelSerializer):
    code = serializers.CharField(source="field.code", read_only=True)
    field_type = serializers.CharField(source="field.field_type", read_only=True)

    class Meta:
        model = CustomFieldValue
        fields = ["id", "field_id", "code", "field_type", "entity_type", "entity_id", "value_text"]


class SequenceCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    prefix = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    suffix = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    padding = serializers.IntegerField(required=False, default=4, min_value=0, max_value=18)
    next_number = serializers.IntegerField(required=False, default=1, min_value=1)
    reset_period = serializers.ChoiceField(
        choices=NumberSequence.ResetPeriod.choices, required=False, default=NumberSequence.ResetPeriod.NONE
    )


class SequenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NumberSequence
        fields = ["id", "code", "name", "prefix", "suffix", "padding", "next_number", "reset_period", "current_period", "enabled"]


class SequenceNextSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64)
