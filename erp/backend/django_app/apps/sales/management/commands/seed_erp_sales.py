from django.core.management.base import BaseCommand

from apps.inventory.models import Item
from apps.sales.models import Customer, DeliveryNote, PosSale, PosTerminal, SalesOrder
from apps.sales.services.sales import (
    confirm_sales_order,
    create_delivery_from_so,
    create_pos_sale,
    create_sales_order,
    post_delivery,
    post_pos_sale,
    publish_customer_to_sync,
)
from apps.tenancy.models import Tenant
from apps.inventory.services.resolver import get_default_branch, get_default_company, get_default_warehouse


class Command(BaseCommand):
    help = "Seed sales customers, SO, delivery, and POS terminal for s4-demo tenant"

    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(slug="s4-demo").first()
        if not tenant:
            self.stdout.write(self.style.WARNING("s4-demo tenant not found"))
            return

        customer, _ = Customer.objects.update_or_create(
            tenant=tenant,
            code="CUS-001",
            defaults={
                "name": "Walk-in Customer",
                "email": "walkin@example.com",
                "phone": "+971500000100",
                "is_active": True,
            },
        )
        publish_customer_to_sync(customer)

        company = get_default_company(tenant)
        branch = get_default_branch(company)
        warehouse = get_default_warehouse(branch)
        terminal, _ = PosTerminal.objects.update_or_create(
            tenant=tenant,
            code="POS01",
            defaults={"name": "Main Counter", "branch": branch, "warehouse": warehouse, "is_active": True},
        )

        items = list(Item.objects.filter(tenant=tenant, is_active=True).order_by("sku")[:2])
        if len(items) < 1:
            self.stdout.write(self.style.WARNING("Need inventory items; run seed_erp_inventory first"))
            return

        if not SalesOrder.objects.filter(tenant=tenant, so_number="SO-000001").exists():
            so = create_sales_order(
                tenant=tenant,
                customer_id=customer.id,
                lines=[{"item_id": items[0].id, "qty": 2, "rate": items[0].standard_rate}],
                remarks="Demo sales order",
            )
            so = confirm_sales_order(tenant=tenant, so_id=so.id)
            delivery = create_delivery_from_so(tenant=tenant, so_id=so.id, remarks="Demo delivery")
            post_delivery(tenant=tenant, delivery_id=delivery.id, idempotency_key=f"seed-do-{delivery.delivery_number}")
            self.stdout.write(self.style.SUCCESS(f"Posted demo delivery {delivery.delivery_number} for {so.so_number}"))
        else:
            self.stdout.write(self.style.SUCCESS("Demo sales order already exists"))

        if not PosSale.objects.filter(tenant=tenant, status=PosSale.Status.POSTED).exists():
            sale = create_pos_sale(
                tenant=tenant,
                terminal_id=terminal.id,
                customer_id=customer.id,
                lines=[{"item_id": items[0].id, "qty": 1, "rate": items[0].standard_rate}],
                device_fingerprint="seed-pos-device",
            )
            result = post_pos_sale(tenant=tenant, sale_id=sale.id, idempotency_key=f"seed-pos-{sale.draft_number}")
            self.stdout.write(self.style.SUCCESS(f"Posted demo POS sale {result['invoice_number']}"))
        else:
            self.stdout.write(self.style.SUCCESS("Demo POS sale already posted"))

        self.stdout.write(self.style.SUCCESS(f"Sales seed complete for {tenant.slug}"))
