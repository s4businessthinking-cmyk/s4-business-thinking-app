from django.core.management.base import BaseCommand

from apps.inventory.models import Item
from apps.purchase.models import GoodsReceiptNote, PurchaseOrder, Supplier
from apps.purchase.services.purchase import create_grn_from_po, create_purchase_order, post_grn, publish_supplier_to_sync, submit_purchase_order
from apps.tenancy.models import Tenant


class Command(BaseCommand):
    help = "Seed purchase suppliers, PO, and optional GRN for s4-demo tenant"

    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(slug="s4-demo").first()
        if not tenant:
            self.stdout.write(self.style.WARNING("s4-demo tenant not found"))
            return

        supplier, _ = Supplier.objects.update_or_create(
            tenant=tenant,
            code="SUP-001",
            defaults={
                "name": "Gulf Auto Parts Trading",
                "email": "orders@gulfautoparts.ae",
                "phone": "+971500000001",
                "is_active": True,
            },
        )
        publish_supplier_to_sync(supplier)

        items = list(Item.objects.filter(tenant=tenant, is_active=True).order_by("sku")[:2])
        if len(items) < 2:
            self.stdout.write(self.style.WARNING("Need at least 2 inventory items; run seed_erp_inventory first"))
            return

        if not PurchaseOrder.objects.filter(tenant=tenant, po_number="PO-000001").exists():
            po = create_purchase_order(
                tenant=tenant,
                supplier_id=supplier.id,
                lines=[
                    {"item_id": items[0].id, "qty": 10, "rate": items[0].standard_rate},
                    {"item_id": items[1].id, "qty": 20, "rate": items[1].standard_rate},
                ],
                remarks="Demo purchase order",
            )
            po = submit_purchase_order(tenant=tenant, po_id=po.id)
            self.stdout.write(self.style.SUCCESS(f"Created demo PO {po.po_number}"))
        else:
            po = PurchaseOrder.objects.filter(tenant=tenant, po_number="PO-000001").first()

        if po and po.status in {PurchaseOrder.Status.SUBMITTED, PurchaseOrder.Status.PARTIALLY_RECEIVED}:
            draft_grn = GoodsReceiptNote.objects.filter(
                tenant=tenant,
                purchase_order=po,
                status=GoodsReceiptNote.Status.DRAFT,
            ).order_by("-created_at").first()
            if draft_grn:
                post_grn(tenant=tenant, grn_id=draft_grn.id, idempotency_key=f"seed-grn-{draft_grn.grn_number}")
                self.stdout.write(self.style.SUCCESS(f"Posted existing draft GRN {draft_grn.grn_number}"))
            elif not GoodsReceiptNote.objects.filter(
                tenant=tenant, purchase_order=po, status=GoodsReceiptNote.Status.POSTED
            ).exists():
                grn = create_grn_from_po(tenant=tenant, po_id=po.id, remarks="Demo GRN receipt")
                post_grn(tenant=tenant, grn_id=grn.id, idempotency_key=f"seed-grn-{grn.grn_number}")
                self.stdout.write(self.style.SUCCESS(f"Posted demo GRN {grn.grn_number}"))
            else:
                self.stdout.write(self.style.SUCCESS("Demo GRN already posted"))

        self.stdout.write(self.style.SUCCESS(f"Purchase seed complete for {tenant.slug}"))
