from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return int(value)


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv("APP_ENV", "development")
    app_name: str = os.getenv("APP_NAME", "PhishGuard")
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    backend_url: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./phishguard.db")
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me-for-local-development")
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = _int("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 30)
    jwt_refresh_token_expire_days: int = _int("JWT_REFRESH_TOKEN_EXPIRE_DAYS", 7)
    model_storage_path: str = os.getenv("MODEL_STORAGE_PATH", str(Path(__file__).resolve().parents[2] / "ml" / "artifacts"))
    active_model_version: str = os.getenv("ACTIVE_MODEL_VERSION", "")
    max_email_file_size_mb: int = _int("MAX_EMAIL_FILE_SIZE_MB", 10)
    store_email_content: bool = _bool("STORE_EMAIL_CONTENT", True)
    data_retention_days: int = _int("DATA_RETENTION_DAYS", 90)
    rate_limit_analysis_per_minute: int = _int("RATE_LIMIT_ANALYSIS_PER_MINUTE", 10)
    rate_limit_login_per_minute: int = _int("RATE_LIMIT_LOGIN_PER_MINUTE", 5)
    auto_create_tables: bool = _bool("AUTO_CREATE_TABLES", True)
    auto_seed_admin: bool = _bool("AUTO_SEED_ADMIN", True)
    admin_email: str = os.getenv("ADMIN_EMAIL", "")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "")
    admin_full_name: str = os.getenv("ADMIN_FULL_NAME", "PhishGuard Admin")
    enable_url_live_probe: bool = _bool("ENABLE_URL_LIVE_PROBE", True)
    url_probe_timeout_seconds: int = _int("URL_PROBE_TIMEOUT_SECONDS", 4)
    url_probe_max_redirects: int = _int("URL_PROBE_MAX_REDIRECTS", 5)
    url_probe_max_urls_per_analysis: int = _int("URL_PROBE_MAX_URLS_PER_ANALYSIS", 20)
    safe_browsing_api_key: str = os.getenv("SAFE_BROWSING_API_KEY", "")
    virustotal_api_key: str = os.getenv("VIRUSTOTAL_API_KEY", "")
    cors_origins: tuple[str, ...] = tuple(
        dict.fromkeys(
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                ",".join(
                    [
                        os.getenv("FRONTEND_URL", "http://localhost:3000"),
                        "http://127.0.0.1:3000",
                        "http://localhost:3000",
                    ]
                ),
            ).split(",")
            if origin.strip()
        )
    )

    @property
    def normalized_database_url(self) -> str:
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url

    @property
    def max_email_file_size_bytes(self) -> int:
        return self.max_email_file_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
