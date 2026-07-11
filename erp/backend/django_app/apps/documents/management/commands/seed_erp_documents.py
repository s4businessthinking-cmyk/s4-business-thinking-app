from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

DOCUMENT_PERMISSIONS = [
    ("documents.read", "documents", "attachment", "read", "View / download attachments"),
    ("documents.manage", "documents", "attachment", "manage", "Upload / delete attachments"),
]

DOCUMENT_ROLE_GRANTS = {
    "OWNER": ["documents.read", "documents.manage"],
    "ADMIN": ["documents.read", "documents.manage"],
    "SALESPERSON": ["documents.read", "documents.manage"],
    "PURCHASER": ["documents.read", "documents.manage"],
    "AUDITOR_READ_ONLY": ["documents.read"],
}


class Command(BaseCommand):
    help = "Seed documents (STAGE 13.7) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in DOCUMENT_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Document permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in DOCUMENT_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Document role grants added: {granted}"))
