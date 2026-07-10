from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    device_fingerprint = serializers.CharField(max_length=128)
    device_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    platform = serializers.CharField(max_length=64, required=False, allow_blank=True, default="web")
    tenant_slug = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")


class RefreshSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class RevokeSessionSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
