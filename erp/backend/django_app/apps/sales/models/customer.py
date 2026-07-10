from django.db import models

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class Customer(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="customers")
    code = models.CharField(max_length=32, db_index=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "sales_customer"
        unique_together = [("tenant", "code")]
        indexes = [models.Index(fields=["tenant", "is_active"])]
