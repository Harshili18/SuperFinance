from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

ALGO = "HS256"


def hash_secret(value: str) -> str:
    return bcrypt.hashpw(value.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_secret(value: str, hashed: str) -> bool:
    return bcrypt.checkpw(value.encode("utf-8"), hashed.encode("utf-8"))


def create_token(sub: str, token_type: str, minutes: int | None = None, days: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    if days is not None:
        exp = now + timedelta(days=days)
    else:
        exp = now + timedelta(minutes=minutes or settings.access_token_minutes)
    payload: dict[str, Any] = {"sub": sub, "type": token_type, "iat": int(now.timestamp()), "exp": exp}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGO)


def decode_token(token: str, expected: str) -> dict[str, Any] | None:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[ALGO])
        if data.get("type") != expected:
            return None
        return data
    except JWTError:
        return None
