from django.urls import path

from apps.hrm.views import (
    AttendanceListCreateView,
    DepartmentListCreateView,
    EmployeeListCreateView,
    LeaveApproveView,
    LeaveListCreateView,
    LeaveRejectView,
    LeaveSubmitView,
)

urlpatterns = [
    path("hrm/departments/", DepartmentListCreateView.as_view(), name="hrm-departments"),
    path("hrm/employees/", EmployeeListCreateView.as_view(), name="hrm-employees"),
    path("hrm/attendance/", AttendanceListCreateView.as_view(), name="hrm-attendance"),
    path("hrm/leaves/", LeaveListCreateView.as_view(), name="hrm-leaves"),
    path("hrm/leaves/<uuid:leave_id>/submit/", LeaveSubmitView.as_view(), name="hrm-leave-submit"),
    path("hrm/leaves/<uuid:leave_id>/approve/", LeaveApproveView.as_view(), name="hrm-leave-approve"),
    path("hrm/leaves/<uuid:leave_id>/reject/", LeaveRejectView.as_view(), name="hrm-leave-reject"),
]
