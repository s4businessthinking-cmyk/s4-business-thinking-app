import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.inventory.models import StockLedgerEntry
from apps.inventory.services.posting import PostingError, post_stock_movement
from apps.inventory.services.resolver import get_default_branch, get_default_company, get_default_warehouse
from apps.accounting.services.auto_post import post_pos_sale_journal
from apps.accounting.services.posting import AccountingError
from apps.sales.models import (
    Customer,
    DeliveryLine,
    DeliveryNote,
    PosSale,
    PosSaleLine,
    PosTerminal,
    SalesOrder,
    SalesOrderLine,
)
from apps.sync.models import server_hlc_now
from apps.sync.models.sync import SyncedRecord


class SalesError(Exception):
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
    last = model.objects.filter(tenant=tenant, **{f"{field}__startswith": prefix}).aggregate(mx=Max(field)).get("mx")
    if not last:
        return f"{prefix}000001"
    try:
        seq = int(str(last).replace(prefix, "")) + 1
    except ValueError:
        seq = 1
    return f"{prefix}{seq:06d}"


def publish_customer_to_sync(customer: Customer) -> None:
    hlc = server_hlc_now()
    SyncedRecord.objects.update_or_create(
        tenant=customer.tenant,
        entity_type="customer",
        entity_id=str(customer.id),
        defaults={
            "payload": {
                "code": customer.code,
                "name": customer.name,
                "email": customer.email,
                "phone": customer.phone,
                "is_active": customer.is_active,
                "row_version": customer.row_version,
            },
            "hlc_wall_ms": hlc.wall_ms,
            "hlc_logical": hlc.logical,
            "hlc_node_id": "server",
            "is_deleted": not customer.is_active,
        },
    )


@transaction.atomic
def create_sales_order(*, tenant, customer_id, lines: list[dict], actor_id=None, remarks: str = "", warehouse_id: str | None = None) -> SalesOrder:
    customer = Customer.objects.filter(id=customer_id, tenant=tenant, is_active=True).first()
    if not customer:
        raise SalesError("CUSTOMER_NOT_FOUND", "Customer not found or inactive.", 404)
    if not lines:
        raise SalesError("NO_LINES", "Sales order requires at least one line.")

    company = get_default_company(tenant)
    branch = get_default_branch(company)
    if warehouse_id:
        from apps.tenancy.models import Warehouse

        warehouse = Warehouse.objects.filter(id=warehouse_id, branch__company__tenant=tenant).first()
        if not warehouse:
            raise SalesError("WAREHOUSE_NOT_FOUND", "Warehouse not found.", 404)
    else:
        warehouse = get_default_warehouse(branch)

    so_number = _next_doc_number(tenant, "SO-", SalesOrder, "so_number")
    so = SalesOrder.objects.create(
        tenant=tenant,
        so_number=so_number,
        customer=customer,
        branch=branch,
        warehouse=warehouse,
        remarks=remarks,
        created_by=actor_id,
    )
    total = Decimal("0")
    for idx, line in enumerate(lines, start=1):
        qty = _q(line["qty"])
        rate = _q(line["rate"])
        amount = _q(qty * rate)
        SalesOrderLine.objects.create(
            sales_order=so,
            line_no=idx,
            item_id=line["item_id"],
            qty_ordered=qty,
            rate=rate,
            amount=amount,
        )
        total += amount
    so.total_amount = _q(total)
    so.save(update_fields=["total_amount", "updated_at", "row_version"])
    return so


@transaction.atomic
def confirm_sales_order(*, tenant, so_id) -> SalesOrder:
    so = SalesOrder.objects.filter(id=so_id, tenant=tenant).select_for_update(of=("self",)).first()
    if not so:
        raise SalesError("SO_NOT_FOUND", "Sales order not found.", 404)
    if so.status != SalesOrder.Status.DRAFT:
        raise SalesError("INVALID_STATUS", f"Cannot confirm SO in status {so.status}.", 409)
    if not so.lines.exists():
        raise SalesError("NO_LINES", "Sales order has no lines.", 400)
    so.status = SalesOrder.Status.CONFIRMED
    so.save(update_fields=["status", "updated_at", "row_version"])
    return so


