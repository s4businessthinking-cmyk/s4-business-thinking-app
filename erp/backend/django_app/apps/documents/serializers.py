from rest_framework import serializers

from apps.documents.models import Attachment


class AttachmentUploadSerializer(serializers.Serializer):
    entity_type = serializers.CharField(max_length=64)
    entity_id = serializers.CharField(max_length=64)
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    content_base64 = serializers.CharField()


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = [
            "id",
            "entity_type",
            "entity_id",
            "filename",
            "content_type",
            "size_bytes",
            "checksum_sha256",
            "storage_backend",
            "uploaded_by",
            "created_at",
        ]
