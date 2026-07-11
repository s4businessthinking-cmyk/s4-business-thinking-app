"""Security response headers (STAGE 14, ERP_ARCHITECTURE §17.7).

Applied to every response from the ERP backend. Conservative defaults so the
DRF browsable API and Django admin keep working; a CSP can be enabled via
``SECURITY_CONTENT_SECURITY_POLICY`` when the API is served on its own origin.
"""
from django.conf import settings


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.setdefault(
            "Permissions-Policy",
            getattr(settings, "SECURITY_PERMISSIONS_POLICY", "geolocation=(), microphone=(), camera=()"),
        )
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")

        if request.is_secure():
            response.setdefault(
                "Strict-Transport-Security",
                getattr(settings, "SECURITY_HSTS_HEADER", "max-age=31536000; includeSubDomains"),
            )

        csp = getattr(settings, "SECURITY_CONTENT_SECURITY_POLICY", "")
        if csp:
            response.setdefault("Content-Security-Policy", csp)

        return response
