import logging
import time

logger = logging.getLogger("apps.request")


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.perf_counter()
        response = self.get_response(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        correlation_id = getattr(request, "correlation_id", "-")
        logger.info(
            "%s %s status=%s duration_ms=%s",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
            extra={"correlation_id": correlation_id},
        )
        return response
