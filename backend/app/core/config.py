from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND = Path(__file__).resolve().parents[2]
_ROOT = _BACKEND.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_BACKEND / ".env", _ROOT / ".env"),
        extra="ignore",
    )

    app_name: str = "SUPERFINANCE"
    environment: str = "development"
    secret_key: str = "dev-only-change-me"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    database_url: str = "sqlite:///./superfinance.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    frontend_origin: str = "http://localhost:5173"
    dev_otp: str = "424242"
    otp_expiry_minutes: int = 10
    storage_dir: str = "./storage"
    max_upload_mb: int = 20
    cookie_secure: bool = False
    # lax = same-site / reverse-proxy; none = cross-site FE↔API (requires Secure)
    cookie_samesite: str = "lax"

    @property
    def is_dev(self) -> bool:
        return self.environment.lower() in {"development", "dev", "local"}

    @property
    def origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def cookie_kwargs(self) -> dict:
        samesite = (self.cookie_samesite or "lax").lower()
        if samesite not in {"lax", "strict", "none"}:
            samesite = "lax"
        secure = bool(self.cookie_secure) or samesite == "none"
        if not self.is_dev and samesite == "none" and not secure:
            raise RuntimeError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true in production.")
        return {"httponly": True, "samesite": samesite, "secure": secure, "path": "/"}


settings = Settings()
