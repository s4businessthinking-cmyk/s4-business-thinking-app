from rest_framework import serializers

from apps.security.models import ApiKey, SecurityPolicy


class ApiKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = ApiKey
        fields = [
            "id",
            "name",
            "prefix",
            "scopes",
            "enabled",
            "last_used_at",
            "expires_at",
            "revoked_at",
            "created_at",
        ]
        read_only_fields = fields


class ApiKeyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=128)
    scopes = serializers.ListField(child=serializers.CharField(), required=False, default=list)


class ApiKeyActionSerializer(serializers.Serializer):
    key_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=["revoke"])


class SecurityPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = SecurityPolicy
        fields = [
            "password_min_length",
            "password_require_complexity",
            "session_ttl_minutes",
            "max_login_attempts",
            "lockout_minutes",
            "require_mfa",
            "ip_allowlist",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]


class SecurityPolicyUpdateSerializer(serializers.Serializer):
    password_min_length = serializers.IntegerField(required=False)
    password_require_complexity = serializers.BooleanField(required=False)
    session_ttl_minutes = serializers.IntegerField(required=False)
    max_login_attempts = serializers.IntegerField(required=False)
    lockout_minutes = serializers.IntegerField(required=False)
    require_mfa = serializers.BooleanField(required=False)
    ip_allowlist = serializers.ListField(child=serializers.CharField(), required=False)


class AuditVerifySerializer(serializers.Serializer):
    limit = serializers.IntegerField(required=False, min_value=1, max_value=100000)
