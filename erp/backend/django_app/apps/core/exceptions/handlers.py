from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        request = context.get("request")
        correlation_id = getattr(request, "correlation_id", None) if request else None
        body = {
            "success": False,
            "error": {
                "code": _error_code(exc),
                "message": _error_message(response.data),
                "details": response.data if isinstance(response.data, dict) else {"detail": response.data},
            },
        }
        if correlation_id:
            body["correlation_id"] = correlation_id
        response.data = body
    return response


def _error_code(exc):
    name = exc.__class__.__name__
    if name.endswith("Error"):
        return name
    return "APIError"


def _error_message(data):
    if isinstance(data, dict):
        if "detail" in data:
            detail = data["detail"]
            return str(detail)
        first_key = next(iter(data), None)
        if first_key:
            val = data[first_key]
            if isinstance(val, list) and val:
                return str(val[0])
            return str(val)
    return "Request failed"
