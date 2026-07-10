from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.hrm.models import AttendanceRecord, Department, Employee, LeaveRequest
from apps.inventory.services.resolver import get_default_branch, get_default_company
from apps.sync.models import server_hlc_now
from apps.sync.models.sync import SyncedRecord


class HrmError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _next_code(tenant, prefix: str, model, field: str) -> str:
    last = model.objects.filter(tenant=tenant, **{f"{field}__startswith": prefix}).aggregate(mx=Max(field)).get("mx")
    if not last:
        return f"{prefix}000001"
    try:
        seq = int(str(last).replace(prefix, "")) + 1
    except ValueError:
        seq = 1
    return f"{prefix}{seq:06d}"


def publish_employee_to_sync(employee: Employee) -> None:
    hlc = server_hlc_now()
    SyncedRecord.objects.update_or_create(
        tenant=employee.tenant,
        entity_type="employee",
        entity_id=str(employee.id),
        defaults={
            "payload": {
                "employee_code": employee.employee_code,
                "first_name": employee.first_name,
                "last_name": employee.last_name,
                "full_name": employee.full_name,
                "email": employee.email,
                "phone": employee.phone,
                "designation": employee.designation,
                "department_id": str(employee.department_id) if employee.department_id else None,
                "branch_id": str(employee.branch_id),
                "status": employee.status,
                "row_version": employee.row_version,
            },
            "hlc_wall_ms": hlc.wall_ms,
            "hlc_logical": hlc.logical,
            "hlc_node_id": "server",
            "is_deleted": employee.status == Employee.Status.TERMINATED,
        },
    )


@transaction.atomic
def create_department(*, tenant, code: str, name: str, parent_id=None) -> Department:
    company = get_default_company(tenant)
    parent = None
    if parent_id:
        parent = Department.objects.filter(id=parent_id, tenant=tenant).first()
        if not parent:
            raise HrmError("DEPARTMENT_NOT_FOUND", "Parent department not found.", 404)
    dept, _ = Department.objects.update_or_create(
        tenant=tenant,
        company=company,
        code=code.upper(),
        defaults={"name": name, "parent": parent, "is_active": True},
    )
    return dept


@transaction.atomic
def create_employee(
    *,
    tenant,
    employee_code: str,
    first_name: str,
    last_name: str = "",
    email: str = "",
    phone: str = "",
    designation: str = "",
    department_id=None,
    branch_id=None,
    join_date=None,
) -> Employee:
    company = get_default_company(tenant)
    branch = get_default_branch(company)
    if branch_id:
        from apps.tenancy.models import Branch

        branch = Branch.objects.filter(id=branch_id, company__tenant=tenant).first() or branch
    department = None
    if department_id:
        department = Department.objects.filter(id=department_id, tenant=tenant).first()
        if not department:
            raise HrmError("DEPARTMENT_NOT_FOUND", "Department not found.", 404)
    if Employee.objects.filter(tenant=tenant, employee_code=employee_code.upper()).exists():
        raise HrmError("EMPLOYEE_CODE_EXISTS", "Employee code already exists.", 409)
    employee = Employee.objects.create(
        tenant=tenant,
        company=company,
        branch=branch,
        department=department,
        employee_code=employee_code.upper(),
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        designation=designation,
        join_date=join_date or timezone.now().date(),
        status=Employee.Status.ACTIVE,
    )
    publish_employee_to_sync(employee)
    return employee


