import logging


class CorrelationIdFilter(logging.Filter):
    def filter(self, record):
        from apps.core.middleware.correlation import get_correlation_id

        record.correlation_id = get_correlation_id()
        return True
