from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

CUSTOMIZATION_PERMISSIONS = [
    ("customization.read", "customization", "custom_field", "read", "View custom fields / sequences"),
    ("customization.manage", "customization", "custom_field", "manage", "Manage custom fields + generate numbers"),
]

CUSTOMIZATION_ROLE_GRANTS = {
    "OWNER": ["customization.read", "customization.manage"],
    "ADMIN": ["customization.read", "customization.manage"],
    "SALESPERSON": ["customization.read"],
    "PURCHASER": ["customization.read"],
    "AUDITOR_READ_ONLY": ["customization.read"],
}


class Command(BaseCommand):
    help = "Seed customization (STAGE 13.8) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in CUSTOMIZATION_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Customization permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in CUSTOMIZATION_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Customization role grants added: {granted}"))
