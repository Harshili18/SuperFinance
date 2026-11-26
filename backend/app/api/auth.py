from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_token, decode_token, hash_secret, verify_secret
from app.db.session import get_db
from app.deps import current_user
from app.models import OtpChallenge, User
from app.schemas import OtpRequest, OtpVerify, PasswordLogin, ThemeIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# naive in-memory rate bucket: phone -> [timestamps]
_otp_hits: dict[str, list[datetime]] = {}


def _rate_limit(phone: str) -> None:
    now = datetime.now(timezone.utc)
    window = now - timedelta(minutes=10)
    hits = [t for t in _otp_hits.get(phone, []) if t > window]
    if len(hits) >= 5:
        raise HTTPException(429, "Too many OTP requests. Wait a few minutes and try again.")
    hits.append(now)
    _otp_hits[phone] = hits


def _set_cookies(response: Response, user_id: str) -> None:
    access = create_token(user_id, "access", minutes=settings.access_token_minutes)
    refresh = create_token(user_id, "refresh", days=settings.refresh_token_days)
    kw = settings.cookie_kwargs
    response.set_cookie("sf_access", access, max_age=settings.access_token_minutes * 60, **kw)
    response.set_cookie("sf_refresh", refresh, max_age=settings.refresh_token_days * 86400, **kw)


def _clear_cookies(response: Response) -> None:
    kw = settings.cookie_kwargs
    response.delete_cookie("sf_access", path=kw["path"], samesite=kw["samesite"], secure=kw["secure"])
    response.delete_cookie("sf_refresh", path=kw["path"], samesite=kw["samesite"], secure=kw["secure"])


@router.post("/otp/request")
def request_otp(body: OtpRequest, db: Session = Depends(get_db)):
    phone = "".join(ch for ch in body.phone if ch.isdigit())
    if len(phone) < 10:
        raise HTTPException(400, "Enter a valid 10-digit mobile number.")
    _rate_limit(phone)
    user = db.scalar(select(User).where(User.phone == phone, User.is_active.is_(True)))
    if not user:
        raise HTTPException(404, "No active user for this mobile number. Ask an admin to add you.")
    if not settings.is_dev:
        raise HTTPException(
            501,
            "Production OTP is not configured. Connect an SMS provider (MSG91/Twilio) before going live.",
        )
    code = settings.dev_otp
    db.add(OtpChallenge(
        phone=phone,
        code_hash=hash_secret(code),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=settings.otp_expiry_minutes),
    ))
    db.commit()
    return {
        "ok": True,
        "message": "OTP sent.",
        "development": True,
        "dev_otp": code,
        "hint": "Development OTP is shown only in ENVIRONMENT=development.",
    }


def _still_valid(expires_at: datetime) -> bool:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    exp = expires_at
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if getattr(exp, "tzinfo", None):
        exp = exp.replace(tzinfo=None)
    return exp >= now


@router.post("/otp/verify", response_model=UserOut)
def verify_otp(body: OtpVerify, response: Response, db: Session = Depends(get_db)):
    phone = "".join(ch for ch in body.phone if ch.isdigit())
    code = body.code.strip()
    user = db.scalar(select(User).where(User.phone == phone, User.is_active.is_(True)))
    if not user:
        raise HTTPException(404, "User not found.")

    # Clearly marked development bypass — disabled when ENVIRONMENT=production.
    if settings.is_dev and code == settings.dev_otp:
        _set_cookies(response, user.id)
        return user

    challenge = db.scalar(
        select(OtpChallenge)
        .where(OtpChallenge.phone == phone, OtpChallenge.consumed.is_(False))
        .order_by(OtpChallenge.created_at.desc())
    )
    if not challenge or not _still_valid(challenge.expires_at):
        raise HTTPException(400, "OTP expired. Request a new one.")
    if challenge.attempts >= 5:
        raise HTTPException(400, "Too many incorrect attempts. Request a new OTP.")
    if not verify_secret(code, challenge.code_hash):
        challenge.attempts += 1
        db.commit()
        raise HTTPException(400, "Incorrect OTP.")
    challenge.consumed = True
    db.commit()
    _set_cookies(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(body: PasswordLogin, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower(), User.is_active.is_(True)))
    if not user or not user.password_hash or not verify_secret(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect.")
    _set_cookies(response, user.id)
    return user


@router.post("/refresh", response_model=UserOut)
def refresh(response: Response, db: Session = Depends(get_db), sf_refresh: str | None = Cookie(default=None)):
    if not sf_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    data = decode_token(sf_refresh, "refresh")
    if not data or not data.get("sub"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    user = db.get(User, data["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is inactive.")
    _set_cookies(response, user.id)
    return user


@router.post("/logout")
def logout(response: Response):
    _clear_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/theme")
def set_theme(body: ThemeIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if body.theme not in {"light", "dark"}:
        raise HTTPException(400, "Theme must be light or dark.")
    user.theme = body.theme
    db.commit()
    return {"theme": user.theme}
