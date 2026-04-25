"""Tests for the multi-source image extractor."""
from __future__ import annotations

import feedparser
import pytest

from custom_components.fast_news_reader.image_extractor import extract_image

from .conftest import load_fixture


@pytest.mark.parametrize(
    ("fixture", "feed_url", "expected_substring"),
    [
        # Path 4: <content:encoded>, the gap that motivated this component.
        ("tagesschau.xml", "https://www.tagesschau.de/xml/rss2/", "tagesschau.de"),
        # Path 1: media:thumbnail
        ("bbc.xml", "https://feeds.bbci.co.uk/news/rss.xml", "bbci.co.uk"),
        # Path 2: media:content
        ("heise.xml", "https://www.heise.de/rss/heise.rdf", "heise"),
    ],
)
def test_extracts_image_from_known_feeds(
    fixture: str, feed_url: str, expected_substring: str
) -> None:
    """Each fixture should yield at least one entry with an image URL."""
    parsed = feedparser.parse(load_fixture(fixture))
    images = [extract_image(entry, feed_url) for entry in parsed.entries]
    found = [img for img in images if img]
    assert found, f"No images extracted from {fixture}"
    assert any(expected_substring in img for img in found)


def test_returns_none_when_no_image_sources() -> None:
    entry = {"title": "Plain text", "link": "https://example.com/a"}
    assert extract_image(entry, "https://example.com/feed.xml") is None


def test_relative_url_is_absolutized() -> None:
    entry = {
        "content": [{"value": '<p><img src="/img/foo.jpg"></p>'}],
    }
    result = extract_image(entry, "https://example.com/feed.xml")
    assert result == "https://example.com/img/foo.jpg"


def test_relative_url_resolves_against_entry_link() -> None:
    """When the entry has a link, relative URLs should resolve against the article host."""
    entry = {
        "link": "https://articles.example.org/section/post-1",
        "content": [{"value": '<p><img src="../img/foo.jpg"></p>'}],
    }
    result = extract_image(entry, "https://feed-cdn.example.com/feed.xml")
    assert result == "https://articles.example.org/img/foo.jpg"


def test_tracking_pixels_are_skipped() -> None:
    entry = {
        "content": [
            {
                "value": (
                    '<img src="https://www.google-analytics.com/track.gif">'
                    '<img src="https://images.example.com/real.jpg">'
                )
            }
        ],
    }
    result = extract_image(entry, "https://example.com/feed.xml")
    assert result == "https://images.example.com/real.jpg"


def test_one_by_one_pixel_query_is_skipped() -> None:
    entry = {
        "content": [
            {
                "value": (
                    '<img src="https://t.example.com/p?width=1&height=1">'
                    '<img src="https://images.example.com/hero.jpg">'
                )
            }
        ],
    }
    result = extract_image(entry, "https://example.com/feed.xml")
    assert result == "https://images.example.com/hero.jpg"


def test_img_tag_with_attributes_before_src() -> None:
    entry = {
        "content": [
            {"value": '<img class="hero" loading="lazy" src="https://x.test/a.jpg">'}
        ]
    }
    assert (
        extract_image(entry, "https://example.com/feed.xml")
        == "https://x.test/a.jpg"
    )
