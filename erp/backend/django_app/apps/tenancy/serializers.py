from rest_framework import serializers


class CreateTenantSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=64, required=False, allow_blank=True)
    plan_code = serializers.CharField(max_length=32, required=False, default="STARTER")
    company_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    branch_name = serializers.CharField(max_length=255, required=False, default="Main Branch")
    owner_email = serializers.EmailField(required=False, allow_blank=True)
