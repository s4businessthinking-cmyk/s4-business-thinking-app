"""Document number sequences (STAGE 13.8).

Generates gap-free, formatted document numbers (e.g. ``INV-2026-0001``) with
optional yearly/monthly reset. Generation locks the row (``select_for_update``)
so concurrent callers never collide.
"""
from django.db import transaction
from django.utils import timezone

from apps.customization.models import NumberSequence


class SequenceError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _period_token(reset_period: str) -> str:
    now = timezone.now()
    if reset_period == NumberSequence.ResetPeriod.YEARLY:
        return now.strftime("%Y")
    if reset_period == NumberSequence.ResetPeriod.MONTHLY:
        return now.strftime("%Y%m")
    return ""


def _format(seq: NumberSequence, number: int, period: str) -> str:
    num = str(number).zfill(max(seq.padding, 0))
    if period:
        base = seq.prefix
        if base and not base.endswith("-"):
            base = f"{base}-"
        return f"{base}{period}-{num}{seq.suffix}"
    return f"{seq.prefix}{num}{seq.suffix}"


@transaction.atomic
def next_value(*, tenant, code):
    seq = NumberSequence.objects.select_for_update().filter(tenant=tenant, code=code).first()
    if not seq:
        raise SequenceError("SEQUENCE_NOT_FOUND", "Number sequence not found", 404)
    if not seq.enabled:
        raise SequenceError("SEQUENCE_DISABLED", "Number sequence is disabled", 409)

    period = _period_token(seq.reset_period)
    if seq.reset_period != NumberSequence.ResetPeriod.NONE and seq.current_period != period:
        seq.current_period = period
        seq.next_number = 1

    number = seq.next_number
    formatted = _format(seq, number, period)

    seq.next_number = number + 1
    seq.save(update_fields=["next_number", "current_period", "updated_at"])
    return {"code": seq.code, "number": number, "formatted": formatted, "period": period}


def peek_value(*, tenant, code):
    seq = NumberSequence.objects.filter(tenant=tenant, code=code).first()
    if not seq:
        raise SequenceError("SEQUENCE_NOT_FOUND", "Number sequence not found", 404)
    period = _period_token(seq.reset_period)
    number = 1 if (seq.reset_period != NumberSequence.ResetPeriod.NONE and seq.current_period != period) else seq.next_number
    return {"code": seq.code, "number": number, "formatted": _format(seq, number, period), "period": period}
