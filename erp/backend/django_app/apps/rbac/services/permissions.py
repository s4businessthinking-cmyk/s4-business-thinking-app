from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.rbac.models import Permission, Role, RolePermission, UserRole


def get_user_permissions(user) -> set[str]:
    if not user or not user.is_authenticated:
        return set()

    if user.is_superuser or user.platform_role == "SUPER_ADMIN":
        return {p.code for p in Permission.objects.all()}

    now = timezone.now()
    role_ids = (
        UserRole.objects.filter(user=user)
        .filter(Q(valid_to__isnull=True) | Q(valid_to__gt=now))
        .values_list("role_id", flat=True)
    )
    codes = RolePermission.objects.filter(role_id__in=role_ids).values_list("permission__code", flat=True)
    return set(codes)


def user_has_permission(user, code: str) -> bool:
    return code in get_user_permissions(user)
