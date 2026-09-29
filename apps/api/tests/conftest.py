"""Test configuration.

Environment variables must be set before `cyberforge` is imported, because settings are cached.
The API is exercised end to end against a throw-away SQLite database seeded from the real repository
content, so tests double as a check that shipped content loads and detects what it claims to.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="cyberforge-tests-"))
os.environ.update(
    {
        "CYBERFORGE_ENV": "test",
        "DATABASE_URL": f"sqlite:///{(_TMP / 'test.sqlite').as_posix()}",
        "CYBERFORGE_DEMO_MODE": "true",
        "CYBERFORGE_SEED_ON_START": "true",
        "CYBERFORGE_AI_PROVIDER": "none",
        "CYBERFORGE_LAB_INGEST_TOKEN": "test-ingest-token",
        "CYBERFORGE_RATE_LIMIT_PER_MINUTE": "100000",
        "CYBERFORGE_EXPENSIVE_RATE_LIMIT_PER_MINUTE": "100000",
    }
)
os.environ.pop("REDIS_URL", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cyberforge.config import get_settings  # noqa: E402
from cyberforge.content.loader import ContentBundle, load_bundle  # noqa: E402
from cyberforge.main import app  # noqa: E402


@pytest.fixture(scope="session")
def bundle() -> ContentBundle:
    return load_bundle(get_settings().content_dir)


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c  # type: ignore[misc]
