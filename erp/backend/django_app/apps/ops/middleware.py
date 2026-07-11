"""HTTP request metrics middleware (STAGE 15, §16.4/§26).

Records per-request counters and latency into the in-process metrics registry.
Skips the ``/metrics`` scrape path itself to avoid self-inflating counters.
"""
import time

from apps.ops import metrics


class RequestMetricsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        if path.endswith("/metrics/") or path.endswith("/metrics"):
            return self.get_response(request)

        metrics.inc_in_flight()
        started = time.perf_counter()
        status_code = 500
        try:
            response = self.get_response(request)
            status_code = getattr(response, "status_code", 500)
            return response
        finally:
            duration = time.perf_counter() - started
            metrics.dec_in_flight()
            metrics.observe_request(request.method or "GET", status_code, duration)
