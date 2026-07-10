import uuid
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, ItemWarehouseBalance, StockLedgerEntry
from apps.inventory.services.resolver import InventoryContextError, resolve_warehouse
from apps.sync.models import server_hlc_now
from apps.sync.models.sync import SyncedRecord


class PostingError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _quantize(value) -> Decimal:
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.00000001"))


def _moving_average_rate(old_qty: Decimal, old_value: Decimal, in_qty: Decimal, in_value: Decimal) -> Decimal:
    new_qty = old_qty + in_qty
    if new_qty <= 0:
        return Decimal("0")
    return _quantize((old_value + in_value) / new_qty)


def publish_item_to_sync(item: Item) -> None:
    hlc = server_hlc_now()
    payload = {
        "sku": item.sku,
        "name": item.name,
        "brand": item.brand,
        "uom": item.uom.code,
        "standard_rate": str(item.standard_rate),
        "is_active": item.is_active,
        "row_version": item.row_version,
    }
    SyncedRecord.objects.update_or_create(
        tenant=item.tenant,
        entity_type="item",
        entity_id=str(item.id),
        defaults={
            "payload": payload,
            "hlc_wall_ms": hlc.wall_ms,
            "hlc_logical": hlc.logical,
            "hlc_node_id": "server",
            "is_deleted": not item.is_active,
        },
    )


@transaction.atomic
def post_stock_movement(
    *,
    tenant,
    item_id,
    qty: Decimal,
    direction: str,
    voucher_type: str,
    idempotency_key: str,
    actor_id=None,
    warehouse_id: str | None = None,
    valuation_rate: Decimal | None = None,
    remarks: str = "",
    correlation_id: uuid.UUID | None = None,
    voucher_id: uuid.UUID | None = None,
    voucher_line_id: uuid.UUID | None = None,
) -> dict:
    if qty <= 0:
        raise PostingError("INVALID_QTY", "Quantity must be greater than zero.")
    qty = _quantize(qty)

    existing = StockLedgerEntry.objects.filter(tenant=tenant, idempotency_key=idempotency_key).first()
    if existing:
        return {
            "idempotent_replay": True,
            "ledger_entry_id": str(existing.id),
            "balance_qty": str(existing.balance_qty),
            "balance_value": str(existing.balance_value),
        }

    item = Item.objects.filter(id=item_id, tenant=tenant, is_active=True).select_related("uom").first()
    if not item:
        raise PostingError("ITEM_NOT_FOUND", "Item not found or inactive.", 404)

    try:
        company, branch, warehouse = resolve_warehouse(tenant, warehouse_id)
    except InventoryContextError as exc:
        raise PostingError(exc.code, exc.message, exc.status) from exc

    balance, _ = ItemWarehouseBalance.objects.select_for_update().get_or_create(
        tenant=tenant,
        item=item,
        warehouse=warehouse,
        defaults={
            "on_hand_qty": Decimal("0"),
            "reserved_qty": Decimal("0"),
            "valuation_rate": item.standard_rate or Decimal("0"),
            "stock_value": Decimal("0"),
        },
    )

    signed_qty = qty if direction == StockLedgerEntry.Direction.IN else -qty
    projected_qty = balance.on_hand_qty + signed_qty

    if projected_qty < 0 and item.negative_stock_policy == Item.NegativeStockPolicy.STRICT:
        raise PostingError(
            "NEGATIVE_STOCK",
            f"Insufficient stock for {item.sku}. Available: {balance.on_hand_qty}, requested: {qty}",
            409,
        )

    rate = valuation_rate if valuation_rate is not None else (balance.valuation_rate or item.standard_rate or Decimal("0"))
    rate = _quantize(rate)
    value_change = _quantize(qty * rate)
    if direction == StockLedgerEntry.Direction.OUT:
        value_change = -value_change

    if direction == StockLedgerEntry.Direction.IN:
        new_rate = _moving_average_rate(balance.on_hand_qty, balance.stock_value, qty, value_change)
    else:
        new_rate = balance.valuation_rate

    new_qty = _quantize(projected_qty)
    new_value = _quantize(balance.stock_value + value_change)
    if new_value < 0:
        new_value = Decimal("0")

    now = timezone.now()
    entry = StockLedgerEntry.objects.create(
        tenant=tenant,
        posting_datetime=now,
        posting_date=now.date(),
        voucher_type=voucher_type,
        voucher_id=voucher_id or uuid.uuid4(),
        voucher_line_id=voucher_line_id or uuid.uuid4(),
        idempotency_key=idempotency_key,
        company=company,
        branch=branch,
        warehouse=warehouse,
        item=item,
        qty=qty,
        direction=direction,
        valuation_rate=rate,
        stock_value_change=value_change,
        balance_qty=new_qty,
        balance_value=new_value,
        correlation_id=correlation_id or uuid.uuid4(),
        posted_by=actor_id,
        meta={"remarks": remarks} if remarks else {},
    )

    balance.on_hand_qty = new_qty
    balance.valuation_rate = new_rate
    balance.stock_value = new_value
    balance.save(update_fields=["on_hand_qty", "valuation_rate", "stock_value", "updated_at", "row_version"])

    return {
        "idempotent_replay": False,
        "ledger_entry_id": str(entry.id),
        "item_id": str(item.id),
        "sku": item.sku,
        "warehouse_id": str(warehouse.id),
        "direction": direction,
        "qty": str(qty),
        "balance_qty": str(new_qty),
        "balance_value": str(new_value),
        "valuation_rate": str(new_rate),
        "voucher_type": voucher_type,
        "correlation_id": str(entry.correlation_id),
    }
