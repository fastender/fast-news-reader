"""Multi-source image extractor — the core value of this integration.

Tries every known RSS image source. Closes the gap left by `core feedreader`
and `timmaurice/feedparser`, both of which ignore `<content:encoded>` —
the only image source for Tagesschau and many German feeds.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin, urlparse

_IMG_TAG_RE = re.compile(
    r"""<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))""",
    re.IGNORECASE,
)
_META_IMAGE_RE = re.compile(
    r"""<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["']"""
    r"""[^>]+content=["']([^"']+)["']""",
    re.IGNORECASE,
)

# Tracking pixels and 1x1 spacers we never want to surface as the article image.
_TRACKING_HOST_FRAGMENTS = (
    "doubleclick.net",
    "googleadservices.com",
    "google-analytics.com",
    "googletagmanager.com",
    "scorecardresearch.com",
    "facebook.com/tr",
    "ivw-online.de",
)
_TRACKING_PATH_FRAGMENTS = ("/pixel", "/beacon", "/track", "/spacer")


def extract_image(entry: Any, feed_url: str) -> str | None:
    """Try every known RSS image source. Returns absolute URL or None."""
    base = entry.get("link") or feed_url

    # 1. media:thumbnail (Yahoo Media RSS)
    if media_thumbnail := entry.get("media_thumbnail"):
        for item in media_thumbnail:
            if (url := item.get("url")) and not _is_tracking_pixel(url):
                return _absolutize(url, base)

    # 2. media:content
    if media_content := entry.get("media_content"):
        for item in media_content:
            url = item.get("url")
            is_image = (
                item.get("medium") == "image"
                or (item.get("type") or "").startswith("image/")
            )
            if url and is_image and not _is_tracking_pixel(url):
                return _absolutize(url, base)

    # 3. enclosures (RSS standard)
    if enclosures := entry.get("enclosures"):
        for enc in enclosures:
            url = enc.get("href") or enc.get("url")
            if (
                url
                and (enc.get("type") or "").startswith("image/")
                and not _is_tracking_pixel(url)
            ):
                return _absolutize(url, base)

    # 4. <content:encoded> — the gap timmaurice/feedparser doesn't fill.
    if content := entry.get("content"):
        for item in content:
            html = item.get("value") if isinstance(item, dict) else None
            if img := _scan_html_for_image(html):
                return _absolutize(img, base)

    # 5. Description / summary HTML
    if (summary := entry.get("summary")) and (img := _scan_html_for_image(summary)):
        return _absolutize(img, base)

    return None


def _scan_html_for_image(html: str | None) -> str | None:
    """Extract first non-tracking <img src=...> from HTML."""
    if not html:
        return None
    for match in _IMG_TAG_RE.finditer(html):
        url = match.group(1) or match.group(2) or match.group(3)
        if url and not _is_tracking_pixel(url):
            return url
    if meta := _META_IMAGE_RE.search(html):
        return meta.group(1)
    return None


def _absolutize(url: str, base: str | None) -> str:
    """Make URL absolute, preferring the entry's article link as base."""
    if not base:
        return url
    return urljoin(base, url)


def _is_tracking_pixel(url: str) -> bool:
    """Best-effort filter for 1x1 trackers and known beacon hosts."""
    lowered = url.lower()
    if any(frag in lowered for frag in _TRACKING_HOST_FRAGMENTS):
        return True
    parsed = urlparse(lowered)
    path = parsed.path
    if any(frag in path for frag in _TRACKING_PATH_FRAGMENTS):
        return True
    # 1x1 spacer hints in query string or filename
    return "width=1" in parsed.query and "height=1" in parsed.query
