"""Migrations and seeding."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import func, inspect, select

from cyberforge.config import get_settings
from cyberforge.content.loader import load_bundle
from cyberforge.db import Base, make_engine
from cyberforge.migrations import upgrade_to_head
from cyberforge.models import Alert, DetectionRule, Event, Lab, LabRun, MitreTechnique
from cyberforge.services import seed


def test_migrations_create_every_table_in_the_model(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'm.sqlite').as_posix()}"
    upgrade_to_head(url)
    engine = make_engine(url)
    tables = set(inspect(engine).get_table_names())
    assert set(Base.metadata.tables) <= tables
    assert "alembic_version" in tables
    upgrade_to_head(url)  # idempotent


def test_reference_sync_is_idempotent_and_preserves_user_rules(tmp_path: Path) -> None:
    from sqlalchemy.orm import Session

    url = f"sqlite:///{(tmp_path / 's.sqlite').as_posix()}"
    upgrade_to_head(url)
    engine = make_engine(url)
    bundle = load_bundle(get_settings().content_dir)
    with Session(engine) as session:
        seed.sync_reference(session, bundle)
        session.add(
            DetectionRule(
                slug="user-mine", title="Mine", format="sigma", content="title: x", origin="user"
            )
        )
        session.commit()
        first = session.scalar(select(func.count()).select_from(DetectionRule))
        seed.sync_reference(session, bundle)
        session.commit()
        assert session.scalar(select(func.count()).select_from(DetectionRule)) == first
        assert session.scalar(select(DetectionRule.id).where(DetectionRule.slug == "user-mine"))
        assert session.scalar(select(func.count()).select_from(Lab)) == 20
        assert (session.scalar(select(func.count()).select_from(MitreTechnique)) or 0) >= 100


def test_demo_seed_runs_once_and_reset_clears_activity(tmp_path: Path) -> None:
    from sqlalchemy.orm import Session

    url = f"sqlite:///{(tmp_path / 'd.sqlite').as_posix()}"
    upgrade_to_head(url)
    engine = make_engine(url)
    bundle = load_bundle(get_settings().content_dir)
    with Session(engine) as session:
        seed.sync_reference(session, bundle)
        assert seed.needs_demo_seed(session)
        seed.seed_demo(session, bundle)
        session.commit()
        assert not seed.needs_demo_seed(session)
        assert (session.scalar(select(func.count()).select_from(LabRun)) or 0) == 20
        assert (session.scalar(select(func.count()).select_from(Event)) or 0) >= 500
        alerts = session.scalar(select(func.count()).select_from(Alert)) or 0
        assert alerts >= 50
        seed.reset_demo(session)
        assert session.scalar(select(func.count()).select_from(Alert)) == 0
        assert session.scalar(select(func.count()).select_from(Lab)) == 20  # reference data kept


def test_session_commits_before_the_response_is_sent() -> None:
    """A client that reads right after a write must see it: the commit cannot run after the response."""
    from fastapi.params import Depends

    from cyberforge.api.deps import SessionDep

    dependency = next(m for m in SessionDep.__metadata__ if isinstance(m, Depends))
    assert dependency.scope == "function"