@transaction.atomic
def record_attendance(
    *,
    tenant,
    employee_id,
    attendance_date: date | None = None,
    check_in: bool = True,
    check_out: bool = False,
    remarks: str = "",
) -> AttendanceRecord:
    employee = Employee.objects.filter(id=employee_id, tenant=tenant, status=Employee.Status.ACTIVE).first()
    if not employee:
        raise HrmError("EMPLOYEE_NOT_FOUND", "Active employee not found.", 404)
    attendance_date = attendance_date or timezone.now().date()
    record, created = AttendanceRecord.objects.get_or_create(
        tenant=tenant,
        employee=employee,
        attendance_date=attendance_date,
        defaults={"status": AttendanceRecord.Status.PRESENT},
    )
    now = timezone.now()
    if check_in and not record.check_in_time:
        record.check_in_time = now
        record.status = AttendanceRecord.Status.PRESENT
    if check_out:
        if not record.check_in_time:
            raise HrmError("CHECK_IN_REQUIRED", "Check-in required before check-out.", 409)
        record.check_out_time = now
    if remarks:
        record.remarks = remarks
    record.save()
    if not created and not check_in and not check_out:
        raise HrmError("NO_ACTION", "Specify check_in or check_out.", 400)
    return record


def _leave_days(from_date: date, to_date: date) -> Decimal:
    if to_date < from_date:
        raise HrmError("INVALID_DATE_RANGE", "to_date must be on or after from_date.", 400)
    return Decimal(str((to_date - from_date).days + 1))


@transaction.atomic
def create_leave_request(
    *,
    tenant,
    employee_id,
    leave_type: str,
    from_date: date,
    to_date: date,
    reason: str = "",
) -> LeaveRequest:
    employee = Employee.objects.filter(id=employee_id, tenant=tenant, status=Employee.Status.ACTIVE).first()
    if not employee:
        raise HrmError("EMPLOYEE_NOT_FOUND", "Active employee not found.", 404)
    return LeaveRequest.objects.create(
        tenant=tenant,
        employee=employee,
        leave_type=leave_type,
        from_date=from_date,
        to_date=to_date,
        days=_leave_days(from_date, to_date),
        reason=reason,
        status=LeaveRequest.Status.DRAFT,
    )


@transaction.atomic
def submit_leave_request(*, tenant, leave_id) -> LeaveRequest:
    leave = LeaveRequest.objects.filter(id=leave_id, tenant=tenant).select_for_update(of=("self",)).first()
    if not leave:
        raise HrmError("LEAVE_NOT_FOUND", "Leave request not found.", 404)
    if leave.status != LeaveRequest.Status.DRAFT:
        raise HrmError("INVALID_STATUS", f"Cannot submit leave in status {leave.status}.", 409)
    leave.status = LeaveRequest.Status.SUBMITTED
    leave.save(update_fields=["status", "updated_at", "row_version"])
    return leave


@transaction.atomic
def approve_leave_request(*, tenant, leave_id, actor_id=None) -> LeaveRequest:
    leave = LeaveRequest.objects.filter(id=leave_id, tenant=tenant).select_for_update(of=("self",)).first()
    if not leave:
        raise HrmError("LEAVE_NOT_FOUND", "Leave request not found.", 404)
    if leave.status != LeaveRequest.Status.SUBMITTED:
        raise HrmError("INVALID_STATUS", f"Cannot approve leave in status {leave.status}.", 409)
    leave.status = LeaveRequest.Status.APPROVED
    leave.approved_by = actor_id
    leave.approved_at = timezone.now()
    leave.save(update_fields=["status", "approved_by", "approved_at", "updated_at", "row_version"])
    return leave


@transaction.atomic
def reject_leave_request(*, tenant, leave_id, actor_id=None, rejection_reason: str = "") -> LeaveRequest:
    leave = LeaveRequest.objects.filter(id=leave_id, tenant=tenant).select_for_update(of=("self",)).first()
    if not leave:
        raise HrmError("LEAVE_NOT_FOUND", "Leave request not found.", 404)
    if leave.status != LeaveRequest.Status.SUBMITTED:
        raise HrmError("INVALID_STATUS", f"Cannot reject leave in status {leave.status}.", 409)
    leave.status = LeaveRequest.Status.REJECTED
    leave.approved_by = actor_id
    leave.approved_at = timezone.now()
    leave.rejection_reason = rejection_reason
    leave.save(update_fields=["status", "approved_by", "approved_at", "rejection_reason", "updated_at", "row_version"])
    return leave
