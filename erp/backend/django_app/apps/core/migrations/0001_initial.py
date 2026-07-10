from django.contrib import admin
from django.db.models import Index
from django.db import migrations, models
import django.utils.timezone
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="AuditLogEntry",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("category", models.CharField(choices=[("SYSTEM", "System"), ("AUTH", "Authentication"), ("API", "API"), ("HEALTH", "Health")], db_index=True, max_length=32)),
                ("severity", models.CharField(choices=[("INFO", "Info"), ("WARNING", "Warning"), ("ERROR", "Error"), ("CRITICAL", "Critical")], default="INFO", max_length=16)),
                ("action", models.CharField(db_index=True, max_length=128)),
                ("actor_id", models.UUIDField(blank=True, null=True)),
                ("correlation_id", models.CharField(blank=True, default="", max_length=64)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, default="")),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("prev_hash", models.CharField(blank=True, default="", max_length=128)),
                ("entry_hash", models.CharField(blank=True, default="", max_length=128)),
            ],
            options={
                "db_table": "audit_log_entry",
                "ordering": ["-created_at"],
                "indexes": [
                    Index(fields=["category", "created_at"], name="audit_cat_created_idx"),
                    Index(fields=["action", "created_at"], name="audit_act_created_idx"),
                ],
            },
        ),
    ]
