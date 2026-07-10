from apps.rbac.models import Permission, Role, RolePermission

DEFAULT_PERMISSIONS = [
    ("admin.user.invite", "admin", "user", "invite", "Invite users"),
    ("admin.role.manage", "admin", "role", "manage", "Manage roles"),
    ("sales.invoice.read", "sales", "invoice", "read", "Read sales invoices"),
    ("sales.invoice.create", "sales", "invoice", "create", "Create sales invoices"),
    ("sales.customer.read", "sales", "customer", "read", "Read customers"),
    ("sales.customer.create", "sales", "customer", "create", "Create customers"),
    ("sales.so.read", "sales", "so", "read", "Read sales orders"),
    ("sales.so.create", "sales", "so", "create", "Create sales orders"),
    ("sales.so.confirm", "sales", "so", "confirm", "Confirm sales orders"),
    ("sales.delivery.read", "sales", "delivery", "read", "Read deliveries"),
    ("sales.delivery.create", "sales", "delivery", "create", "Create deliveries"),
    ("sales.delivery.post", "sales", "delivery", "post", "Post deliveries"),
    ("pos.terminal.read", "pos", "terminal", "read", "Read POS terminals"),
    ("pos.terminal.create", "pos", "terminal", "create", "Create POS terminals"),
    ("pos.sale.read", "pos", "sale", "read", "Read POS sales"),
    ("pos.sale.create", "pos", "sale", "create", "Create POS sales"),
    ("pos.sale.post", "pos", "sale", "post", "Post POS sales"),
    ("purchase.invoice.read", "purchase", "invoice", "read", "Read purchase invoices"),
    ("purchase.supplier.read", "purchase", "supplier", "read", "Read suppliers"),
    ("purchase.supplier.create", "purchase", "supplier", "create", "Create suppliers"),
    ("purchase.po.read", "purchase", "po", "read", "Read purchase orders"),
    ("purchase.po.create", "purchase", "po", "create", "Create purchase orders"),
    ("purchase.po.submit", "purchase", "po", "submit", "Submit purchase orders"),
    ("purchase.grn.read", "purchase", "grn", "read", "Read GRNs"),
    ("purchase.grn.create", "purchase", "grn", "create", "Create GRNs"),
    ("purchase.grn.post", "purchase", "grn", "post", "Post GRNs"),
    ("inventory.item.read", "inventory", "item", "read", "Read items"),
    ("inventory.item.create", "inventory", "item", "create", "Create items"),
    ("inventory.item.update", "inventory", "item", "update", "Update items"),
    ("inventory.stock.read", "inventory", "stock", "read", "Read stock"),
    ("inventory.stock.adjust", "inventory", "stock", "adjust", "Adjust stock"),
    ("accounting.account.read", "accounting", "account", "read", "Read chart of accounts"),
    ("accounting.je.read", "accounting", "je", "read", "Read journal entries"),
    ("accounting.je.create", "accounting", "je", "create", "Create journal entries"),
    ("accounting.je.post", "accounting", "je", "post", "Post journal entries"),
    ("accounting.gl.read", "accounting", "gl", "read", "Read general ledger"),
    ("accounting.report.read", "accounting", "report", "read", "Read accounting reports"),
    ("hrm.department.read", "hrm", "department", "read", "Read departments"),
    ("hrm.department.create", "hrm", "department", "create", "Create departments"),
    ("hrm.employee.read", "hrm", "employee", "read", "Read employees"),
    ("hrm.employee.create", "hrm", "employee", "create", "Create employees"),
    ("hrm.attendance.read", "hrm", "attendance", "read", "Read attendance"),
    ("hrm.attendance.create", "hrm", "attendance", "create", "Record attendance"),
    ("hrm.leave.read", "hrm", "leave", "read", "Read leave requests"),
    ("hrm.leave.create", "hrm", "leave", "create", "Create leave requests"),
    ("hrm.leave.approve", "hrm", "leave", "approve", "Approve leave requests"),
    ("crm.lead.read", "crm", "lead", "read", "Read leads"),
    ("crm.lead.create", "crm", "lead", "create", "Create leads"),
    ("crm.lead.convert", "crm", "lead", "convert", "Convert leads to customers"),
    ("crm.opportunity.read", "crm", "opportunity", "read", "Read opportunities"),
    ("crm.opportunity.create", "crm", "opportunity", "create", "Create opportunities"),
    ("crm.opportunity.update", "crm", "opportunity", "update", "Update opportunities"),
    ("crm.activity.read", "crm", "activity", "read", "Read CRM activities"),
    ("crm.activity.create", "crm", "activity", "create", "Create CRM activities"),
    ("reports.catalog.read", "reports", "catalog", "read", "Read report catalog"),
    ("reports.dashboard.read", "reports", "dashboard", "read", "Read dashboard KPIs"),
    ("reports.inventory.read", "reports", "inventory", "read", "Read inventory reports"),
    ("reports.sales.read", "reports", "sales", "read", "Read sales reports"),
    ("reports.purchase.read", "reports", "purchase", "read", "Read purchase reports"),
    ("reports.finance.read", "reports", "finance", "read", "Read finance reports"),
    ("reports.crm.read", "reports", "crm", "read", "Read CRM reports"),
    ("reports.hrm.read", "reports", "hrm", "read", "Read HRM reports"),
    ("reports.run", "reports", "run", "run", "Execute reports"),
    ("reports.run.read", "reports", "run", "read", "Read report run history"),
]

