from rest_framework import serializers

from apps.accounting.models import Account, FiscalPeriod, GeneralLedgerEntry, JournalEntry, JournalLine


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = [
            "id",
            "code",
            "name",
            "account_type",
            "subtype",
            "parent_id",
            "is_group",
            "is_reconcilable",
            "currency",
            "is_active",
            "row_version",
            "created_at",
        ]


class FiscalPeriodSerializer(serializers.ModelSerializer):
    fiscal_year_name = serializers.CharField(source="fiscal_year.name", read_only=True)

    class Meta:
        model = FiscalPeriod
        fields = [
            "id",
            "name",
            "fiscal_year_id",
            "fiscal_year_name",
            "start_date",
            "end_date",
            "status",
            "row_version",
            "created_at",
        ]


class JournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source="account.code", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = JournalLine
        fields = [
            "id",
            "line_no",
            "account_id",
            "account_code",
            "account_name",
            "debit",
            "credit",
            "description",
            "party_type",
            "party_id",
        ]


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True, read_only=True)
    fiscal_period_name = serializers.CharField(source="fiscal_period.name", read_only=True)

    class Meta:
        model = JournalEntry
        fields = [
            "id",
            "voucher_no",
            "posting_date",
            "fiscal_period_id",
            "fiscal_period_name",
            "source_doc_type",
            "source_doc_id",
            "currency",
            "status",
            "correlation_id",
            "idempotency_key",
            "posted_at",
            "remarks",
            "lines",
            "row_version",
            "created_at",
        ]


class JournalLineInputSerializer(serializers.Serializer):
    account_id = serializers.UUIDField()
    debit = serializers.DecimalField(max_digits=28, decimal_places=8, required=False, default=0)
    credit = serializers.DecimalField(max_digits=28, decimal_places=8, required=False, default=0)
    description = serializers.CharField(required=False, allow_blank=True, default="")


class JournalCreateSerializer(serializers.Serializer):
    posting_date = serializers.DateField(required=False)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")
    lines = JournalLineInputSerializer(many=True, min_length=2)


class GeneralLedgerSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source="account.code", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    voucher_no = serializers.CharField(source="journal_entry.voucher_no", read_only=True)

    class Meta:
        model = GeneralLedgerEntry
        fields = [
            "id",
            "journal_entry_id",
            "voucher_no",
            "account_id",
            "account_code",
            "account_name",
            "posting_date",
            "debit",
            "credit",
            "currency",
            "source_doc_type",
            "source_doc_id",
            "correlation_id",
            "created_at",
        ]
