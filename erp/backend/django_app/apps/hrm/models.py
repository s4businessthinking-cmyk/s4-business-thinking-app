from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Branch, Company, Tenant


class Department(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="departments")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="departments")
    code = models.CharField(max_length=32, db_index=True)
    name = models.CharField(max_length=255)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "hrm_department"
        unique_together = [("tenant", "company", "code")]
        indexes = [models.Index(fields=["tenant", "company", "is_active"])]


class Employee(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        INACTIVE = "INACTIVE", "Inactive"
        TERMINATED = "TERMINATED", "Terminated"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="employees")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="employees")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="employees")
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.SET_NULL, related_name="employees")
    employee_code = models.CharField(max_length=32, db_index=True)
    first_name = models.CharField(max_length=128)
    last_name = models.CharField(max_length=128, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    designation = models.CharField(max_length=128, blank=True, default="")
    join_date = models.DateField(default=timezone.now)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE, db_index=True)

    class Meta:
        db_table = "hrm_employee"
        unique_together = [("tenant", "employee_code")]
        indexes = [models.Index(fields=["tenant", "status", "join_date"])]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class AttendanceRecord(BaseModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        LEAVE = "LEAVE", "On Leave"
        HALF_DAY = "HALF_DAY", "Half Day"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="attendance_records")
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="attendance_records")
    attendance_date = models.DateField(db_index=True)
    check_in_time = models.DateTimeField(null=True, blank=True)
    check_out_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PRESENT, db_index=True)
    remarks = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "hrm_attendance_record"
        unique_together = [("tenant", "employee", "attendance_date")]
        indexes = [models.Index(fields=["tenant", "attendance_date", "status"])]


class LeaveRequest(BaseModel):
    class LeaveType(models.TextChoices):
        ANNUAL = "ANNUAL", "Annual"
        SICK = "SICK", "Sick"
        UNPAID = "UNPAID", "Unpaid"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="leave_requests")
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="leave_requests")
    leave_type = models.CharField(max_length=16, choices=LeaveType.choices, default=LeaveType.ANNUAL)
    from_date = models.DateField()
    to_date = models.DateField()
    days = models.DecimalField(max_digits=6, decimal_places=2, default=1)
    reason = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True)
    approved_by = models.UUIDField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "hrm_leave_request"
        indexes = [models.Index(fields=["tenant", "status", "from_date"])]
