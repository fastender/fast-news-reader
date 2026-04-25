"""DataUpdateCoordinator for Fast News Reader."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

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
)
from .image_extractor import extract_image

_LOGGER = logging.getLogger(__name__)


class FastNewsReaderCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator that fetches and parses an RSS feed."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        self.feed_url: str = entry.data[CONF_FEED_URL]
        self.feed_name: str = entry.data[CONF_NAME]
        self.date_format: str = entry.data.get(CONF_DATE_FORMAT, DEFAULT_DATE_FORMAT)
        self.local_time: bool = entry.data.get(CONF_LOCAL_TIME, DEFAULT_LOCAL_TIME)

        scan_interval_seconds = entry.data.get(
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
        try:
            async with session.get(self.feed_url, timeout=30) as resp:
                resp.raise_for_status()
                content = await resp.read()
        except Exception as err:
            raise UpdateFailed(f"Fetch failed for {self.feed_url}: {err}") from err

        parsed = await self.hass.async_add_executor_job(feedparser.parse, content)

        channel = self._build_channel(parsed)
        entries = await asyncio.gather(
            *(self._build_entry(e) for e in parsed.entries)
        )
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

    async def _build_entry(self, entry: Any) -> dict[str, Any]:
        content_html = None
        if content := entry.get("content"):
            if content and isinstance(content, list):
                first = content[0]
                content_html = first.get("value") if isinstance(first, dict) else None

        image = extract_image(entry, self.feed_url)
        return {
            "id": entry.get("id") or entry.get("guid") or entry.get("link"),
            "title": entry.get("title"),
            "link": entry.get("link"),
            "summary": entry.get("summary"),
            "content": content_html,
            "published": self._format_date(entry),
            "image": image,
            "author": entry.get("author"),
            "category": [t.get("term") for t in entry.get("tags", []) if t.get("term")]
            or None,
        }

    def _format_date(self, entry: Any) -> str | None:
        ts = entry.get("published_parsed") or entry.get("updated_parsed")
        if not ts:
            return entry.get("published") or entry.get("updated")
        dt = datetime(*ts[:6], tzinfo=timezone.utc)
        if self.local_time:
            dt = dt.astimezone()
        return dt.strftime(self.date_format)
