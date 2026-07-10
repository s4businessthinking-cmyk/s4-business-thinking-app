import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.inventory.models import StockLedgerEntry
from apps.inventory.services.posting import PostingError, post_stock_movement
from apps.inventory.services.resolver import get_default_branch, get_default_company, get_default_warehouse
from apps.accounting.services.auto_post import post_grn_journal
from apps.accounting.services.posting import AccountingError
from apps.purchase.models import GoodsReceiptLine, GoodsReceiptNote, PurchaseOrder, PurchaseOrderLine, Supplier
from apps.sync.models import server_hlc_now
from apps.sync.models.sync import SyncedRecord


class PurchaseError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _q(value) -> Decimal:
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.00000001"))


def _next_doc_number(tenant, prefix: str, model, field: str) -> str:
    last = (
        model.objects.filter(tenant=tenant, **{f"{field}__startswith": prefix})
        .aggregate(mx=Max(field))
        .get("mx")
    )
    if not last:
        return f"{prefix}000001"
    try:
        seq = int(str(last).replace(prefix, "")) + 1
    except ValueError:
        seq = 1
    return f"{prefix}{seq:06d}"


def publish_supplier_to_sync(supplier: Supplier) -> None:
    hlc = server_hlc_now()
    SyncedRecord.objects.update_or_create(
        tenant=supplier.tenant,
        entity_type="partner",
        entity_id=str(supplier.id),
        defaults={
            "payload": {
                "code": supplier.code,
                "name": supplier.name,
                "email": supplier.email,
                "phone": supplier.phone,
                "partner_type": "SUPPLIER",
                "is_active": supplier.is_active,
                "row_version": supplier.row_version,
            },
            "hlc_wall_ms": hlc.wall_ms,
            "hlc_logical": hlc.logical,
            "hlc_node_id": "server",
            "is_deleted": not supplier.is_active,
        },
    )


@transaction.atomic
def create_purchase_order(
    *,
    tenant,
    supplier_id,
    lines: list[dict],
    actor_id=None,
    remarks: str = "",
    warehouse_id: str | None = None,
) -> PurchaseOrder:
    supplier = Supplier.objects.filter(id=supplier_id, tenant=tenant, is_active=True).first()
    if not supplier:
        raise PurchaseError("SUPPLIER_NOT_FOUND", "Supplier not found or inactive.", 404)
    if not lines:
        raise PurchaseError("NO_LINES", "Purchase order requires at least one line.")

    company = get_default_company(tenant)
    branch = get_default_branch(company)
    if warehouse_id:
        from apps.tenancy.models import Warehouse

        warehouse = Warehouse.objects.filter(id=warehouse_id, branch__company__tenant=tenant).first()
        if not warehouse:
            raise PurchaseError("WAREHOUSE_NOT_FOUND", "Warehouse not found.", 404)
    else:
        warehouse = get_default_warehouse(branch)

    po_number = _next_doc_number(tenant, "PO-", PurchaseOrder, "po_number")
    po = PurchaseOrder.objects.create(
        tenant=tenant,
        po_number=po_number,
        supplier=supplier,
        branch=branch,
        warehouse=warehouse,
        status=PurchaseOrder.Status.DRAFT,
        remarks=remarks,
        created_by=actor_id,
    )

    total = Decimal("0")
    for idx, line in enumerate(lines, start=1):
        qty = _q(line["qty"])
        rate = _q(line["rate"])
        amount = _q(qty * rate)
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            line_no=idx,
            item_id=line["item_id"],
            qty_ordered=qty,
            rate=rate,
            amount=amount,
        )
        total += amount
    po.total_amount = _q(total)
    po.save(update_fields=["total_amount", "updated_at", "row_version"])
    return po


@transaction.atomic
def submit_purchase_order(*, tenant, po_id) -> PurchaseOrder:
    po = PurchaseOrder.objects.filter(id=po_id, tenant=tenant).select_for_update().first()
    if not po:
        raise PurchaseError("PO_NOT_FOUND", "Purchase order not found.", 404)
    if po.status != PurchaseOrder.Status.DRAFT:
        raise PurchaseError("INVALID_STATUS", f"Cannot submit PO in status {po.status}.", 409)
    if not po.lines.exists():
        raise PurchaseError("NO_LINES", "Purchase order has no lines.", 400)
    po.status = PurchaseOrder.Status.SUBMITTED
    po.save(update_fields=["status", "updated_at", "row_version"])
    return po