@transaction.atomic
def create_delivery_from_so(*, tenant, so_id, lines: list[dict] | None = None, remarks: str = "") -> DeliveryNote:
    so = (
        SalesOrder.objects.filter(id=so_id, tenant=tenant)
        .select_related("customer", "warehouse")
        .prefetch_related("lines")
        .first()
    )
    if not so:
        raise SalesError("SO_NOT_FOUND", "Sales order not found.", 404)
    if so.status not in {SalesOrder.Status.CONFIRMED, SalesOrder.Status.PARTIALLY_DELIVERED}:
        raise SalesError("INVALID_STATUS", f"Cannot deliver against SO in status {so.status}.", 409)

    delivery_number = _next_doc_number(tenant, "DO-", DeliveryNote, "delivery_number")
    delivery = DeliveryNote.objects.create(
        tenant=tenant,
        delivery_number=delivery_number,
        sales_order=so,
        customer=so.customer,
        warehouse=so.warehouse,
        correlation_id=uuid.uuid4(),
        remarks=remarks,
    )

    so_lines = {str(line.id): line for line in so.lines.all()}
    if lines:
        for idx, row in enumerate(lines, start=1):
            so_line = so_lines.get(str(row.get("so_line_id")))
            if not so_line:
                raise SalesError("SO_LINE_NOT_FOUND", "SO line not found.", 404)
            qty = _q(row.get("qty") or row.get("qty_delivered"))
            remaining = _q(so_line.qty_ordered - so_line.qty_delivered)
            if qty <= 0 or qty > remaining:
                raise SalesError("INVALID_QTY", f"Invalid delivery qty for line {so_line.line_no}. Remaining: {remaining}", 400)
            DeliveryLine.objects.create(
                delivery=delivery,
                line_no=idx,
                sales_order_line=so_line,
                item=so_line.item,
                qty_delivered=qty,
                rate=so_line.rate,
                amount=_q(qty * so_line.rate),
            )
    else:
        for idx, so_line in enumerate(so.lines.all(), start=1):
            remaining = _q(so_line.qty_ordered - so_line.qty_delivered)
            if remaining <= 0:
                continue
            DeliveryLine.objects.create(
                delivery=delivery,
                line_no=idx,
                sales_order_line=so_line,
                item=so_line.item,
                qty_delivered=remaining,
                rate=so_line.rate,
                amount=_q(remaining * so_line.rate),
            )

    if not delivery.lines.exists():
        raise SalesError("NO_LINES", "Nothing left to deliver on this SO.", 400)
    return delivery


@transaction.atomic
def post_delivery(*, tenant, delivery_id, idempotency_key: str, actor_id=None) -> dict:
    delivery = (
        DeliveryNote.objects.filter(id=delivery_id, tenant=tenant)
        .select_for_update(of=("self",))
        .select_related("warehouse", "sales_order")
        .first()
    )
    if not delivery:
        raise SalesError("DELIVERY_NOT_FOUND", "Delivery note not found.", 404)

    if delivery.status == DeliveryNote.Status.POSTED and delivery.post_idempotency_key == idempotency_key:
        return {
            "idempotent_replay": True,
            "delivery_id": str(delivery.id),
            "delivery_number": delivery.delivery_number,
            "status": delivery.status,
        }

    if delivery.status != DeliveryNote.Status.DRAFT:
        raise SalesError("INVALID_STATUS", f"Cannot post delivery in status {delivery.status}.", 409)

    lines = list(DeliveryLine.objects.filter(delivery=delivery).select_related("sales_order_line", "item"))
    postings = []
    for line in lines:
        so_line = line.sales_order_line
        if so_line:
            remaining = _q(so_line.qty_ordered - so_line.qty_delivered)
            if line.qty_delivered > remaining:
                raise SalesError("OVER_DELIVER", f"Delivery line {line.line_no} exceeds SO remaining qty ({remaining}).", 409)

        try:
            result = post_stock_movement(
                tenant=tenant,
                item_id=line.item_id,
                qty=line.qty_delivered,
                direction=StockLedgerEntry.Direction.OUT,
                voucher_type=StockLedgerEntry.VoucherType.DELIVERY,
                idempotency_key=f"{idempotency_key}:{line.id}",
                actor_id=actor_id,
                warehouse_id=str(delivery.warehouse_id),
                remarks=f"Delivery {delivery.delivery_number}",
                correlation_id=delivery.correlation_id,
                voucher_id=delivery.id,
                voucher_line_id=line.id,
            )
        except PostingError as exc:
            raise SalesError(exc.code, exc.message, exc.status) from exc
        postings.append(result)

        if so_line:
            so_line.qty_delivered = _q(so_line.qty_delivered + line.qty_delivered)
            so_line.save(update_fields=["qty_delivered", "updated_at", "row_version"])

    if delivery.sales_order_id:
        so = SalesOrder.objects.select_for_update(of=("self",)).get(id=delivery.sales_order_id)
        all_delivered = all(_q(l.qty_delivered) >= _q(l.qty_ordered) for l in so.lines.all())
        any_delivered = any(_q(l.qty_delivered) > 0 for l in so.lines.all())
        if all_delivered:
            so.status = SalesOrder.Status.DELIVERED
        elif any_delivered:
            so.status = SalesOrder.Status.PARTIALLY_DELIVERED
        so.save(update_fields=["status", "updated_at", "row_version"])

    delivery.status = DeliveryNote.Status.POSTED
    delivery.posted_at = timezone.now()
    delivery.posted_by = actor_id
    delivery.post_idempotency_key = idempotency_key
    delivery.save(update_fields=["status", "posted_at", "posted_by", "post_idempotency_key", "updated_at", "row_version"])

    return {
        "idempotent_replay": False,
        "delivery_id": str(delivery.id),
        "delivery_number": delivery.delivery_number,
        "status": delivery.status,
        "postings": postings,
        "so_status": delivery.sales_order.status if delivery.sales_order else None,
    }


