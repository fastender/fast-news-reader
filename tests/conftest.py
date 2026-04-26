"""Shared test fixtures."""
from __future__ import annotations

from pathlib import Path

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
