from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

HARDENING_PERMISSIONS = [
    ("hardening.read", "hardening", "hardening_status", "read", "View hardening status / run self-tests"),
]

HARDENING_ROLE_GRANTS = {
    "OWNER": ["hardening.read"],
    "ADMIN": ["hardening.read"],
    "AUDITOR_READ_ONLY": ["hardening.read"],
}


class Command(BaseCommand):
    help = "Seed hardening (STAGE 16) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in HARDENING_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Hardening permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in HARDENING_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Hardening role grants added: {granted}"))
