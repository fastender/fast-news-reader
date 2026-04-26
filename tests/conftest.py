"""Shared test fixtures."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Required for pytest-homeassistant-custom-component to load this integration."""
    yield


@pytest.fixture
def fixture_dir() -> Path:
    return FIXTURE_DIR


def load_fixture(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


def fake_session(
    *,
    body: bytes | None = None,
    status: int = 200,
    raise_on_status: Exception | None = None,
    raise_on_get: Exception | None = None,
) -> MagicMock:
    """Build a session whose `get(url)` yields a stub response.

    Bypasses aiohttp's connector entirely so pytest-homeassistant's
    teardown thread checker stays happy. aioclient_mock spawns an
    aiohttp safe-shutdown daemon thread on first use that the verifier
    flags; this helper avoids it.
    """
    if raise_on_get is not None:
        session = MagicMock()
        session.get = MagicMock(side_effect=raise_on_get)
        return session

    resp = MagicMock()
    resp.status = status
    if raise_on_status is not None:
        resp.raise_for_status = MagicMock(side_effect=raise_on_status)
    else:
        resp.raise_for_status = MagicMock()
    content = MagicMock()
    content.read = AsyncMock(return_value=body or b"")
    resp.content = content
    resp.read = AsyncMock(return_value=body or b"")

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=resp)
    cm.__aexit__ = AsyncMock(return_value=False)

    session = MagicMock()
    session.get = MagicMock(return_value=cm)
    return session
