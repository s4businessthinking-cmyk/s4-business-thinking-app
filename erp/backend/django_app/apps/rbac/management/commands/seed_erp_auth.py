from django.core.management.base import BaseCommand

from apps.identity.models import User
from apps.rbac.models import Permission, Role, RolePermission, UserRole
from apps.rbac.services.seed import DEFAULT_PERMISSIONS, DEFAULT_ROLES, ensure_permissions, ensure_roles


class Command(BaseCommand):
    help = "Seed ERP auth: permissions, roles, and super admin user"

    def add_arguments(self, parser):
        parser.add_argument("--email", default="admin@s4.local")
        parser.add_argument("--password", default="Admin@12345")
        parser.add_argument("--force-password", action="store_true")

    def handle(self, *args, **options):
        perms = ensure_permissions()
        roles = ensure_roles(perms)
        owner = roles["OWNER"]

        email = options["email"].strip().lower()
        password = options["password"]
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": "S4 Super Admin",
                "status": User.Status.ACTIVE,
                "platform_role": User.PlatformRole.SUPER_ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "email_verified": True,
            },
        )
        if created or options["force_password"]:
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.WARNING(f"Super admin password set for {email}"))

        UserRole.objects.get_or_create(user=user, role=owner)
        self.stdout.write(self.style.SUCCESS(f"Seeded auth data. Super admin: {email}"))
        self.stdout.write(self.style.SUCCESS(f"Permissions: {Permission.objects.count()}, Roles: {Role.objects.count()}"))
