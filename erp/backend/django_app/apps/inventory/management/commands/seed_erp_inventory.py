import uuid

from django.core.management.base import BaseCommand

from apps.inventory.models import Item, ItemCategory, StockLedgerEntry, UnitOfMeasure
from apps.inventory.services.posting import post_stock_movement, publish_item_to_sync
from apps.tenancy.models import Tenant


class Command(BaseCommand):
    help = "Seed inventory master data and opening stock for s4-demo tenant"

    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(slug="s4-demo").first()
        if not tenant:
            self.stdout.write(self.style.WARNING("s4-demo tenant not found"))
            return

        pcs, _ = UnitOfMeasure.objects.get_or_create(tenant=tenant, code="PCS", defaults={"name": "Pieces", "is_base": True})
        set_uom, _ = UnitOfMeasure.objects.get_or_create(tenant=tenant, code="SET", defaults={"name": "Set", "is_base": True})
        cat, _ = ItemCategory.objects.get_or_create(tenant=tenant, code="SPARES", defaults={"name": "Spare Parts"})

        demo_items = [
            ("BRK-001", "Brake Pad Set", "Bosch", set_uom, 45.0, 25),
            ("OIL-002", "Oil Filter", "Mann", pcs, 12.5, 100),
            ("SPK-003", "Spark Plug", "NGK", pcs, 8.0, 200),
        ]
        created_items = []
        for sku, name, brand, uom, rate, opening_qty in demo_items:
            item, created = Item.objects.update_or_create(
                tenant=tenant,
                sku=sku,
                defaults={
                    "name": name,
                    "brand": brand,
                    "uom": uom,
                    "category": cat,
                    "standard_rate": rate,
                    "is_active": True,
                },
            )
            publish_item_to_sync(item)
            created_items.append((item, opening_qty, created))

        for item, opening_qty, _ in created_items:
            key = f"seed-opening-{item.sku}"
            if StockLedgerEntry.objects.filter(tenant=tenant, idempotency_key=key).exists():
                continue
            post_stock_movement(
                tenant=tenant,
                item_id=item.id,
                qty=opening_qty,
                direction=StockLedgerEntry.Direction.IN,
                voucher_type=StockLedgerEntry.VoucherType.OPENING,
                idempotency_key=key,
                valuation_rate=item.standard_rate,
                remarks="Seed opening stock",
            )

        self.stdout.write(self.style.SUCCESS(f"Inventory seeded for {tenant.slug}: {len(demo_items)} items with opening stock"))
