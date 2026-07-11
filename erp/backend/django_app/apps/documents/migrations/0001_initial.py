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
            name="Attachment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("entity_type", models.CharField(db_index=True, max_length=64)),
                ("entity_id", models.CharField(db_index=True, max_length=64)),
                ("filename", models.CharField(max_length=255)),
                ("content_type", models.CharField(blank=True, default="application/octet-stream", max_length=128)),
                ("size_bytes", models.BigIntegerField(default=0)),
                ("checksum_sha256", models.CharField(blank=True, default="", max_length=64)),
                ("storage_backend", models.CharField(default="local", max_length=32)),
                ("storage_key", models.CharField(blank=True, default="", max_length=512)),
                ("uploaded_by", models.UUIDField(blank=True, null=True)),
                ("is_deleted", models.BooleanField(db_index=True, default=False)),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attachments", to="tenancy.tenant")),
            ],
            options={
                "db_table": "attachment",
                "indexes": [
                    models.Index(fields=["tenant", "entity_type", "entity_id"], name="attach_tenant_entity_idx"),
                    models.Index(fields=["tenant", "created_at"], name="attach_tenant_created_idx"),
                ],
            },
        ),
    ]
