from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

REALTIME_PERMISSIONS = [
    ("realtime.subscribe", "realtime", "channel", "subscribe", "Subscribe to realtime channels"),
    ("realtime.publish", "realtime", "channel", "publish", "Publish realtime events / relay outbox"),
]

# Roles that should receive realtime permissions by default.
REALTIME_ROLE_GRANTS = {
    "OWNER": ["realtime.subscribe", "realtime.publish"],
    "ADMIN": ["realtime.subscribe", "realtime.publish"],
    "SALESPERSON": ["realtime.subscribe"],
    "PURCHASER": ["realtime.subscribe"],
    "AUDITOR_READ_ONLY": ["realtime.subscribe"],
}


class Command(BaseCommand):
    help = "Seed realtime (STAGE 11) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in REALTIME_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Realtime permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in REALTIME_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Realtime role grants added: {granted}"))
