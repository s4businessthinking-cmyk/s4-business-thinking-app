from django.core.management.base import BaseCommand

from apps.rbac.models import Permission, Role, RolePermission

APPROVAL_PERMISSIONS = [
    ("approvals.read", "approvals", "approval_request", "read", "View approvals / submit documents"),
    ("approvals.act", "approvals", "approval_request", "act", "Approve or reject requests"),
    ("approvals.manage", "approvals", "approval_workflow", "manage", "Configure approval workflows"),
]

APPROVAL_ROLE_GRANTS = {
    "OWNER": ["approvals.read", "approvals.act", "approvals.manage"],
    "ADMIN": ["approvals.read", "approvals.act", "approvals.manage"],
    "SALESPERSON": ["approvals.read"],
    "PURCHASER": ["approvals.read"],
    "AUDITOR_READ_ONLY": ["approvals.read"],
}


class Command(BaseCommand):
    help = "Seed approvals (STAGE 13.6) RBAC permissions and role grants"

    def handle(self, *args, **options):
        perms = {}
        for code, module, obj, action, description in APPROVAL_PERMISSIONS:
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"module": module, "object": obj, "action": action, "description": description},
            )
            perms[code] = perm
        self.stdout.write(self.style.SUCCESS(f"Approval permissions: {len(perms)}"))

        granted = 0
        for role_code, perm_codes in APPROVAL_ROLE_GRANTS.items():
            role = Role.objects.filter(code=role_code).first()
            if not role:
                continue
            for perm_code in perm_codes:
                perm = perms.get(perm_code)
                if perm:
                    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    granted += int(created)
        self.stdout.write(self.style.SUCCESS(f"Approval role grants added: {granted}"))