@transaction.atomic
def create_grn_from_po(
    *,
    tenant,
    po_id,
    lines: list[dict] | None = None,
    remarks: str = "",
) -> GoodsReceiptNote:
    po = (
        PurchaseOrder.objects.filter(id=po_id, tenant=tenant)
        .select_related("supplier", "warehouse")
        .prefetch_related("lines")
        .first()
    )
    if not po:
        raise PurchaseError("PO_NOT_FOUND", "Purchase order not found.", 404)
    if po.status not in {PurchaseOrder.Status.SUBMITTED, PurchaseOrder.Status.PARTIALLY_RECEIVED}:
        raise PurchaseError("INVALID_STATUS", f"Cannot receive against PO in status {po.status}.", 409)

    grn_number = _next_doc_number(tenant, "GRN-", GoodsReceiptNote, "grn_number")
    grn = GoodsReceiptNote.objects.create(
        tenant=tenant,
        grn_number=grn_number,
        purchase_order=po,
        supplier=po.supplier,
        warehouse=po.warehouse,
        status=GoodsReceiptNote.Status.DRAFT,
        correlation_id=uuid.uuid4(),
        remarks=remarks,
    )

    po_lines = {str(line.id): line for line in po.lines.all()}
    if lines:
        for idx, row in enumerate(lines, start=1):
            po_line = po_lines.get(str(row.get("po_line_id")))
            if not po_line:
                raise PurchaseError("PO_LINE_NOT_FOUND", "PO line not found.", 404)
            qty = _q(row.get("qty") or row.get("qty_received"))
            remaining = _q(po_line.qty_ordered - po_line.qty_received)
            if qty <= 0 or qty > remaining:
                raise PurchaseError("INVALID_QTY", f"Invalid receive qty for line {po_line.line_no}. Remaining: {remaining}", 400)
            GoodsReceiptLine.objects.create(
                grn=grn,
                line_no=idx,
                purchase_order_line=po_line,
                item=po_line.item,
                qty_received=qty,
                rate=po_line.rate,
                amount=_q(qty * po_line.rate),
            )
    else:
        for idx, po_line in enumerate(po.lines.all(), start=1):
            remaining = _q(po_line.qty_ordered - po_line.qty_received)
            if remaining <= 0:
                continue
            GoodsReceiptLine.objects.create(
                grn=grn,
                line_no=idx,
                purchase_order_line=po_line,
                item=po_line.item,
                qty_received=remaining,
                rate=po_line.rate,
                amount=_q(remaining * po_line.rate),
            )

    if not grn.lines.exists():
        raise PurchaseError("NO_LINES", "Nothing left to receive on this PO.", 400)
    return grn


@transaction.atomic
def post_grn(*, tenant, grn_id, idempotency_key: str, actor_id=None) -> dict:
    grn = (
        GoodsReceiptNote.objects.filter(id=grn_id, tenant=tenant)
        .select_for_update(of=("self",))
        .select_related("warehouse")
        .first()
    )
    if not grn:
        raise PurchaseError("GRN_NOT_FOUND", "GRN not found.", 404)

    if grn.status == GoodsReceiptNote.Status.POSTED and grn.post_idempotency_key == idempotency_key:
        return {"idempotent_replay": True, "grn_id": str(grn.id), "grn_number": grn.grn_number, "status": grn.status}

    if grn.status != GoodsReceiptNote.Status.DRAFT:
        raise PurchaseError("INVALID_STATUS", f"Cannot post GRN in status {grn.status}.", 409)

    lines = list(
        GoodsReceiptLine.objects.filter(grn=grn).select_related("purchase_order_line", "item")
    )
    postings = []
    for line in lines:
        po_line = line.purchase_order_line
        if po_line:
            remaining = _q(po_line.qty_ordered - po_line.qty_received)
            if line.qty_received > remaining:
                raise PurchaseError(
                    "OVER_RECEIVE",
                    f"GRN line {line.line_no} exceeds PO remaining qty ({remaining}).",
                    409,
                )

        result = post_stock_movement(
            tenant=tenant,
            item_id=line.item_id,
            qty=line.qty_received,
            direction=StockLedgerEntry.Direction.IN,
            voucher_type=StockLedgerEntry.VoucherType.GRN,
            idempotency_key=f"{idempotency_key}:{line.id}",
            actor_id=actor_id,
            warehouse_id=str(grn.warehouse_id),
            valuation_rate=line.rate,
            remarks=f"GRN {grn.grn_number}",
            correlation_id=grn.correlation_id,
            voucher_id=grn.id,
            voucher_line_id=line.id,
        )
        postings.append(result)

        if po_line:
            po_line.qty_received = _q(po_line.qty_received + line.qty_received)
            po_line.save(update_fields=["qty_received", "updated_at", "row_version"])

    if grn.purchase_order:
        po = PurchaseOrder.objects.select_for_update().get(id=grn.purchase_order_id)
        all_received = all(_q(l.qty_received) >= _q(l.qty_ordered) for l in po.lines.all())
        any_received = any(_q(l.qty_received) > 0 for l in po.lines.all())
        if all_received:
            po.status = PurchaseOrder.Status.RECEIVED
        elif any_received:
            po.status = PurchaseOrder.Status.PARTIALLY_RECEIVED
        po.save(update_fields=["status", "updated_at", "row_version"])

    grn.status = GoodsReceiptNote.Status.POSTED
    grn.posted_at = timezone.now()
    grn.posted_by = actor_id
    grn.post_idempotency_key = idempotency_key
    grn.save(update_fields=["status", "posted_at", "posted_by", "post_idempotency_key", "updated_at", "row_version"])

    journal_result = None
    try:
        journal_result = post_grn_journal(tenant=tenant, grn=grn, postings=postings, actor_id=actor_id)
    except AccountingError as exc:
        raise PurchaseError(exc.code, exc.message, exc.status) from exc

    return {
        "idempotent_replay": False,
        "grn_id": str(grn.id),
        "grn_number": grn.grn_number,
        "status": grn.status,
        "postings": postings,
        "po_status": grn.purchase_order.status if grn.purchase_order else None,
        "journal": journal_result,
    }
