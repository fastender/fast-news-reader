"""Config flow for Fast News Reader."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import aiohttp
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

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
    MIN_SCAN_INTERVAL,
)


def _is_valid_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


async def _validate_feed(hass: Any, url: str) -> str | None:
    """HEAD/GET the URL — return error key or None on success."""
    if not _is_valid_url(url):
        return "invalid_url"
    session = async_get_clientsession(hass)
    timeout = aiohttp.ClientTimeout(total=FETCH_TIMEOUT)
    try:
        async with session.get(url, timeout=timeout) as resp:
            if resp.status >= 400:
                return "fetch_failed"
    except aiohttp.ClientError:
        return "fetch_failed"
    except TimeoutError:
        return "timeout"
    return None


class FastNewsReaderConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Fast News Reader."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            url = user_input[CONF_FEED_URL].strip()
            user_input[CONF_FEED_URL] = url

            if user_input[CONF_SCAN_INTERVAL] < MIN_SCAN_INTERVAL:
                errors[CONF_SCAN_INTERVAL] = "interval_too_short"

            if not errors:
                await self.async_set_unique_id(url)
                self._abort_if_unique_id_configured()
                if err := await _validate_feed(self.hass, url):
                    errors[CONF_FEED_URL] = err
                else:
                    return self.async_create_entry(
                        title=user_input[CONF_NAME], data=user_input
                    )

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_NAME,
                    default=(user_input or {}).get(CONF_NAME, ""),
                ): str,
                vol.Required(
                    CONF_FEED_URL,
                    default=(user_input or {}).get(CONF_FEED_URL, ""),
                ): str,
                vol.Optional(
                    CONF_SCAN_INTERVAL,
                    default=int(DEFAULT_SCAN_INTERVAL.total_seconds()),
                ): int,
                vol.Optional(CONF_DATE_FORMAT, default=DEFAULT_DATE_FORMAT): str,
                vol.Optional(CONF_LOCAL_TIME, default=DEFAULT_LOCAL_TIME): bool,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> FastNewsReaderOptionsFlow:
        return FastNewsReaderOptionsFlow(config_entry)


class FastNewsReaderOptionsFlow(config_entries.OptionsFlow):
    """Allow editing scan_interval, date_format, local_time without re-adding."""

    def __init__(self, config_entry: ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            if user_input[CONF_SCAN_INTERVAL] < MIN_SCAN_INTERVAL:
                errors[CONF_SCAN_INTERVAL] = "interval_too_short"
            else:
                return self.async_create_entry(title="", data=user_input)

        current = {**self.config_entry.data, **self.config_entry.options}
        schema = vol.Schema(
            {
                vol.Optional(
                    CONF_SCAN_INTERVAL,
                    default=current.get(
                        CONF_SCAN_INTERVAL,
                        int(DEFAULT_SCAN_INTERVAL.total_seconds()),
                    ),
                ): int,
                vol.Optional(
                    CONF_DATE_FORMAT,
                    default=current.get(CONF_DATE_FORMAT, DEFAULT_DATE_FORMAT),
                ): str,
                vol.Optional(
                    CONF_LOCAL_TIME,
                    default=current.get(CONF_LOCAL_TIME, DEFAULT_LOCAL_TIME),
                ): bool,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
