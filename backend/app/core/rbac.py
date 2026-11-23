from enum import StrEnum


class Role(StrEnum):
    SUPER_ADMIN = "super_admin"
    FOUNDER = "founder"
    FINANCE_ADMIN = "finance_admin"
    FINANCE_MANAGER = "finance_manager"
    OPERATIONS = "operations"
    HR = "hr"
    CAMP_MANAGER = "camp_manager"
    SALES = "sales"
    ACCOUNTANT = "accountant"
    VIEWER = "viewer"
    INVESTOR = "investor"


# permission -> roles allowed
_MATRIX: dict[str, set[str]] = {
    "view": set(Role),
    "export": set(Role) - {Role.VIEWER},
    "create": {
        Role.SUPER_ADMIN, Role.FOUNDER, Role.FINANCE_ADMIN, Role.FINANCE_MANAGER,
        Role.OPERATIONS, Role.CAMP_MANAGER, Role.SALES, Role.ACCOUNTANT, Role.HR,
    },
    "edit": {
        Role.SUPER_ADMIN, Role.FOUNDER, Role.FINANCE_ADMIN, Role.FINANCE_MANAGER,
        Role.OPERATIONS, Role.CAMP_MANAGER, Role.SALES, Role.ACCOUNTANT, Role.HR,
    },
    "approve": {
        Role.SUPER_ADMIN, Role.FOUNDER, Role.FINANCE_ADMIN, Role.FINANCE_MANAGER,
    },
    "delete": {Role.SUPER_ADMIN, Role.FOUNDER, Role.FINANCE_ADMIN},
    "lock_period": {Role.SUPER_ADMIN, Role.FOUNDER, Role.FINANCE_ADMIN},
    "view_investor": set(Role),
    "view_ops_detail": set(Role) - {Role.INVESTOR},
    "manage_users": {Role.SUPER_ADMIN, Role.FOUNDER},
}


def can(role: str, permission: str) -> bool:
    allowed = _MATRIX.get(permission, set())
    return role in allowed


INVESTOR_HIDDEN_PATHS = {"/expenses", "/employees", "/documents", "/settings"}
