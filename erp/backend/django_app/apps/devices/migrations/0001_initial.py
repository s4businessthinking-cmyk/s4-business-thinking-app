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
            name="DesktopDevice",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("device_uid", models.CharField(db_index=True, max_length=128)),
                ("name", models.CharField(blank=True, default="", max_length=128)),
                ("platform", models.CharField(blank=True, default="", max_length=32)),
                ("station_type", models.CharField(choices=[("GENERAL", "General"), ("POS", "POS counter"), ("WAREHOUSE", "Warehouse station"), ("ACCOUNTING", "Accounting workstation")], default="GENERAL", max_length=16)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("ACTIVE", "Active"), ("DISABLED", "Disabled")], default="ACTIVE", max_length=16)),
                ("device_key_hash", models.CharField(blank=True, default="", max_length=128)),
                ("app_version", models.CharField(blank=True, default="", max_length=32)),
                ("update_channel", models.CharField(choices=[("stable", "Stable"), ("beta", "Beta"), ("canary", "Canary")], default="stable", max_length=16)),
                ("pinned_version", models.CharField(blank=True, default="", max_length=32)),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                ("window_config", models.JSONField(blank=True, default=dict)),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("registered_by", models.UUIDField(blank=True, null=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="desktop_devices", to="tenancy.tenant")),
            ],
            options={
                "db_table": "desktop_device",
                "unique_together": {("tenant", "device_uid")},
                "indexes": [models.Index(fields=["tenant", "status"], name="desktop_dev_tenant_stat_idx")],
            },
        ),
        migrations.CreateModel(
            name="DeviceActivation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("code", models.CharField(db_index=True, max_length=32)),
                ("station_type", models.CharField(choices=[("GENERAL", "General"), ("POS", "POS counter"), ("WAREHOUSE", "Warehouse station"), ("ACCOUNTING", "Accounting workstation")], default="GENERAL", max_length=16)),
                ("update_channel", models.CharField(choices=[("stable", "Stable"), ("beta", "Beta"), ("canary", "Canary")], default="stable", max_length=16)),
                ("created_by", models.UUIDField(blank=True, null=True)),
                ("expires_at", models.DateTimeField()),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("device", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="activations", to="devices.desktopdevice")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="device_activations", to="tenancy.tenant")),
            ],
            options={
                "db_table": "device_activation",
                "unique_together": {("tenant", "code")},
                "indexes": [models.Index(fields=["tenant", "consumed_at"], name="device_act_tenant_cons_idx")],
            },
        ),
        migrations.CreateModel(
            name="DeviceEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("event_type", models.CharField(choices=[("REGISTERED", "Registered"), ("HEARTBEAT", "Heartbeat"), ("UPDATE_PINNED", "Update pinned"), ("CHANNEL_CHANGED", "Channel changed"), ("DISABLED", "Disabled"), ("KEY_ROTATED", "Key rotated")], db_index=True, max_length=20)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("device", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="events", to="devices.desktopdevice")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="device_events", to="tenancy.tenant")),
            ],
            options={
                "db_table": "device_event",
                "indexes": [models.Index(fields=["tenant", "created_at"], name="device_evt_tenant_crt_idx")],
            },
        ),
    ]
