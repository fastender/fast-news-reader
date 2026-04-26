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
    AreaSelector,
    AreaSelectorConfig,
    BooleanSelector,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .const import (
    CATEGORY_ALL,
    CATEGORY_BACK,
    CONF_AREA,
    CONF_CATEGORY,
    CONF_DATE_FORMAT,
    CONF_FEED_URL,
    CONF_GO_BACK,
    CONF_LANGUAGE,
    CONF_LOCAL_TIME,
    CONF_NAME,
    CONF_PRESETS,
    CONF_SCAN_INTERVAL,
    CONF_THEME,
    DEFAULT_DATE_FORMAT,
    DEFAULT_LOCAL_TIME,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    FETCH_TIMEOUT,
    MIN_SCAN_INTERVAL,
)
from .presets import (
    CATEGORY_LABELS,
    LANGUAGE_LABELS,
    Language,
    available_categories_for_language,
    get_preset,
    preset_options_for_language,
)


def _is_valid_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


_FEED_BODY_MARKERS = ("<?xml", "<rss", "<feed", "<rdf:rdf")


def _looks_like_feed(sample: bytes) -> bool:
    """True if the first bytes of a response look like RSS, Atom, or RDF."""
    head = sample[:1024].decode("utf-8", errors="ignore").lstrip().lower()
    if not head:
        return False
    if head.startswith("<?xml"):
        return True
    return any(marker in head for marker in _FEED_BODY_MARKERS)


async def _validate_feed(hass: Any, url: str) -> str | None:
    """Live-fetch the URL, return error key or None on success.

    Reads the first KB of the response body so we can fail fast when a
    user pastes the homepage URL instead of the feed URL.
    """
    if not _is_valid_url(url):
        return "invalid_url"
    session = async_get_clientsession(hass)
    timeout = aiohttp.ClientTimeout(total=FETCH_TIMEOUT)
    try:
        async with session.get(url, timeout=timeout) as resp:
            if resp.status >= 400:
                return "fetch_failed"
            sample = await resp.content.read(1024)
    except aiohttp.ClientError:
        return "fetch_failed"
    except TimeoutError:
        return "timeout"
    if not _looks_like_feed(sample):
        return "not_a_feed"
    return None


class FastNewsReaderConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Setup flow: pick curated presets (with region filter), or enter a custom URL."""

    VERSION = 1

    def __init__(self) -> None:
        self._language: Language | None = None
        self._category: str | None = None  # None == "all"
        self._scan_interval: int = int(DEFAULT_SCAN_INTERVAL.total_seconds())
        self._area_id: str | None = None

    def _existing_urls(self) -> set[str]:
        return {
            entry.data.get(CONF_FEED_URL)
            for entry in self._async_current_entries()
            if entry.data.get(CONF_FEED_URL)
        }

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Initial menu, pick discovery path."""
        return self.async_show_menu(
            step_id="user",
            menu_options=["preset_language", "custom"],
        )

    async def async_step_preset_language(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Region picker, narrows the curated list to one language."""
        if user_input is not None:
            self._language = user_input[CONF_LANGUAGE]
            self._scan_interval = user_input[CONF_SCAN_INTERVAL]
            return await self.async_step_preset_topic()

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

    async def async_step_preset_topic(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Topic picker. Last radio option routes back to the language step."""
        assert self._language is not None
        excluded = self._existing_urls()
        available = available_categories_for_language(self._language, excluded)

        if not available:
            return self.async_abort(reason="no_presets_left")

        if user_input is not None:
            chosen = user_input[CONF_CATEGORY]
            if chosen == CATEGORY_BACK:
                return await self.async_step_preset_language()
            self._category = None if chosen == CATEGORY_ALL else chosen
            return await self.async_step_preset_select()

        options: list[dict[str, str]] = []
        # "Alles" only makes sense if multiple categories exist.
        if len(available) > 1:
            total = sum(n for _, n in available)
            options.append({"value": CATEGORY_ALL, "label": f"Alles ({total})"})
        for cat, count in available:
            options.append(
                {"value": cat, "label": f"{CATEGORY_LABELS[cat]} ({count})"}
            )
        # Back option always last so it doesn't get accidentally clicked first.
        options.append({"value": CATEGORY_BACK, "label": "← Sprache ändern"})

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_CATEGORY, default=options[0]["value"]
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=options,
                        mode=SelectSelectorMode.LIST,
                    )
                ),
            }
        )
        return self.async_show_form(
            step_id="preset_topic",
            data_schema=schema,
            description_placeholders={"language": LANGUAGE_LABELS[self._language]},
        )

    async def async_step_preset_select(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Final multi-select. LIST mode. Already-configured feeds filtered out.

        Adds an optional area picker that's applied to every device created
        in this batch, plus a 'go back' toggle to return to the topic step.
        """
        assert self._language is not None
        errors: dict[str, str] = {}
        excluded_urls = self._existing_urls()
        options = preset_options_for_language(
            self._language, self._category, excluded_urls
        )

        if not options:
            return self.async_abort(reason="no_presets_left")

        if user_input is not None:
            if user_input.get(CONF_GO_BACK):
                return await self.async_step_preset_topic()

            selected_slugs: list[str] = user_input[CONF_PRESETS]
            self._area_id = user_input.get(CONF_AREA) or None

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
                    # Route every feed (including the first) through SOURCE_IMPORT
                    # so HA's per-entry 'Geraet erstellt' dialog never fires. The
                    # area chosen above is propagated via entry data and applied
                    # to each device in async_setup_entry.
                    for preset in presets:
                        self.hass.async_create_task(
                            self.hass.config_entries.flow.async_init(
                                DOMAIN,
                                context={"source": SOURCE_IMPORT},
                                data={
                                    CONF_NAME: preset["name"],
                                    CONF_FEED_URL: preset["url"],
                                    CONF_SCAN_INTERVAL: self._scan_interval,
                                    CONF_AREA: self._area_id,
                                    CONF_THEME: preset["category"],
                                },
                            )
                        )
                    return self.async_abort(
                        reason="setup_started",
                        description_placeholders={"count": str(len(presets))},
                    )

        topic_label = (
            CATEGORY_LABELS[self._category] if self._category else "Alles"
        )
        defaults = user_input or {}
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_PRESETS, default=defaults.get(CONF_PRESETS, [])
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=options,
                        mode=SelectSelectorMode.LIST,
                        multiple=True,
                        sort=False,
                    )
                ),
                vol.Optional(
                    CONF_AREA, default=defaults.get(CONF_AREA)
                ): AreaSelector(AreaSelectorConfig()),
                vol.Optional(CONF_GO_BACK, default=False): BooleanSelector(),
            }
        )
        return self.async_show_form(
            step_id="preset_select",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "language": LANGUAGE_LABELS[self._language],
                "topic": topic_label,
                "available": str(len(options)),
            },
        )

    async def async_step_import(
        self, user_input: dict[str, Any]
    ) -> FlowResult:
        """Programmatic entry creation, used to add the 2nd…Nth preset in a multi-select."""
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
                CONF_AREA: user_input.get(CONF_AREA),
                CONF_THEME: user_input.get(CONF_THEME),
            },
        )

    async def async_step_custom(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Custom feed URL, for everything not in the preset list."""
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

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Edit name + feed URL of an existing entry without removing it.

        HA shows this as a 'Reconfigure' button alongside 'Configure' on the
        integration card. The unique_id is updated to the new URL so duplicate
        detection keeps working after a swap.
        """
        entry = self._get_reconfigure_entry()
        current = {**entry.data, **entry.options}
        errors: dict[str, str] = {}

        if user_input is not None:
            url = user_input[CONF_FEED_URL].strip()
            user_input[CONF_FEED_URL] = url

            if user_input[CONF_SCAN_INTERVAL] < MIN_SCAN_INTERVAL:
                errors[CONF_SCAN_INTERVAL] = "interval_too_short"

            if not errors:
                # Allow URL to stay the same; abort only if it collides with a
                # different entry's unique_id.
                if url != current.get(CONF_FEED_URL):
                    await self.async_set_unique_id(url)
                    self._abort_if_unique_id_mismatch(reason="reconfigure_url_taken")
                if err := await _validate_feed(self.hass, url):
                    errors[CONF_FEED_URL] = err
                else:
                    return self.async_update_reload_and_abort(
                        entry,
                        title=user_input[CONF_NAME],
                        data={**current, **user_input},
                        unique_id=url,
                    )

        defaults = user_input or current
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
                    default=defaults.get(
                        CONF_SCAN_INTERVAL,
                        int(DEFAULT_SCAN_INTERVAL.total_seconds()),
                    ),
                ): int,
            }
        )
        return self.async_show_form(
            step_id="reconfigure", data_schema=schema, errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> FastNewsReaderOptionsFlow:
        # Don't pass config_entry: HA 2025.12+ injects it automatically via
        # the OptionsFlow.config_entry property. Passing it (and storing it on
        # self) raises in current HA.
        return FastNewsReaderOptionsFlow()


class FastNewsReaderOptionsFlow(config_entries.OptionsFlow):
    """Edit scan_interval, date_format, local_time without re-adding.

    No __init__: HA 2025.12+ removed the ability to set self.config_entry
    explicitly (it's now an auto-populated property). Subclasses that still
    do `self.config_entry = config_entry` raise on init in current HA.
    """

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
