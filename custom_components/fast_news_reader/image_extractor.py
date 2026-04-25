"""Multi-source image extractor — the core value of this integration.

Tries every known RSS image source. Closes the gap left by `core feedreader`
and `timmaurice/feedparser`, both of which ignore `<content:encoded>` —
the only image source for Tagesschau and many German feeds.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

_IMG_TAG_RE = re.compile(
    r"""<img[^>]+src=(?:"([^"]+)"|'([^']+)'|([^\s>]+))""",
    re.IGNORECASE,
)
_META_IMAGE_RE = re.compile(
    r"""<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["']"""
    r"""[^>]+content=["']([^"']+)["']""",
    re.IGNORECASE,
)


def extract_image(entry: Any, feed_url: str) -> str | None:
    """Try every known RSS image source. Returns absolute URL or None."""

    # 1. media:thumbnail (Yahoo Media RSS)
    if media_thumbnail := entry.get("media_thumbnail"):
        for item in media_thumbnail:
            if url := item.get("url"):
                return _absolutize(url, feed_url)

    # 2. media:content
    if media_content := entry.get("media_content"):
        for item in media_content:
            if (url := item.get("url")) and (
                item.get("medium") == "image"
                or (item.get("type") or "").startswith("image/")
            ):
                return _absolutize(url, feed_url)

    # 3. enclosures (RSS standard)
    if enclosures := entry.get("enclosures"):
        for enc in enclosures:
            url = enc.get("href") or enc.get("url")
            if url and (enc.get("type") or "").startswith("image/"):
                return _absolutize(url, feed_url)

    # 4. <content:encoded> — the gap timmaurice/feedparser doesn't fill.
    if content := entry.get("content"):
        for item in content:
            if html := (item.get("value") if isinstance(item, dict) else None):
                if img := _scan_html_for_image(html):
                    return _absolutize(img, feed_url)

    # 5. Description / summary HTML
    if summary := entry.get("summary"):
        if img := _scan_html_for_image(summary):
            return _absolutize(img, feed_url)

    return None


def _scan_html_for_image(html: str) -> str | None:
    """Extract first <img src=...> from HTML, handling all quote styles."""
    if not html:
        return None
    if match := _IMG_TAG_RE.search(html):
        return match.group(1) or match.group(2) or match.group(3)
    if meta := _META_IMAGE_RE.search(html):
        return meta.group(1)
    return None


def _absolutize(url: str, base: str) -> str:
    """Make URL absolute relative to base feed URL."""
    return urljoin(base, url)
