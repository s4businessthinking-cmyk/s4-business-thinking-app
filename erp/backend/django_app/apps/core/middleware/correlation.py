import logging
import uuid

logger = logging.getLogger(__name__)


class CorrelationIdMiddleware:
    """Attach a correlation ID to every request for traceable logs."""

    HEADER_NAME = "HTTP_X_CORRELATION_ID"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        correlation_id = request.META.get(self.HEADER_NAME) or str(uuid.uuid4())
        request.correlation_id = correlation_id

        with _CorrelationContext(correlation_id):
            response = self.get_response(request)

        response["X-Correlation-Id"] = correlation_id
        return response


class _CorrelationContext:
    _current = None

    def __init__(self, correlation_id):
        self.correlation_id = correlation_id
        self.previous = None

    def __enter__(self):
        self.previous = _CorrelationContext._current
        _CorrelationContext._current = self.correlation_id
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        _CorrelationContext._current = self.previous

    @classmethod
    def get(cls):
        return cls._current or "-"


def get_correlation_id():
    return _CorrelationContext.get()
