from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

DEVICE_PERMISSIONS = [
    ("devices.read", "devices", "desktop_device", "read", "View desktop devices"),
    ("devices.provision", "devices", "desktop_device", "provision", "Issue device activation codes"),
    ("devices.manage", "devices", "desktop_device", "manage", "Pin version / channel / disable devices"),
]

# Roles that should receive device permissions by default.
DEVICE_ROLE_GRANTS = {
    "OWNER": ["devices.read", "devices.provision", "devices.manage"],
    "ADMIN": ["devices.read", "devices.provision", "devices.manage"],
    "AUDITOR_READ_ONLY": ["devices.read"],
}


class Command(BaseCommand):
    help = "Seed desktop-device (STAGE 12) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in DEVICE_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Device permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in DEVICE_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Device role grants added: {granted}"))
