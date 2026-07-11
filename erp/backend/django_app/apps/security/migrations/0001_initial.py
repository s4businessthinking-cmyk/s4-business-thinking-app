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
            name="ApiKey",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("name", models.CharField(max_length=128)),
                ("prefix", models.CharField(db_index=True, max_length=16)),
                ("key_hash", models.CharField(max_length=64)),
                ("scopes", models.JSONField(blank=True, default=list)),
                ("enabled", models.BooleanField(db_index=True, default=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.UUIDField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="api_keys", to="tenancy.tenant")),
            ],
            options={
                "db_table": "api_key",
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["tenant", "enabled"], name="apikey_tenant_enabled_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="SecurityPolicy",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("password_min_length", models.IntegerField(default=8)),
                ("password_require_complexity", models.BooleanField(default=True)),
                ("session_ttl_minutes", models.IntegerField(default=720)),
                ("max_login_attempts", models.IntegerField(default=5)),
                ("lockout_minutes", models.IntegerField(default=15)),
                ("require_mfa", models.BooleanField(default=False)),
                ("ip_allowlist", models.JSONField(blank=True, default=list)),
                ("updated_by", models.UUIDField(blank=True, null=True)),
                ("tenant", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="security_policy", to="tenancy.tenant")),
            ],
            options={
                "db_table": "security_policy",
            },
        ),
    ]
