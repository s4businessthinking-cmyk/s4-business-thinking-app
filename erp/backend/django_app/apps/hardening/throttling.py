"""Rate-limit throttles (STAGE 16, ERP_ARCHITECTURE §5/§17.2).

- ``LoginRateThrottle`` keys on IP + email to blunt credential stuffing.
- ``HardeningTestThrottle`` is a tight scope used by the dashboard self-test
  endpoint to make the 429 behaviour observable in the browser.

Default per-user / per-anon throttles are configured via ``DEFAULT_THROTTLE_RATES``.
"""
from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        email = ""
        try:
            email = str(request.data.get("email") or "").strip().lower()
        except Exception:
            email = ""
        ident = self.get_ident(request)
        return f"throttle:login:{ident}:{email}"


class HardeningTestThrottle(SimpleRateThrottle):
    scope = "hardening_test"

    def get_cache_key(self, request, view):
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            ident = str(getattr(user, "id", "anon"))
        else:
            ident = self.get_ident(request)
        return f"throttle:hardening_test:{ident}"
