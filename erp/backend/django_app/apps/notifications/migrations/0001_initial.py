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
            name="Notification",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("recipient_id", models.UUIDField(blank=True, db_index=True, null=True)),
                ("title", models.CharField(max_length=200)),
                ("body", models.TextField(blank=True, default="")),
                ("category", models.CharField(choices=[("SYSTEM", "System"), ("INVENTORY", "Inventory"), ("SALES", "Sales"), ("PURCHASE", "Purchase"), ("FINANCE", "Finance"), ("HRM", "HRM"), ("APPROVAL", "Approval")], default="SYSTEM", max_length=16)),
                ("severity", models.CharField(choices=[("INFO", "Info"), ("WARNING", "Warning"), ("CRITICAL", "Critical")], default="INFO", max_length=16)),
                ("entity_type", models.CharField(blank=True, default="", max_length=64)),
                ("entity_id", models.CharField(blank=True, default="", max_length=64)),
                ("source_rule", models.CharField(blank=True, default="", max_length=64)),
                ("is_read", models.BooleanField(db_index=True, default=False)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to="tenancy.tenant")),
            ],
            options={
                "db_table": "notification",
                "indexes": [
                    models.Index(fields=["tenant", "recipient_id", "is_read"], name="notif_tenant_rcpt_read_idx"),
                    models.Index(fields=["tenant", "created_at"], name="notif_tenant_created_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="NotificationRule",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("code", models.CharField(db_index=True, max_length=64)),
                ("name", models.CharField(max_length=128)),
                ("trigger_type", models.CharField(choices=[("LOW_STOCK", "Low stock"), ("CUSTOM", "Custom / manual")], default="LOW_STOCK", max_length=16)),
                ("category", models.CharField(choices=[("SYSTEM", "System"), ("INVENTORY", "Inventory"), ("SALES", "Sales"), ("PURCHASE", "Purchase"), ("FINANCE", "Finance"), ("HRM", "HRM"), ("APPROVAL", "Approval")], default="INVENTORY", max_length=16)),
                ("severity", models.CharField(choices=[("INFO", "Info"), ("WARNING", "Warning"), ("CRITICAL", "Critical")], default="WARNING", max_length=16)),
                ("enabled", models.BooleanField(default=True)),
                ("realtime", models.BooleanField(default=True)),
                ("config", models.JSONField(blank=True, default=dict)),
                ("last_run_at", models.DateTimeField(blank=True, null=True)),
                ("last_match_count", models.IntegerField(default=0)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notification_rules", to="tenancy.tenant")),
            ],
            options={
                "db_table": "notification_rule",
                "unique_together": {("tenant", "code")},
                "indexes": [models.Index(fields=["tenant", "enabled"], name="notif_rule_tenant_en_idx")],
            },
        ),
    ]
