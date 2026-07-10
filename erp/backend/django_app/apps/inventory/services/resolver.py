from apps.tenancy.models import Branch, Company, Warehouse


class InventoryContextError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def get_default_company(tenant) -> Company:
    company = Company.objects.filter(tenant=tenant, is_default=True).first()
    if not company:
        company = Company.objects.filter(tenant=tenant).order_by("created_at").first()
    if not company:
        raise InventoryContextError("COMPANY_NOT_FOUND", "No company configured for tenant.", 404)
    return company


def get_default_branch(company: Company) -> Branch:
    branch = Branch.objects.filter(company=company, is_default=True, is_active=True).first()
    if not branch:
        branch = Branch.objects.filter(company=company, is_active=True).order_by("created_at").first()
    if not branch:
        raise InventoryContextError("BRANCH_NOT_FOUND", "No active branch configured.", 404)
    return branch


def get_default_warehouse(branch: Branch) -> Warehouse:
    warehouse = Warehouse.objects.filter(branch=branch, is_default=True).first()
    if not warehouse:
        warehouse = Warehouse.objects.filter(branch=branch).order_by("created_at").first()
    if not warehouse:
        raise InventoryContextError("WAREHOUSE_NOT_FOUND", "No warehouse configured.", 404)
    return warehouse


def resolve_warehouse(tenant, warehouse_id: str | None = None) -> tuple[Company, Branch, Warehouse]:
    company = get_default_company(tenant)
    branch = get_default_branch(company)
    if warehouse_id:
        warehouse = Warehouse.objects.filter(id=warehouse_id, branch__company__tenant=tenant).select_related("branch").first()
        if not warehouse:
            raise InventoryContextError("WAREHOUSE_NOT_FOUND", "Warehouse not found for tenant.", 404)
        return company, warehouse.branch, warehouse
    return company, branch, get_default_warehouse(branch)
