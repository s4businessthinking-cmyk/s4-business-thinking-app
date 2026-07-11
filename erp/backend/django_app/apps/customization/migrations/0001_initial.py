import django.db.models.deletion
import django.utils.timezone
import uuid
from django.db import migrations, models

FIELD_TYPES = [
    ("TEXT", "Text"),
    ("NUMBER", "Number"),
    ("DATE", "Date"),
    ("BOOLEAN", "Boolean"),
    ("SELECT", "Select"),
]


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("tenancy", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomFieldDef",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("entity_type", models.CharField(db_index=True, max_length=64)),
                ("code", models.CharField(max_length=64)),
                ("label", models.CharField(max_length=128)),
                ("field_type", models.CharField(choices=FIELD_TYPES, default="TEXT", max_length=16)),
                ("options", models.JSONField(blank=True, default=list)),
                ("required", models.BooleanField(default=False)),
                ("enabled", models.BooleanField(default=True)),
                ("sort_order", models.IntegerField(default=0)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="custom_field_defs", to="tenancy.tenant")),
            ],
            options={
                "db_table": "custom_field_def",
                "ordering": ["sort_order", "code"],
                "unique_together": {("tenant", "entity_type", "code")},
                "indexes": [models.Index(fields=["tenant", "entity_type", "enabled"], name="cfdef_tenant_ent_en_idx")],
            },
        ),
        migrations.CreateModel(
            name="CustomFieldValue",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("entity_type", models.CharField(db_index=True, max_length=64)),
                ("entity_id", models.CharField(db_index=True, max_length=64)),
                ("value_text", models.TextField(blank=True, default="")),
                ("field", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="values", to="customization.customfielddef")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="custom_field_values", to="tenancy.tenant")),
            ],
            options={
                "db_table": "custom_field_value",
                "unique_together": {("field", "entity_id")},
                "indexes": [models.Index(fields=["tenant", "entity_type", "entity_id"], name="cfval_tenant_entity_idx")],
            },
        ),
        migrations.CreateModel(
            name="NumberSequence",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("code", models.CharField(db_index=True, max_length=64)),
                ("name", models.CharField(blank=True, default="", max_length=128)),
                ("prefix", models.CharField(blank=True, default="", max_length=32)),
                ("suffix", models.CharField(blank=True, default="", max_length=32)),
                ("padding", models.IntegerField(default=4)),
                ("next_number", models.BigIntegerField(default=1)),
                ("reset_period", models.CharField(choices=[("NONE", "Never"), ("YEARLY", "Yearly"), ("MONTHLY", "Monthly")], default="NONE", max_length=16)),
                ("current_period", models.CharField(blank=True, default="", max_length=16)),
                ("enabled", models.BooleanField(default=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="number_sequences", to="tenancy.tenant")),
            ],
            options={
                "db_table": "number_sequence",
                "unique_together": {("tenant", "code")},
            },
        ),
    ]
