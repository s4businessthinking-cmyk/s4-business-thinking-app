from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

BACKUP_PERMISSIONS = [
    ("backup.read", "backup", "backup_job", "read", "View backup jobs and status"),
    ("backup.manage", "backup", "backup_job", "manage", "Run / verify / purge backups"),
]

BACKUP_ROLE_GRANTS = {
    "OWNER": ["backup.read", "backup.manage"],
    "ADMIN": ["backup.read", "backup.manage"],
    "AUDITOR_READ_ONLY": ["backup.read"],
}


class Command(BaseCommand):
    help = "Seed backup (STAGE 14) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in BACKUP_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Backup permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in BACKUP_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Backup role grants added: {granted}"))