@transaction.atomic
def create_pos_sale(
    *,
    tenant,
    terminal_id,
    lines: list[dict],
    customer_id=None,
    payment_method=PosSale.PaymentMethod.CASH,
    device_fingerprint: str = "",
    actor_id=None,
) -> PosSale:
    terminal = PosTerminal.objects.filter(id=terminal_id, tenant=tenant, is_active=True).select_related("warehouse").first()
    if not terminal:
        raise SalesError("TERMINAL_NOT_FOUND", "POS terminal not found or inactive.", 404)
    if not lines:
        raise SalesError("NO_LINES", "POS sale requires at least one line.")

    customer = None
    if customer_id:
        customer = Customer.objects.filter(id=customer_id, tenant=tenant, is_active=True).first()
        if not customer:
            raise SalesError("CUSTOMER_NOT_FOUND", "Customer not found.", 404)

    draft_number = _next_doc_number(tenant, f"POS-{terminal.code}-D", PosSale, "draft_number")
    sale = PosSale.objects.create(
        tenant=tenant,
        draft_number=draft_number,
        terminal=terminal,
        customer=customer,
        warehouse=terminal.warehouse,
        payment_method=payment_method,
        correlation_id=uuid.uuid4(),
        device_fingerprint=device_fingerprint,
        posted_by=actor_id,
    )
    total = Decimal("0")
    for idx, line in enumerate(lines, start=1):
        qty = _q(line["qty"])
        rate = _q(line["rate"])
        amount = _q(qty * rate)
        PosSaleLine.objects.create(
            pos_sale=sale,
            line_no=idx,
            item_id=line["item_id"],
            qty=qty,
            rate=rate,
            amount=amount,
        )
        total += amount
    sale.total_amount = _q(total)
    sale.save(update_fields=["total_amount", "updated_at", "row_version"])
    return sale


@transaction.atomic
def post_pos_sale(*, tenant, sale_id, idempotency_key: str, actor_id=None) -> dict:
    sale = (
        PosSale.objects.filter(id=sale_id, tenant=tenant)
        .select_for_update(of=("self",))
        .select_related("terminal", "warehouse")
        .first()
    )
    if not sale:
        raise SalesError("POS_SALE_NOT_FOUND", "POS sale not found.", 404)

    if sale.status == PosSale.Status.POSTED and sale.post_idempotency_key == idempotency_key:
        return {
            "idempotent_replay": True,
            "sale_id": str(sale.id),
            "draft_number": sale.draft_number,
            "invoice_number": sale.invoice_number,
            "status": sale.status,
        }

    if sale.status != PosSale.Status.DRAFT:
        raise SalesError("INVALID_STATUS", f"Cannot post POS sale in status {sale.status}.", 409)

    lines = list(PosSaleLine.objects.filter(pos_sale=sale).select_related("item"))
    postings = []
    for line in lines:
        try:
            result = post_stock_movement(
                tenant=tenant,
                item_id=line.item_id,
                qty=line.qty,
                direction=StockLedgerEntry.Direction.OUT,
                voucher_type=StockLedgerEntry.VoucherType.POS_SALE,
                idempotency_key=f"{idempotency_key}:{line.id}",
                actor_id=actor_id,
                warehouse_id=str(sale.warehouse_id),
                remarks=f"POS {sale.draft_number}",
                correlation_id=sale.correlation_id,
                voucher_id=sale.id,
                voucher_line_id=line.id,
            )
        except PostingError as exc:
            raise SalesError(exc.code, exc.message, exc.status) from exc
        postings.append(result)

    invoice_number = _next_doc_number(tenant, f"INV-{sale.terminal.code}-", PosSale, "invoice_number")
    sale.invoice_number = invoice_number
    sale.status = PosSale.Status.POSTED
    sale.posted_at = timezone.now()
    sale.post_idempotency_key = idempotency_key
    sale.posted_by = actor_id
    sale.save(update_fields=["invoice_number", "status", "posted_at", "post_idempotency_key", "posted_by", "updated_at", "row_version"])

    journal_result = None
    try:
        journal_result = post_pos_sale_journal(tenant=tenant, sale=sale, actor_id=actor_id)
    except AccountingError as exc:
        raise SalesError(exc.code, exc.message, exc.status) from exc

    return {
        "idempotent_replay": False,
        "sale_id": str(sale.id),
        "draft_number": sale.draft_number,
        "invoice_number": sale.invoice_number,
        "status": sale.status,
        "total_amount": str(sale.total_amount),
        "postings": postings,
        "journal": journal_result,
    }
