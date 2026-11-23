from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.rbac import can
from app.core.security import decode_token
from app.db.session import get_db
from app.models import User


def current_user(
    db: Session = Depends(get_db),
    sf_access: str | None = Cookie(default=None),
) -> User:
    if not sf_access:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in.")
    data = decode_token(sf_access, "access")
    if not data or not data.get("sub"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    user = db.get(User, data["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is inactive.")
    return user


def require(permission: str):
    def _inner(user: User = Depends(current_user)) -> User:
        if not can(user.role, permission):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission for this action.")
        return user
    return _inner
