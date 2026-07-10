import contextvars

_tenant_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("tenant_id", default=None)
_tenant_slug: contextvars.ContextVar[str | None] = contextvars.ContextVar("tenant_slug", default=None)


class TenantContext:
    @staticmethod
    def set(*, tenant_id: str | None = None, tenant_slug: str | None = None):
        if tenant_id is not None:
            _tenant_id.set(str(tenant_id))
        if tenant_slug is not None:
            _tenant_slug.set(str(tenant_slug))

    @staticmethod
    def get_tenant_id() -> str | None:
        return _tenant_id.get()

    @staticmethod
    def get_tenant_slug() -> str | None:
        return _tenant_slug.get()

    @staticmethod
    def clear():
        _tenant_id.set(None)
        _tenant_slug.set(None)
