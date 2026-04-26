"""Tests for the URL and feed-body validation helpers in config_flow."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import aiohttp
import pytest

from custom_components.fast_news_reader.config_flow import (
    _is_valid_url,
    _looks_like_feed,
    _validate_feed,
)

from .conftest import fake_session

# ---- _is_valid_url -------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/feed.xml",
        "http://example.com/rss",
        "https://sub.example.com:8080/path?x=1",
    ],
)
def test_is_valid_url_accepts_http_and_https(url: str) -> None:
    assert _is_valid_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "",
        "not a url",
        "ftp://example.com/feed.xml",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "//example.com",
    ],
)
def test_is_valid_url_rejects_other_schemes_and_garbage(url: str) -> None:
    assert not _is_valid_url(url)


# ---- _looks_like_feed ----------------------------------------------------


@pytest.mark.parametrize(
    "sample",
    [
        b'<?xml version="1.0" encoding="UTF-8"?><rss>...',
        b"  \n<?xml ...",
        b'<rss version="2.0">',
        b'<feed xmlns="http://www.w3.org/2005/Atom">',
        b'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
        b"<RSS>",
    ],
)
def test_looks_like_feed_accepts_real_feeds(sample: bytes) -> None:
    assert _looks_like_feed(sample)


@pytest.mark.parametrize(
    "sample",
    [
        b"",
        b"   \n   ",
        b"<!DOCTYPE html><html><head><title>Homepage</title>",
        b'<html lang="en">',
        b'{"version": "https://jsonfeed.org/version/1"}',
        b"plain text",
    ],
)
def test_looks_like_feed_rejects_html_and_garbage(sample: bytes) -> None:
    assert not _looks_like_feed(sample)


def test_looks_like_feed_handles_invalid_utf8() -> None:
    # Random bytes should not crash; just return False.
    assert not _looks_like_feed(b"\xff\xfe\x00binary garbage")


# ---- _validate_feed ------------------------------------------------------


async def test_validate_feed_invalid_url_returns_invalid(hass) -> None:
    assert await _validate_feed(hass, "ftp://example.com/x") == "invalid_url"


async def test_validate_feed_client_error_returns_fetch_failed(hass) -> None:
    session = fake_session(raise_on_get=aiohttp.ClientError("boom"))
    with _patch_session(session):
        assert (
            await _validate_feed(hass, "https://example.com/feed.xml")
            == "fetch_failed"
        )


async def test_validate_feed_timeout_returns_timeout(hass) -> None:
    session = fake_session(raise_on_get=TimeoutError())
    with _patch_session(session):
        assert (
            await _validate_feed(hass, "https://example.com/feed.xml") == "timeout"
        )


def _patch_session(session: MagicMock):
    return patch(
        "custom_components.fast_news_reader.config_flow.async_get_clientsession",
        return_value=session,
    )


async def test_validate_feed_html_returns_not_a_feed(hass) -> None:
    session = fake_session(body=b"<!DOCTYPE html><html><body>Welcome</body></html>")
    with _patch_session(session):
        assert await _validate_feed(hass, "https://example.com/") == "not_a_feed"


async def test_validate_feed_real_rss_returns_none(hass) -> None:
    session = fake_session(
        body=(
            b'<?xml version="1.0" encoding="UTF-8"?>'
            b"<rss version=\"2.0\"><channel><title>Test</title></channel></rss>"
        )
    )
    with _patch_session(session):
        assert await _validate_feed(hass, "https://example.com/feed.xml") is None


async def test_validate_feed_atom_returns_none(hass) -> None:
    session = fake_session(
        body=b'<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'
    )
    with _patch_session(session):
        assert await _validate_feed(hass, "https://example.com/atom") is None
