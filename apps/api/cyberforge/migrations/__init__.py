"""Programmatic migration helpers (used at startup, by the CLI and by tests)."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

_HERE = Path(__file__).resolve().parent


def _config(url: str | None = None) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(_HERE))
    if url:
        cfg.attributes["url"] = url
    return cfg


def upgrade_to_head(url: str | None = None) -> None:
    command.upgrade(_config(url), "head")
