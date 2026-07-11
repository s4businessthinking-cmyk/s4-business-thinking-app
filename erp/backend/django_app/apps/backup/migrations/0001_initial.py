import django.db.models.deletion
import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("tenancy", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="BackupJob",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("backup_type", models.CharField(choices=[("FULL", "Full system"), ("TENANT", "Per-tenant export")], default="FULL", max_length=16)),
                ("method", models.CharField(choices=[("PG_DUMP", "pg_dump (SQL)"), ("DJANGO_DUMPDATA", "Django dumpdata (JSON)")], default="PG_DUMP", max_length=24)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("RUNNING", "Running"), ("SUCCESS", "Success"), ("FAILED", "Failed"), ("EXPIRED", "Expired / purged")], db_index=True, default="PENDING", max_length=16)),
                ("storage_key", models.CharField(blank=True, default="", max_length=512)),
                ("filename", models.CharField(blank=True, default="", max_length=255)),
                ("size_bytes", models.BigIntegerField(default=0)),
                ("checksum_sha256", models.CharField(blank=True, default="", max_length=64)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("duration_ms", models.BigIntegerField(default=0)),
                ("retention_until", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("triggered_by", models.UUIDField(blank=True, null=True)),
                ("is_scheduled", models.BooleanField(default=False)),
                ("error", models.TextField(blank=True, default="")),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("tenant", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="backup_jobs", to="tenancy.tenant")),
            ],
            options={
                "db_table": "backup_job",
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["tenant", "created_at"], name="backup_tenant_created_idx"),
                    models.Index(fields=["status", "retention_until"], name="backup_status_ret_idx"),
                ],
            },
        ),
    ]
