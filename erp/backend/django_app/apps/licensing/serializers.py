from rest_framework import serializers


class ActivateLicenseSerializer(serializers.Serializer):
    license_key = serializers.CharField()
    device_fingerprint = serializers.CharField(max_length=128)
    device_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    platform = serializers.CharField(max_length=64, required=False, allow_blank=True, default="web")
