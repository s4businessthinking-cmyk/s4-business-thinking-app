from rest_framework import serializers

from apps.devices.models import (
    DesktopDevice,
    DeviceActivation,
    StationType,
    UpdateChannel,
)


class ActivationCreateSerializer(serializers.Serializer):
    station_type = serializers.ChoiceField(
        choices=StationType.choices, required=False, default=StationType.GENERAL
    )
    update_channel = serializers.ChoiceField(
        choices=UpdateChannel.choices, required=False, default=UpdateChannel.STABLE
    )
    ttl_minutes = serializers.IntegerField(required=False, min_value=1, max_value=60 * 24 * 7)


class RedeemSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    device_uid = serializers.CharField(max_length=128)
    name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    platform = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")


class HeartbeatSerializer(serializers.Serializer):
    device_uid = serializers.CharField(max_length=128)
    device_key = serializers.CharField(max_length=256)
    app_version = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")


class DeviceActionSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=["pin_version", "set_channel", "disable", "enable"])
    version = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    channel = serializers.ChoiceField(choices=UpdateChannel.choices, required=False)


class ActivationSerializer(serializers.ModelSerializer):
    is_consumed = serializers.SerializerMethodField()

    class Meta:
        model = DeviceActivation
        fields = [
            "id",
            "code",
            "station_type",
            "update_channel",
            "expires_at",
            "consumed_at",
            "is_consumed",
            "created_at",
        ]

    def get_is_consumed(self, obj):
        return obj.consumed_at is not None


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DesktopDevice
        fields = [
            "id",
            "device_uid",
            "name",
            "platform",
            "station_type",
            "status",
            "app_version",
            "update_channel",
            "pinned_version",
            "last_seen_at",
            "created_at",
        ]
