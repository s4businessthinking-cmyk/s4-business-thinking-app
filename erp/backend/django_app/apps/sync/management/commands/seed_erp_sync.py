from django.core.management.base import BaseCommand

from apps.sync.models import SyncEntityRegistry
from apps.tenancy.models import Tenant


class Command(BaseCommand):
    help = "Seed sync entity registry and demo reference data for s4-demo tenant"

    def handle(self, *args, **options):
        registry_rows = [
            ("item", "R", "server_wins", "server_to_client"),
            ("customer", "R", "server_wins", "server_to_client"),
            ("partner", "R", "server_wins", "server_to_client"),
            ("sales_order_draft", "D", "lww", "bidirectional"),
            ("user_settings", "S", "lww", "bidirectional"),
            ("activity_log", "A", "lww", "bidirectional"),
            ("pos_sale", "T", "manual", "client_to_server"),
        ]
        for entity_type, sync_class, merge_strategy, direction in registry_rows:
            SyncEntityRegistry.objects.update_or_create(
                entity_type=entity_type,
                defaults={
                    "sync_class": sync_class,
                    "merge_strategy": merge_strategy,
                    "direction": direction,
                    "enabled": True,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Sync registry: {len(registry_rows)} entity types"))

        tenant = Tenant.objects.filter(slug="s4-demo").first()
        if not tenant:
            self.stdout.write(self.style.WARNING("s4-demo tenant not found — skip replica seed"))
            return

        self.stdout.write(self.style.SUCCESS("Sync registry seeded. Item replicas published by seed_erp_inventory."))
