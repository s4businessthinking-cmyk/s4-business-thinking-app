from rest_framework import serializers

from apps.hrm.models import AttendanceRecord, Department, Employee, LeaveRequest


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "code", "name", "parent_id", "is_active", "row_version", "created_at"]


class DepartmentCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=255)
    parent_id = serializers.UUIDField(required=False, allow_null=True)


class EmployeeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default="")
    branch_code = serializers.CharField(source="branch.code", read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_code",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "designation",
            "department_id",
            "department_name",
            "branch_id",
            "branch_code",
            "join_date",
            "status",
            "row_version",
            "created_at",
        ]


class EmployeeCreateSerializer(serializers.Serializer):
    employee_code = serializers.CharField(max_length=32)
    first_name = serializers.CharField(max_length=128)
    last_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    designation = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    department_id = serializers.UUIDField(required=False, allow_null=True)
    branch_id = serializers.UUIDField(required=False, allow_null=True)
    join_date = serializers.DateField(required=False)


class AttendanceSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "employee_id",
            "employee_code",
            "employee_name",
            "attendance_date",
            "check_in_time",
            "check_out_time",
            "status",
            "remarks",
            "row_version",
            "created_at",
        ]


class AttendanceCreateSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField()
    attendance_date = serializers.DateField(required=False)
    check_in = serializers.BooleanField(required=False, default=True)
    check_out = serializers.BooleanField(required=False, default=False)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "employee_id",
            "employee_code",
            "employee_name",
            "leave_type",
            "from_date",
            "to_date",
            "days",
            "reason",
            "status",
            "approved_at",
            "rejection_reason",
            "row_version",
            "created_at",
        ]


class LeaveCreateSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField()
    leave_type = serializers.ChoiceField(choices=LeaveRequest.LeaveType.choices)
    from_date = serializers.DateField()
    to_date = serializers.DateField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class LeaveRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default="")
