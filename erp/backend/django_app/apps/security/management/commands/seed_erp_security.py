from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

SECURITY_PERMISSIONS = [
    ("security.read", "security", "security_policy", "read", "View security policy and API keys"),
    ("security.manage", "security", "security_policy", "manage", "Edit policy / manage API keys"),
    ("audit.verify", "security", "audit_log", "verify", "Verify audit log hash-chain integrity"),
]

SECURITY_ROLE_GRANTS = {
    "OWNER": ["security.read", "security.manage", "audit.verify"],
    "ADMIN": ["security.read", "security.manage", "audit.verify"],
    "AUDITOR_READ_ONLY": ["security.read", "audit.verify"],
}


class Command(BaseCommand):
    help = "Seed security (STAGE 14) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in SECURITY_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Security permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in SECURITY_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Security role grants added: {granted}"))
