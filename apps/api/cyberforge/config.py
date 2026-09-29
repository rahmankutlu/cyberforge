"""Runtime configuration, validated at import time.

Every setting comes from the environment (see .env.example). In production mode the app
refuses to start with placeholder secrets or a wildcard CORS policy.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_SECRETS = {"", "change-me", "changeme", "cyberforge_local_dev", "cyberforge-lab-token"}


def _find_content_dir() -> Path:
    """Locate the repository content root (labs/, detections/, mitre/, ...)."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "mitre").is_dir() and (parent / "labs").is_dir():
            return parent
    return Path("/app/content")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    env: Literal["development", "test", "production"] = Field(
        "development", validation_alias="CYBERFORGE_ENV"
    )
    database_url: str = Field(
        "sqlite:///./cyberforge.sqlite", validation_alias=AliasChoices("DATABASE_URL")
    )
    redis_url: str | None = Field(None, validation_alias=AliasChoices("REDIS_URL"))
    content_dir: Path = Field(
        default_factory=_find_content_dir, validation_alias="CYBERFORGE_CONTENT_DIR"
    )

    demo_mode: bool = Field(True, validation_alias="CYBERFORGE_DEMO_MODE")
    seed_on_start: bool = Field(True, validation_alias="CYBERFORGE_SEED_ON_START")
    auto_migrate: bool = Field(True, validation_alias="CYBERFORGE_AUTO_MIGRATE")

    cors_origins: str = Field(
        "http://localhost:3000,http://127.0.0.1:3000", validation_alias="CYBERFORGE_CORS_ORIGINS"
    )
    trust_proxy: bool = Field(False, validation_alias="CYBERFORGE_TRUST_PROXY")
    rate_limit_per_minute: int = Field(
        600, ge=10, validation_alias="CYBERFORGE_RATE_LIMIT_PER_MINUTE"
    )
    expensive_rate_limit_per_minute: int = Field(
        30, ge=1, validation_alias="CYBERFORGE_EXPENSIVE_RATE_LIMIT_PER_MINUTE"
    )
    lab_ingest_token: SecretStr = Field(
        SecretStr("cyberforge-lab-token"), validation_alias="CYBERFORGE_LAB_INGEST_TOKEN"
    )

    # --- optional AI analyst -------------------------------------------------
    ai_provider: Literal["none", "openai", "gemini", "ollama"] = Field(
        "none", validation_alias="CYBERFORGE_AI_PROVIDER"
    )
    ai_api_key: SecretStr | None = Field(None, validation_alias="CYBERFORGE_AI_API_KEY")
    ai_base_url: str | None = Field(None, validation_alias="CYBERFORGE_AI_BASE_URL")
    ai_model: str | None = Field(None, validation_alias="CYBERFORGE_AI_MODEL")
    ai_timeout_seconds: float = Field(45.0, gt=0, le=300, validation_alias="CYBERFORGE_AI_TIMEOUT")

    @field_validator("cors_origins")
    @classmethod
    def _no_blank_origins(cls, value: str) -> str:
        return ",".join(o.strip() for o in value.split(",") if o.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o for o in self.cors_origins.split(",") if o]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @model_validator(mode="after")
    def _production_guards(self) -> Settings:
        if self.env != "production":
            return self
        problems: list[str] = []
        if "*" in self.cors_origin_list:
            problems.append("CYBERFORGE_CORS_ORIGINS must be an explicit allowlist, not '*'")
        if self.lab_ingest_token.get_secret_value() in PLACEHOLDER_SECRETS:
            problems.append("CYBERFORGE_LAB_INGEST_TOKEN must be set to a unique random value")
        if "cyberforge_local_dev" in self.database_url:
            problems.append("DATABASE_URL still contains the local-development password")
        if problems:
            raise ValueError("Refusing to start in production: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
