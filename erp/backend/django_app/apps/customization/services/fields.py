"""Custom field definition + value handling (STAGE 13.8)."""
from datetime import date
from decimal import Decimal, InvalidOperation

from apps.customization.models import CustomFieldDef, CustomFieldValue, FieldType


class CustomizationError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _validate_value(field: CustomFieldDef, raw: str) -> str:
    raw = "" if raw is None else str(raw)
    if field.required and not raw:
        raise CustomizationError("VALUE_REQUIRED", f"{field.code} is required", 400)
    if not raw:
        return ""

    if field.field_type == FieldType.NUMBER:
        try:
            Decimal(raw)
        except (InvalidOperation, ValueError):
            raise CustomizationError("INVALID_NUMBER", f"{field.code} must be a number", 400)
    elif field.field_type == FieldType.BOOLEAN:
        if raw.lower() not in {"true", "false", "1", "0", "yes", "no"}:
            raise CustomizationError("INVALID_BOOLEAN", f"{field.code} must be boolean", 400)
    elif field.field_type == FieldType.DATE:
        try:
            date.fromisoformat(raw)
        except ValueError:
            raise CustomizationError("INVALID_DATE", f"{field.code} must be ISO date (YYYY-MM-DD)", 400)
    elif field.field_type == FieldType.SELECT:
        options = field.options or []
        if raw not in options:
            raise CustomizationError("INVALID_OPTION", f"{field.code} must be one of {options}", 400)
    return raw


def set_value(*, tenant, field_id, entity_id, value):
    field = CustomFieldDef.objects.filter(tenant=tenant, id=field_id, enabled=True).first()
    if not field:
        raise CustomizationError("FIELD_NOT_FOUND", "Custom field not found or disabled", 404)
    entity_id = (entity_id or "").strip()
    if not entity_id:
        raise CustomizationError("ENTITY_ID_REQUIRED", "entity_id is required", 400)

    validated = _validate_value(field, value)
    obj, _ = CustomFieldValue.objects.update_or_create(
        field=field,
        entity_id=entity_id,
        defaults={
            "tenant": tenant,
            "entity_type": field.entity_type,
            "value_text": validated,
        },
    )
    return obj


def get_values(*, tenant, entity_type, entity_id):
    return (
        CustomFieldValue.objects.filter(tenant=tenant, entity_type=entity_type, entity_id=entity_id)
        .select_related("field")
        .order_by("field__sort_order")
    )
