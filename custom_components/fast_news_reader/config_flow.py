"""Config flow for Fast News Reader."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import aiohttp
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .const import (
    CONF_DATE_FORMAT,
    CONF_FEED_URL,
    CONF_LANGUAGE,
    CONF_LOCAL_TIME,
    CONF_NAME,
    CONF_PRESETS,
    CONF_SCAN_INTERVAL,
    DEFAULT_DATE_FORMAT,
    DEFAULT_LOCAL_TIME,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    FETCH_TIMEOUT,
    MIN_SCAN_INTERVAL,
)
from .presets import (
    LANGUAGE_LABELS,
    Language,
    get_preset,
    preset_options_for_language,
)


def _is_valid_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


async def _validate_feed(hass: Any, url: str) -> str | None:
    """Live-fetch the URL — return error key or None on success."""
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
    """Setup flow: pick curated presets (with region filter), or enter a custom URL."""

    VERSION = 1

    def __init__(self) -> None:
        self._language: Language | None = None
        self._scan_interval: int = int(DEFAULT_SCAN_INTERVAL.total_seconds())

    def _existing_urls(self) -> set[str]:
        return {
            entry.data.get(CONF_FEED_URL)
            for entry in self._async_current_entries()
            if entry.data.get(CONF_FEED_URL)
        }

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Initial menu — pick discovery path."""
        return self.async_show_menu(
            step_id="user",
            menu_options=["preset_language", "custom"],
        )

    async def async_step_preset_language(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Region picker — narrows the curated list to one language."""
        if user_input is not None:
            self._language = user_input[CONF_LANGUAGE]
            self._scan_interval = user_input[CONF_SCAN_INTERVAL]
            return await self.async_step_preset_select()

        schema = vol.Schema(
            {
                vol.Required(CONF_LANGUAGE, default="de"): SelectSelector(
                    SelectSelectorConfig(
                        options=[
                            {"value": code, "label": label}
                            for code, label in LANGUAGE_LABELS.items()
                        ],
                        mode=SelectSelectorMode.LIST,
                    )
                ),
                vol.Optional(
                    CONF_SCAN_INTERVAL,
                    default=int(DEFAULT_SCAN_INTERVAL.total_seconds()),
                ): int,
            }
        )
        return self.async_show_form(
            step_id="preset_language", data_schema=schema
        )

    async def async_step_preset_select(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Multi-select dropdown — already-configured feeds are filtered out."""
        assert self._language is not None
        errors: dict[str, str] = {}
        excluded_urls = self._existing_urls()
        options = preset_options_for_language(self._language, excluded_urls)

        if not options:
            return self.async_abort(reason="no_presets_left")

        if user_input is not None:
            selected_slugs: list[str] = user_input[CONF_PRESETS]
            if self._scan_interval < MIN_SCAN_INTERVAL:
                errors[CONF_SCAN_INTERVAL] = "interval_too_short"
            elif not selected_slugs:
                errors[CONF_PRESETS] = "no_selection"

            if not errors:
                # Resolve presets, drop any unknown slugs defensively.
                presets = [p for slug in selected_slugs if (p := get_preset(slug))]
                if not presets:
                    errors[CONF_PRESETS] = "unknown_preset"
                else:
                    # Schedule the rest as background imports — one ConfigEntry per feed.
                    for preset in presets[1:]:
                        self.hass.async_create_task(
                            self.hass.config_entries.flow.async_init(
                                DOMAIN,
                                context={"source": SOURCE_IMPORT},
                                data={
                                    CONF_NAME: preset["name"],
                                    CONF_FEED_URL: preset["url"],
                                    CONF_SCAN_INTERVAL: self._scan_interval,
                                },
                            )
                        )

                    # The first preset becomes the visible flow result.
                    first = presets[0]
                    await self.async_set_unique_id(first["url"])
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(
                        title=first["name"],
                        data={
                            CONF_NAME: first["name"],
                            CONF_FEED_URL: first["url"],
                            CONF_SCAN_INTERVAL: self._scan_interval,
                            CONF_DATE_FORMAT: DEFAULT_DATE_FORMAT,
                            CONF_LOCAL_TIME: DEFAULT_LOCAL_TIME,
                        },
                    )

        schema = vol.Schema(
            {
                vol.Required(CONF_PRESETS, default=[]): SelectSelector(
                    SelectSelectorConfig(
                        options=options,
                        mode=SelectSelectorMode.DROPDOWN,
                        multiple=True,
                        sort=False,
                    )
                ),
            }
        )
        return self.async_show_form(
            step_id="preset_select",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "language": LANGUAGE_LABELS[self._language],
                "available": str(len(options)),
            },
        )

    async def async_step_import(
        self, user_input: dict[str, Any]
    ) -> FlowResult:
        """Programmatic entry creation — used to add the 2nd…Nth preset in a multi-select."""
        url = user_input[CONF_FEED_URL]
        await self.async_set_unique_id(url)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(
            title=user_input[CONF_NAME],
            data={
                CONF_NAME: user_input[CONF_NAME],
                CONF_FEED_URL: url,
                CONF_SCAN_INTERVAL: user_input[CONF_SCAN_INTERVAL],
                CONF_DATE_FORMAT: DEFAULT_DATE_FORMAT,
                CONF_LOCAL_TIME: DEFAULT_LOCAL_TIME,
            },
        )

    async def async_step_custom(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Custom feed URL — for everything not in the preset list."""
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

        defaults = user_input or {}
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_NAME,
                    default=defaults.get(CONF_NAME, ""),
                ): str,
                vol.Required(
                    CONF_FEED_URL,
                    default=defaults.get(CONF_FEED_URL, ""),
                ): str,
                vol.Optional(
                    CONF_SCAN_INTERVAL,
                    default=int(DEFAULT_SCAN_INTERVAL.total_seconds()),
                ): int,
                vol.Optional(CONF_DATE_FORMAT, default=DEFAULT_DATE_FORMAT): str,
                vol.Optional(CONF_LOCAL_TIME, default=DEFAULT_LOCAL_TIME): bool,
            }
        )
        return self.async_show_form(
            step_id="custom", data_schema=schema, errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> FastNewsReaderOptionsFlow:
        return FastNewsReaderOptionsFlow(config_entry)


class FastNewsReaderOptionsFlow(config_entries.OptionsFlow):
    """Edit scan_interval, date_format, local_time without re-adding."""

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
