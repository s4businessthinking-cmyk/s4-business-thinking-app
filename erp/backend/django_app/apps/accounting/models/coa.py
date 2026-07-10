from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Company, Tenant


class Account(BaseModel):
    class AccountType(models.TextChoices):
        ASSET = "ASSET", "Asset"
        LIABILITY = "LIABILITY", "Liability"
        EQUITY = "EQUITY", "Equity"
        INCOME = "INCOME", "Income"
        EXPENSE = "EXPENSE", "Expense"

    class Subtype(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK = "BANK", "Bank"
        AR = "AR", "Accounts Receivable"
        AP = "AP", "Accounts Payable"
        INVENTORY = "INVENTORY", "Inventory"
        COGS = "COGS", "Cost of Goods Sold"
        REVENUE = "REVENUE", "Revenue"
        TAX_PAYABLE = "TAX_PAYABLE", "Tax Payable"
        GRIR = "GRIR", "GR/IR Clearing"
        OTHER = "OTHER", "Other"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="accounts")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="accounts")
    code = models.CharField(max_length=32, db_index=True)
    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=16, choices=AccountType.choices)
    subtype = models.CharField(max_length=16, choices=Subtype.choices, default=Subtype.OTHER)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    is_group = models.BooleanField(default=False)
    is_reconcilable = models.BooleanField(default=False)
    currency = models.CharField(max_length=8, default="AED")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "accounting_account"
        unique_together = [("tenant", "company", "code")]
        indexes = [models.Index(fields=["tenant", "company", "account_type"])]


class FiscalYear(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="fiscal_years")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="fiscal_years")
    name = models.CharField(max_length=32)
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "accounting_fiscal_year"
        unique_together = [("tenant", "company", "name")]


class FiscalPeriod(BaseModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        SOFT_CLOSE = "SOFT_CLOSE", "Soft Close"
        CLOSED = "CLOSED", "Closed"
        LOCKED = "LOCKED", "Locked"

    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.CASCADE, related_name="periods")
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="fiscal_periods")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="fiscal_periods")
    name = models.CharField(max_length=32)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True)

    class Meta:
        db_table = "accounting_fiscal_period"
        unique_together = [("tenant", "company", "name")]
        indexes = [models.Index(fields=["tenant", "company", "status"])]
