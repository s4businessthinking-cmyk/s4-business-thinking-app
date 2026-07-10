from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.hrm.models import AttendanceRecord, Department, Employee, LeaveRequest
from apps.hrm.serializers import (
    AttendanceCreateSerializer,
    AttendanceSerializer,
    DepartmentCreateSerializer,
    DepartmentSerializer,
    EmployeeCreateSerializer,
    EmployeeSerializer,
    LeaveCreateSerializer,
    LeaveRejectSerializer,
    LeaveRequestSerializer,
)
from apps.hrm.services import (
    HrmError,
    approve_leave_request,
    create_department,
    create_employee,
    create_leave_request,
    record_attendance,
    reject_leave_request,
    submit_leave_request,
)
from apps.rbac.services.permissions import user_has_permission
from apps.tenancy.services.resolver import TenancyError, resolve_tenant_for_user, set_request_tenant


def _resolve_tenant(request):
    tenant_id = request.META.get("HTTP_X_TENANT_ID")
    tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
    tenant = resolve_tenant_for_user(user=request.user, tenant_id=tenant_id, tenant_slug=tenant_slug)
    set_request_tenant(request, tenant)
    return tenant


def _require_perm(request, code: str):
    if not user_has_permission(request.user, code):
        return Response(
            {"success": False, "error": {"code": "PERMISSION_DENIED", "message": f"Missing permission: {code}"}},
            status=403,
        )
    return None


class DepartmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.department.read")
        if denied:
            return denied
        qs = Department.objects.filter(tenant=tenant, is_active=True).order_by("code")
        return Response({"success": True, "departments": DepartmentSerializer(qs[:200], many=True).data})

    def post(self, request):
        serializer = DepartmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.department.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            dept = create_department(
                tenant=tenant,
                code=data["code"],
                name=data["name"],
                parent_id=data.get("parent_id"),
            )
        except HrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "department": DepartmentSerializer(dept).data}, status=201)


class EmployeeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.employee.read")
        if denied:
            return denied
        qs = Employee.objects.filter(tenant=tenant).select_related("department", "branch").order_by("employee_code")
        if request.query_params.get("active_only", "1") == "1":
            qs = qs.filter(status=Employee.Status.ACTIVE)
        return Response({"success": True, "employees": EmployeeSerializer(qs[:500], many=True).data})

    def post(self, request):
        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.employee.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            employee = create_employee(tenant=tenant, **data)
        except HrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "employee": EmployeeSerializer(employee).data}, status=201)


class AttendanceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.attendance.read")
        if denied:
            return denied
        qs = AttendanceRecord.objects.filter(tenant=tenant).select_related("employee").order_by("-attendance_date")[:200]
        return Response({"success": True, "attendance": AttendanceSerializer(qs, many=True).data})

    def post(self, request):
        serializer = AttendanceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.attendance.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            record = record_attendance(tenant=tenant, **data)
        except HrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "attendance": AttendanceSerializer(record).data}, status=201)


class LeaveListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.leave.read")
        if denied:
            return denied
        qs = LeaveRequest.objects.filter(tenant=tenant).select_related("employee").order_by("-created_at")[:200]
        return Response({"success": True, "leaves": LeaveRequestSerializer(qs, many=True).data})

    def post(self, request):
        serializer = LeaveCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.leave.create")
        if denied:
            return denied
        data = serializer.validated_data
        try:
            leave = create_leave_request(tenant=tenant, **data)
        except HrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "leave": LeaveRequestSerializer(leave).data}, status=201)


class LeaveSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, leave_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.leave.create")
        if denied:
            return denied
        try:
            leave = submit_leave_request(tenant=tenant, leave_id=leave_id)
        except HrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "leave": LeaveRequestSerializer(leave).data})


class LeaveApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, leave_id):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.leave.approve")
        if denied:
            return denied
        try:
            leave = approve_leave_request(tenant=tenant, leave_id=leave_id, actor_id=getattr(request.user, "id", None))
        except HrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "leave": LeaveRequestSerializer(leave).data})


class LeaveRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, leave_id):
        serializer = LeaveRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        denied = _require_perm(request, "hrm.leave.approve")
        if denied:
            return denied
        try:
            leave = reject_leave_request(
                tenant=tenant,
                leave_id=leave_id,
                actor_id=getattr(request.user, "id", None),
                rejection_reason=serializer.validated_data.get("rejection_reason", ""),
            )
        except HrmError as exc:
            return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)
        return Response({"success": True, "leave": LeaveRequestSerializer(leave).data})
