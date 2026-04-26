"""Tests for FastNewsReaderCoordinator."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import aiohttp
import pytest
from homeassistant.helpers.update_coordinator import UpdateFailed
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.fast_news_reader.const import (
    CONF_DATE_FORMAT,
    CONF_FEED_URL,
    CONF_LOCAL_TIME,
    CONF_NAME,
    CONF_SCAN_INTERVAL,
    DOMAIN,
)
from custom_components.fast_news_reader.coordinator import (
    FastNewsReaderCoordinator,
    _derive_favicon,
)

from .conftest import fake_session, load_fixture


def _make_entry(**overrides) -> MockConfigEntry:
    data = {
        CONF_NAME: "Test Feed",
        CONF_FEED_URL: "https://example.com/feed.xml",
        CONF_SCAN_INTERVAL: 600,
        CONF_DATE_FORMAT: "%Y-%m-%d %H:%M",
        CONF_LOCAL_TIME: False,
    }
    data.update(overrides)
    return MockConfigEntry(domain=DOMAIN, data=data)


# ---- _derive_favicon -----------------------------------------------------


def test_derive_favicon_from_channel_link() -> None:
    assert (
        _derive_favicon("https://www.tagesschau.de", None)
        == "https://www.tagesschau.de/favicon.ico"
    )


def test_derive_favicon_falls_back_to_feed_url() -> None:
    assert (
        _derive_favicon(None, "https://feeds.bbci.co.uk/news/rss.xml")
        == "https://feeds.bbci.co.uk/favicon.ico"
    )


def test_derive_favicon_strips_path_and_query() -> None:
    assert (
        _derive_favicon("https://example.com/news/section?utm=x")
        == "https://example.com/favicon.ico"
    )


def test_derive_favicon_returns_none_for_garbage() -> None:
    assert _derive_favicon(None, None) is None
    assert _derive_favicon("not a url", "") is None
    assert _derive_favicon("ftp://example.com/x") is None


# ---- Theme resolution ----------------------------------------------------


def test_theme_used_from_entry_data(hass) -> None:
    """If the entry already stored CONF_THEME (preset setup did this), use
    it directly without consulting the URL lookup."""
    coord = FastNewsReaderCoordinator(hass, _make_entry(theme="tech"))
    assert coord.theme == "tech"
    assert coord.theme_label == "Tech"


def test_theme_reverse_derived_from_feed_url(hass) -> None:
    """Existing entries that pre-date CONF_THEME should still resolve a
    theme by matching their stored URL against the preset list."""
    entry = _make_entry(feed_url="https://www.heise.de/rss/heise-atom.xml")
    coord = FastNewsReaderCoordinator(hass, entry)
    assert coord.theme == "tech"
    assert coord.theme_label == "Tech"


def test_theme_none_for_unknown_url(hass) -> None:
    coord = FastNewsReaderCoordinator(hass, _make_entry())
    assert coord.theme is None
    assert coord.theme_label is None


def test_theme_explicit_empty_overrides_url_fallback(hass) -> None:
    """If the user explicitly picked '(none)' in the custom flow, respect
    that even when the URL would otherwise match a preset (e.g. a custom
    URL that happens to be in the preset list)."""
    entry = _make_entry(
        feed_url="https://www.heise.de/rss/heise-atom.xml",
        theme="",
    )
    coord = FastNewsReaderCoordinator(hass, entry)
    assert coord.theme is None
    assert coord.theme_label is None


# ---- Date helpers --------------------------------------------------------


def test_format_date_returns_string_when_parsed_present(hass) -> None:
    entry = _make_entry()
    coord = FastNewsReaderCoordinator(hass, entry)
    raw = {"published_parsed": (2026, 4, 26, 12, 30, 0, 0, 0, 0)}
    assert coord._format_date(raw) == "2026-04-26 12:30"


def test_format_date_falls_back_to_published_string(hass) -> None:
    entry = _make_entry()
    coord = FastNewsReaderCoordinator(hass, entry)
    raw = {"published": "yesterday"}
    assert coord._format_date(raw) == "yesterday"


def test_format_date_returns_none_when_nothing_known(hass) -> None:
    entry = _make_entry()
    coord = FastNewsReaderCoordinator(hass, entry)
    assert coord._format_date({}) is None


def test_extract_dt_returns_utc_datetime(hass) -> None:
    entry = _make_entry()
    coord = FastNewsReaderCoordinator(hass, entry)
    raw = {"published_parsed": (2026, 4, 26, 12, 30, 0, 0, 0, 0)}
    dt = coord._extract_dt(raw)
    assert dt == datetime(2026, 4, 26, 12, 30, tzinfo=UTC)


def test_extract_dt_returns_none_when_missing(hass) -> None:
    entry = _make_entry()
    coord = FastNewsReaderCoordinator(hass, entry)
    assert coord._extract_dt({}) is None


# ---- _safe_build_entry ---------------------------------------------------


def test_safe_build_entry_swallows_errors(hass, caplog) -> None:
    entry = _make_entry()
    coord = FastNewsReaderCoordinator(hass, entry)

    class Bad:
        def get(self, key, default=None):
            raise RuntimeError("boom")

    result = coord._safe_build_entry(Bad())
    assert result is None
    # debug-level, so caplog at default level shouldn't show it as an error
    assert not any(rec.levelname == "ERROR" for rec in caplog.records)


# ---- Update cycle --------------------------------------------------------


def _patch_session(session):
    return patch(
        "custom_components.fast_news_reader.coordinator.async_get_clientsession",
        return_value=session,
    )


async def test_update_parses_real_fixture(hass) -> None:
    session = fake_session(body=load_fixture("tagesschau.xml"))
    entry = _make_entry(feed_url="https://www.tagesschau.de/xml/rss2/")
    coord = FastNewsReaderCoordinator(hass, entry)
    with _patch_session(session):
        data = await coord._async_update_data()
    assert data["entries"], "fixture should produce at least one entry"
    assert data["channel"]["title"]
    e = data["entries"][0]
    for key in ("title", "link", "summary", "image", "published"):
        assert key in e


async def test_update_raises_on_http_error(hass) -> None:
    # raise_for_status() raises ClientResponseError on 5xx; coordinator catches
    # the broader aiohttp.ClientError, so any subclass works here.
    session = fake_session(status=500, raise_on_status=aiohttp.ClientError("500"))
    coord = FastNewsReaderCoordinator(hass, _make_entry())
    with _patch_session(session), pytest.raises(UpdateFailed):
        await coord._async_update_data()


async def test_update_raises_on_timeout(hass) -> None:
    session = fake_session(raise_on_get=TimeoutError())
    coord = FastNewsReaderCoordinator(hass, _make_entry())
    with _patch_session(session), pytest.raises(UpdateFailed):
        await coord._async_update_data()


async def test_update_raises_on_unparseable_body(hass) -> None:
    session = fake_session(body=b"not xml at all, just garbage")
    coord = FastNewsReaderCoordinator(hass, _make_entry())
    with _patch_session(session), pytest.raises(UpdateFailed):
        await coord._async_update_data()
