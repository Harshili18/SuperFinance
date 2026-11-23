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


settings = Settings()
