"""DataUpdateCoordinator for Fast News Reader."""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import aiohttp
import feedparser
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_DATE_FORMAT,
    CONF_FEED_URL,
    CONF_LOCAL_TIME,
    CONF_NAME,
    CONF_SCAN_INTERVAL,
    DEFAULT_DATE_FORMAT,
    DEFAULT_LOCAL_TIME,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    FETCH_TIMEOUT,
)
from .image_extractor import extract_image

_LOGGER = logging.getLogger(__name__)


class FastNewsReaderCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator that fetches and parses an RSS feed."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        merged = {**entry.data, **entry.options}
        self.feed_url: str = merged[CONF_FEED_URL]
        self.feed_name: str = merged[CONF_NAME]
        self.date_format: str = merged.get(CONF_DATE_FORMAT, DEFAULT_DATE_FORMAT)
        self.local_time: bool = merged.get(CONF_LOCAL_TIME, DEFAULT_LOCAL_TIME)

        scan_interval_seconds = merged.get(
            CONF_SCAN_INTERVAL, int(DEFAULT_SCAN_INTERVAL.total_seconds())
        )
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_{self.feed_name}",
            update_interval=timedelta(seconds=scan_interval_seconds),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        session = async_get_clientsession(self.hass)
        timeout = aiohttp.ClientTimeout(total=FETCH_TIMEOUT)
        try:
            async with session.get(self.feed_url, timeout=timeout) as resp:
                resp.raise_for_status()
                content = await resp.read()
        except aiohttp.ClientError as err:
            raise UpdateFailed(f"Fetch failed for {self.feed_url}: {err}") from err
        except TimeoutError as err:
            raise UpdateFailed(f"Timeout fetching {self.feed_url}") from err

        parsed = await self.hass.async_add_executor_job(feedparser.parse, content)

        if parsed.get("bozo") and not parsed.entries:
            exc = parsed.get("bozo_exception")
            raise UpdateFailed(f"Could not parse feed {self.feed_url}: {exc}")

        channel = self._build_channel(parsed)
        entries = [e for e in (self._safe_build_entry(raw) for raw in parsed.entries) if e]
        return {"channel": channel, "entries": entries}

    def _build_channel(self, parsed: Any) -> dict[str, Any]:
        feed = parsed.feed if hasattr(parsed, "feed") else {}
        image_url = None
        if image := feed.get("image"):
            image_url = image.get("href") or image.get("url")
        return {
            "title": feed.get("title", self.feed_name),
            "link": feed.get("link"),
            "description": feed.get("subtitle") or feed.get("description"),
            "image": image_url,
            "language": feed.get("language"),
        }

    def _safe_build_entry(self, entry: Any) -> dict[str, Any] | None:
        """Build entry dict, swallowing per-entry errors so one bad item doesn't kill the update.

        Logged at debug level because a feed can publish many malformed entries
        in a row and we already drop them silently; users only need to see this
        when actively troubleshooting a specific feed.
        """
        try:
            return self._build_entry(entry)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug(
                "Skipping malformed entry in feed %s: %s", self.feed_url, err
            )
            return None

    def _build_entry(self, entry: Any) -> dict[str, Any]:
        content_html = None
        if (content := entry.get("content")) and isinstance(content, list):
            first = content[0]
            content_html = first.get("value") if isinstance(first, dict) else None

        categories = [t.get("term") for t in entry.get("tags") or [] if t.get("term")]
        return {
            "id": entry.get("id") or entry.get("guid") or entry.get("link"),
            "title": entry.get("title"),
            "link": entry.get("link"),
            "summary": entry.get("summary"),
            "content": content_html,
            "published": self._format_date(entry),
            "published_dt": self._extract_dt(entry),
            "image": extract_image(entry, self.feed_url),
            "author": entry.get("author"),
            "category": categories or None,
        }

    def _extract_dt(self, entry: Any) -> datetime | None:
        ts = entry.get("published_parsed") or entry.get("updated_parsed")
        if not ts:
            return None
        return datetime(*ts[:6], tzinfo=UTC)

    @property
    def latest_entry(self) -> dict[str, Any] | None:
        """Newest entry, or None if the feed is empty / not yet fetched."""
        if not self.data:
            return None
        entries = self.data.get("entries") or []
        return entries[0] if entries else None

    def _format_date(self, entry: Any) -> str | None:
        ts = entry.get("published_parsed") or entry.get("updated_parsed")
        if not ts:
            return entry.get("published") or entry.get("updated")
        dt = datetime(*ts[:6], tzinfo=UTC)
        if self.local_time:
            dt = dt.astimezone()
        return dt.strftime(self.date_format)
