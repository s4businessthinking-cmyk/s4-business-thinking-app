import django.db.models.deletion
import django.utils.timezone
import uuid
from decimal import Decimal
from django.db import migrations, models

DOC_CHOICES = [
    ("PURCHASE_ORDER", "Purchase Order"),
    ("SALES_ORDER", "Sales Order"),
    ("JOURNAL_ENTRY", "Journal Entry"),
    ("LEAVE_REQUEST", "Leave Request"),
    ("GENERIC", "Generic"),
]


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("tenancy", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ApprovalWorkflow",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("code", models.CharField(db_index=True, max_length=64)),
                ("name", models.CharField(max_length=128)),
                ("document_type", models.CharField(choices=DOC_CHOICES, default="GENERIC", max_length=32)),
                ("enabled", models.BooleanField(default=True)),
                ("min_amount", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=18)),
                ("config", models.JSONField(blank=True, default=dict)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="approval_workflows", to="tenancy.tenant")),
            ],
            options={
                "db_table": "approval_workflow",
                "unique_together": {("tenant", "code")},
                "indexes": [models.Index(fields=["tenant", "document_type", "enabled"], name="appr_wf_tenant_doc_en_idx")],
            },
        ),
        migrations.CreateModel(
            name="ApprovalStep",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("sequence", models.IntegerField(default=1)),
                ("name", models.CharField(max_length=128)),
                ("approver_role", models.CharField(blank=True, default="", max_length=64)),
                ("config", models.JSONField(blank=True, default=dict)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="approval_steps", to="tenancy.tenant")),
                ("workflow", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="steps", to="approvals.approvalworkflow")),
            ],
            options={
                "db_table": "approval_step",
                "ordering": ["sequence"],
                "unique_together": {("workflow", "sequence")},
            },
        ),
        migrations.CreateModel(
            name="ApprovalRequest",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("document_type", models.CharField(choices=DOC_CHOICES, default="GENERIC", max_length=32)),
                ("document_id", models.CharField(db_index=True, max_length=64)),
                ("requested_by", models.UUIDField(blank=True, null=True)),
                ("amount", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=18)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected"), ("CANCELLED", "Cancelled")], db_index=True, default="PENDING", max_length=16)),
                ("current_sequence", models.IntegerField(default=0)),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="approval_requests", to="tenancy.tenant")),
                ("workflow", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="requests", to="approvals.approvalworkflow")),
            ],
            options={
                "db_table": "approval_request",
                "indexes": [
                    models.Index(fields=["tenant", "status", "created_at"], name="appr_req_tenant_st_crt_idx"),
                    models.Index(fields=["tenant", "document_type", "document_id"], name="appr_req_tenant_doc_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="ApprovalAction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.BigIntegerField(default=1)),
                ("sequence", models.IntegerField(default=0)),
                ("actor_id", models.UUIDField(blank=True, null=True)),
                ("decision", models.CharField(choices=[("APPROVE", "Approve"), ("REJECT", "Reject")], max_length=16)),
                ("comment", models.TextField(blank=True, default="")),
                ("request", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="actions", to="approvals.approvalrequest")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="approval_actions", to="tenancy.tenant")),
            ],
            options={
                "db_table": "approval_action",
                "indexes": [models.Index(fields=["tenant", "request", "sequence"], name="appr_act_tenant_req_idx")],
            },
        ),
    ]
