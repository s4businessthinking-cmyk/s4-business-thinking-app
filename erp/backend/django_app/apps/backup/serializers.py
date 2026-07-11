from rest_framework import serializers

from apps.backup.models import BackupJob


class BackupJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupJob
        fields = [
            "id",
            "tenant",
            "backup_type",
            "method",
            "status",
            "filename",
            "size_bytes",
            "checksum_sha256",
            "started_at",
            "finished_at",
            "duration_ms",
            "retention_until",
            "is_scheduled",
            "error",
            "created_at",
        ]
        read_only_fields = fields


class BackupCreateSerializer(serializers.Serializer):
    backup_type = serializers.ChoiceField(
        choices=[BackupJob.BackupType.FULL, BackupJob.BackupType.TENANT],
        default=BackupJob.BackupType.FULL,
    )
    method = serializers.ChoiceField(
        choices=[BackupJob.Method.PG_DUMP, BackupJob.Method.DJANGO_DUMPDATA],
        required=False,
    )


class BackupActionSerializer(serializers.Serializer):
    job_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=["verify"])
