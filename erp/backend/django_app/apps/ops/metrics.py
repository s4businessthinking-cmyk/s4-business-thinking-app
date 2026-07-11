"""Dependency-free Prometheus metrics registry (STAGE 15, ERP_ARCHITECTURE §16.4/§26).

A tiny thread-safe in-process registry that renders the Prometheus text
exposition format. Kept dependency-free so it runs unchanged under Daphne
(single process) and Gunicorn (per-worker counters — a scrape hits one worker,
which is acceptable for HPA/request-rate signals).
"""
import threading
import time

_LOCK = threading.Lock()

# Default latency buckets (seconds) — aligned with typical API SLOs.
_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)

_PROCESS_START = time.time()

# http_requests_total{method,status_class} -> count
_request_counts: dict[tuple[str, str], int] = {}
# latency histogram: bucket index -> count, plus sum + count
_latency_buckets: list[int] = [0] * (len(_BUCKETS) + 1)
_latency_sum: float = 0.0
_latency_count: int = 0
_in_flight: int = 0


def inc_in_flight() -> None:
    global _in_flight
    with _LOCK:
        _in_flight += 1


def dec_in_flight() -> None:
    global _in_flight
    with _LOCK:
        _in_flight = max(0, _in_flight - 1)


def observe_request(method: str, status_code: int, duration_seconds: float) -> None:
    global _latency_sum, _latency_count
    status_class = f"{status_code // 100}xx"
    key = (method.upper(), status_class)
    with _LOCK:
        _request_counts[key] = _request_counts.get(key, 0) + 1
        _latency_sum += duration_seconds
        _latency_count += 1
        placed = False
        for i, edge in enumerate(_BUCKETS):
            if duration_seconds <= edge:
                _latency_buckets[i] += 1
                placed = True
                break
        if not placed:
            _latency_buckets[-1] += 1


def snapshot() -> dict:
    """Machine-readable snapshot for the ops status API / dashboard."""
    with _LOCK:
        total = sum(_request_counts.values())
        by_class: dict[str, int] = {}
        for (_, status_class), count in _request_counts.items():
            by_class[status_class] = by_class.get(status_class, 0) + count
        avg_latency = (_latency_sum / _latency_count) if _latency_count else 0.0
        return {
            "requests_total": total,
            "requests_by_class": by_class,
            "in_flight": _in_flight,
            "avg_latency_ms": round(avg_latency * 1000, 2),
            "uptime_seconds": round(time.time() - _PROCESS_START, 1),
        }


def _cumulative_buckets() -> list[int]:
    cumulative = []
    running = 0
    for i in range(len(_BUCKETS)):
        running += _latency_buckets[i]
        cumulative.append(running)
    running += _latency_buckets[-1]  # +Inf bucket
    cumulative.append(running)
    return cumulative


def _format_labels(labels: dict | None) -> str:
    if not labels:
        return ""
    parts = [f'{k}="{v}"' for k, v in labels.items()]
    return "{" + ",".join(parts) + "}"


def render(extra: list[dict] | None = None) -> str:
    """Render Prometheus text exposition format.

    ``extra`` is a list of ``{"name", "labels"(dict), "value", "help"(optional)}``
    gauge samples. Samples are grouped by metric name so each name emits its
    ``# TYPE`` line exactly once (labels never leak into the TYPE/HELP lines).
    """
    lines: list[str] = []
    with _LOCK:
        lines.append("# HELP s4_http_requests_total Total HTTP requests handled.")
        lines.append("# TYPE s4_http_requests_total counter")
        for (method, status_class), count in sorted(_request_counts.items()):
            lines.append(
                f's4_http_requests_total{{method="{method}",status="{status_class}"}} {count}'
            )

        lines.append("# HELP s4_http_requests_in_flight In-flight HTTP requests.")
        lines.append("# TYPE s4_http_requests_in_flight gauge")
        lines.append(f"s4_http_requests_in_flight {_in_flight}")

        lines.append("# HELP s4_http_request_duration_seconds Request latency histogram.")
        lines.append("# TYPE s4_http_request_duration_seconds histogram")
        cumulative = _cumulative_buckets()
        for i, edge in enumerate(_BUCKETS):
            lines.append(
                f's4_http_request_duration_seconds_bucket{{le="{edge}"}} {cumulative[i]}'
            )
        lines.append(
            f's4_http_request_duration_seconds_bucket{{le="+Inf"}} {cumulative[-1]}'
        )
        lines.append(f"s4_http_request_duration_seconds_sum {round(_latency_sum, 6)}")
        lines.append(f"s4_http_request_duration_seconds_count {_latency_count}")

        lines.append("# HELP s4_process_uptime_seconds Process uptime in seconds.")
        lines.append("# TYPE s4_process_uptime_seconds gauge")
        lines.append(f"s4_process_uptime_seconds {round(time.time() - _PROCESS_START, 1)}")

    if extra:
        grouped: dict[str, list[dict]] = {}
        order: list[str] = []
        helps: dict[str, str] = {}
        for sample in extra:
            name = sample["name"]
            if name not in grouped:
                grouped[name] = []
                order.append(name)
            grouped[name].append(sample)
            if sample.get("help") and name not in helps:
                helps[name] = sample["help"]
        for name in order:
            if name in helps:
                lines.append(f"# HELP {name} {helps[name]}")
            lines.append(f"# TYPE {name} gauge")
            for sample in grouped[name]:
                lines.append(f"{name}{_format_labels(sample.get('labels'))} {sample['value']}")

    return "\n".join(lines) + "\n"
