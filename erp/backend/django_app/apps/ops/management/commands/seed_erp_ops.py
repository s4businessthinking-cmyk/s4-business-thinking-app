from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

OPS_PERMISSIONS = [
    ("ops.read", "ops", "ops_status", "read", "View ops status / metrics summary"),
]

OPS_ROLE_GRANTS = {
    "OWNER": ["ops.read"],
    "ADMIN": ["ops.read"],
    "AUDITOR_READ_ONLY": ["ops.read"],
}


class Command(BaseCommand):
    help = "Seed ops (STAGE 15) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in OPS_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Ops permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in OPS_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Ops role grants added: {granted}"))
