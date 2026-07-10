from django.core.cache import cache
from django.utils import timezone


class LoginThrottle:
    WINDOW_SECONDS = 15 * 60
    MAX_ATTEMPTS = 10

    def __init__(self, email: str, ip: str | None):
        self.email_key = f"auth:throttle:email:{email.lower()}"
        self.ip_key = f"auth:throttle:ip:{ip or 'unknown'}"

    def is_blocked(self) -> bool:
        email_count = cache.get(self.email_key, 0)
        ip_count = cache.get(self.ip_key, 0)
        return email_count >= self.MAX_ATTEMPTS or ip_count >= self.MAX_ATTEMPTS

    def record_failure(self):
        self._incr(self.email_key)
        self._incr(self.ip_key)

    def clear(self):
        cache.delete(self.email_key)
        cache.delete(self.ip_key)

    def _incr(self, key: str):
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=self.WINDOW_SECONDS)


class AccountLockout:
    MAX_FAILED = 5
    LOCK_MINUTES = 15

    @classmethod
    def register_failure(cls, user):
        user.failed_attempts += 1
        if user.failed_attempts >= cls.MAX_FAILED:
            user.lockout_until = timezone.now() + timezone.timedelta(minutes=cls.LOCK_MINUTES)
            user.status = user.Status.LOCKED
        user.save(update_fields=["failed_attempts", "lockout_until", "status", "updated_at"])

    @classmethod
    def reset(cls, user):
        user.clear_lockout()
        user.save(update_fields=["failed_attempts", "lockout_until", "status", "updated_at"])
