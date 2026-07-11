from rest_framework import serializers


class WsTicketSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")


class RelayOutboxSerializer(serializers.Serializer):
    batch_size = serializers.IntegerField(required=False, min_value=1, max_value=1000, default=200)


class PublishTestSerializer(serializers.Serializer):
    group = serializers.CharField(max_length=128, required=False, allow_blank=True, default="tenant")
    event_type = serializers.CharField(max_length=64, required=False, default="realtime.test.ping")
    message = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