DEFAULT_ROLES = {
    "OWNER": ["admin.user.invite", "admin.role.manage", "sales.invoice.read", "sales.invoice.create", "sales.customer.read", "sales.customer.create", "sales.so.read", "sales.so.create", "sales.so.confirm", "sales.delivery.read", "sales.delivery.create", "sales.delivery.post", "pos.terminal.read", "pos.terminal.create", "pos.sale.read", "pos.sale.create", "pos.sale.post", "purchase.invoice.read", "purchase.supplier.read", "purchase.supplier.create", "purchase.po.read", "purchase.po.create", "purchase.po.submit", "purchase.grn.read", "purchase.grn.create", "purchase.grn.post", "inventory.item.read", "inventory.item.create", "inventory.item.update", "inventory.stock.read", "inventory.stock.adjust", "accounting.account.read", "accounting.je.read", "accounting.je.create", "accounting.je.post", "accounting.gl.read", "accounting.report.read", "hrm.department.read", "hrm.department.create", "hrm.employee.read", "hrm.employee.create", "hrm.attendance.read", "hrm.attendance.create", "hrm.leave.read", "hrm.leave.create", "hrm.leave.approve", "crm.lead.read", "crm.lead.create", "crm.lead.convert", "crm.opportunity.read", "crm.opportunity.create", "crm.opportunity.update", "crm.activity.read", "crm.activity.create", "reports.catalog.read", "reports.dashboard.read", "reports.inventory.read", "reports.sales.read", "reports.purchase.read", "reports.finance.read", "reports.crm.read", "reports.hrm.read", "reports.run", "reports.run.read"],
    "ADMIN": ["admin.user.invite", "admin.role.manage", "sales.invoice.read", "sales.invoice.create", "sales.customer.read", "sales.customer.create", "sales.so.read", "sales.so.create", "sales.so.confirm", "sales.delivery.read", "sales.delivery.create", "sales.delivery.post", "pos.terminal.read", "pos.terminal.create", "pos.sale.read", "pos.sale.create", "pos.sale.post", "purchase.invoice.read", "purchase.supplier.read", "purchase.supplier.create", "purchase.po.read", "purchase.po.create", "purchase.po.submit", "purchase.grn.read", "purchase.grn.create", "purchase.grn.post", "inventory.item.read", "inventory.item.create", "inventory.item.update", "inventory.stock.read", "inventory.stock.adjust", "accounting.account.read", "accounting.je.read", "accounting.je.create", "accounting.je.post", "accounting.gl.read", "accounting.report.read", "hrm.department.read", "hrm.department.create", "hrm.employee.read", "hrm.employee.create", "hrm.attendance.read", "hrm.attendance.create", "hrm.leave.read", "hrm.leave.create", "hrm.leave.approve", "crm.lead.read", "crm.lead.create", "crm.lead.convert", "crm.opportunity.read", "crm.opportunity.create", "crm.opportunity.update", "crm.activity.read", "crm.activity.create", "reports.catalog.read", "reports.dashboard.read", "reports.inventory.read", "reports.sales.read", "reports.purchase.read", "reports.finance.read", "reports.crm.read", "reports.hrm.read", "reports.run", "reports.run.read"],
    "SALESPERSON": ["sales.invoice.read", "sales.invoice.create", "sales.customer.read", "sales.so.read", "sales.so.create", "sales.so.confirm", "sales.delivery.read", "sales.delivery.create", "sales.delivery.post", "pos.terminal.read", "pos.sale.read", "pos.sale.create", "pos.sale.post", "inventory.item.read", "inventory.stock.read", "crm.lead.read", "crm.lead.create", "crm.lead.convert", "crm.opportunity.read", "crm.opportunity.create", "crm.opportunity.update", "crm.activity.read", "crm.activity.create", "reports.catalog.read", "reports.dashboard.read", "reports.sales.read", "reports.crm.read", "reports.run", "reports.run.read"],
    "PURCHASER": ["purchase.invoice.read", "purchase.supplier.read", "purchase.supplier.create", "purchase.po.read", "purchase.po.create", "purchase.po.submit", "purchase.grn.read", "purchase.grn.create", "purchase.grn.post", "inventory.item.read", "inventory.stock.read", "reports.catalog.read", "reports.dashboard.read", "reports.inventory.read", "reports.purchase.read", "reports.run", "reports.run.read"],
    "AUDITOR_READ_ONLY": ["sales.invoice.read", "purchase.invoice.read", "inventory.item.read", "inventory.stock.read", "accounting.account.read", "accounting.je.read", "accounting.gl.read", "accounting.report.read", "hrm.employee.read", "hrm.attendance.read", "hrm.leave.read", "crm.lead.read", "crm.opportunity.read", "crm.activity.read", "reports.catalog.read", "reports.dashboard.read", "reports.inventory.read", "reports.sales.read", "reports.purchase.read", "reports.finance.read", "reports.crm.read", "reports.hrm.read", "reports.run.read"],
}


def ensure_permissions() -> dict[str, Permission]:
    out = {}
    for code, module, obj, action, description in DEFAULT_PERMISSIONS:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={
                "module": module,
                "object": obj,
                "action": action,
                "description": description,
            },
        )
        out[code] = perm
    return out


def ensure_roles(perms: dict[str, Permission]) -> dict[str, Role]:
    out = {}
    for code in DEFAULT_ROLES:
        role, _ = Role.objects.get_or_create(
            code=code,
            defaults={"name": code.replace("_", " ").title(), "kind": Role.Kind.SYSTEM},
        )
        out[code] = role
        for perm_code in DEFAULT_ROLES[code]:
            perm = perms.get(perm_code)
            if perm:
                RolePermission.objects.get_or_create(role=role, permission=perm)
    return out
