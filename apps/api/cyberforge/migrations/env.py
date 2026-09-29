"""Alembic environment. The database URL comes from CyberForge settings unless overridden."""

from __future__ import annotations

from alembic import context

import cyberforge.models  # noqa: F401  (register tables on Base.metadata)
from cyberforge.config import get_settings
from cyberforge.db import Base, make_engine

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    # Programmatic override (config.attributes) > `alembic -x url=...` > environment settings.
    return (
        config.attributes.get("url")
        or context.get_x_argument(as_dictionary=True).get("url")
        or get_settings().database_url
    )


def run_migrations_offline() -> None:
    url = _url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = make_engine(_url())
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
