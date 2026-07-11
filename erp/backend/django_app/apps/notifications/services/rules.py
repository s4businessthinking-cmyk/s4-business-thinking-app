"""Notification rule engine (STAGE 13).

Rules evaluate real business state and emit notifications. The only automated
trigger implemented here is LOW_STOCK, which reads live warehouse balances
(no fake data). CUSTOM rules are placeholders for manual/ad-hoc dispatch and
match nothing automatically.
"""
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from apps.inventory.models import ItemWarehouseBalance
from apps.notifications.models import Notification, NotificationRule
from apps.notifications.services.dispatch import create_notification


class RuleError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _to_decimal(value, default="0") -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _has_open_notification(tenant, rule_code, entity_id) -> bool:
    """Avoid duplicate spam: skip if an unread notification already exists."""
    return Notification.objects.filter(
        tenant=tenant,
        source_rule=rule_code,
        entity_id=entity_id,
        is_read=False,
    ).exists()


def _run_low_stock(tenant, rule: NotificationRule) -> dict:
    threshold = _to_decimal(rule.config.get("threshold_qty", "0"))
    balances = (
        ItemWarehouseBalance.objects.filter(tenant=tenant, on_hand_qty__lte=threshold)
        .select_related("item", "warehouse")
        .order_by("warehouse__code", "item__sku")[:500]
    )
    matched = 0
    created = 0
    for bal in balances:
        matched += 1
        entity_id = str(bal.id)
        if _has_open_notification(tenant, rule.code, entity_id):
            continue
        create_notification(
            tenant=tenant,
            title=f"Low stock: {bal.item.name} ({bal.item.sku})",
            body=(
                f"Warehouse {bal.warehouse.code} on-hand {bal.on_hand_qty} "
                f"≤ threshold {threshold}."
            ),
            category=rule.category,
            severity=rule.severity,
            entity_type="inventory.item_warehouse_balance",
            entity_id=entity_id,
            source_rule=rule.code,
            meta={
                "item_sku": bal.item.sku,
                "warehouse_code": bal.warehouse.code,
                "on_hand_qty": str(bal.on_hand_qty),
                "threshold_qty": str(threshold),
            },
            realtime=rule.realtime,
        )
        created += 1
    return {"matched": matched, "created": created}


def run_rule(*, tenant, rule: NotificationRule) -> dict:
    if not rule.enabled:
        raise RuleError("RULE_DISABLED", "Rule is disabled", 409)

    if rule.trigger_type == NotificationRule.TriggerType.LOW_STOCK:
        result = _run_low_stock(tenant, rule)
    else:
        result = {"matched": 0, "created": 0}

    rule.last_run_at = timezone.now()
    rule.last_match_count = result["matched"]
    rule.save(update_fields=["last_run_at", "last_match_count", "updated_at"])
    return {"rule_code": rule.code, "trigger_type": rule.trigger_type, **result}


def run_all_rules(*, tenant) -> dict:
    rules = NotificationRule.objects.filter(tenant=tenant, enabled=True)
    results = []
    total_created = 0
    for rule in rules:
        res = run_rule(tenant=tenant, rule=rule)
        total_created += res["created"]
        results.append(res)
    return {"rules_run": len(results), "total_created": total_created, "results": results}
