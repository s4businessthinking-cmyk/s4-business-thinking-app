from rest_framework import serializers


class SyncHandshakeSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=128)
    schema_version = serializers.IntegerField(required=False, default=0)
    client_hlc = serializers.DictField(required=False)


class SyncPullSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=128)
    entity_types = serializers.ListField(child=serializers.CharField(max_length=64), allow_empty=False)
    cursors = serializers.DictField(required=False, default=dict)
    client_hlc = serializers.DictField(required=False)


class SyncPushOpSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=64)
    entity_type = serializers.CharField(max_length=64)
    entity_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    op = serializers.CharField(max_length=16)
    payload = serializers.DictField(required=False, default=dict)
    prev_row_version = serializers.IntegerField(required=False, default=0)
    hlc = serializers.DictField()


class SyncPushSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=128)
    ops = SyncPushOpSerializer(many=True)
    client_hlc = serializers.DictField(required=False)


class SyncAckSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=128)
    acked_op_ids = serializers.ListField(child=serializers.CharField(max_length=64), allow_empty=True)
