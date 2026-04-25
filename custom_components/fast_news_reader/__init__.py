"""Fast News Reader integration."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .coordinator import FastNewsReaderCoordinator

_LOGGER = logging.getLogger(__name__)
PLATFORMS = ["sensor"]

CARD_FILENAME = "fast-news-reader-card.js"
CARD_URL_PATH = f"/{DOMAIN}/{CARD_FILENAME}"
_CARD_REGISTERED_FLAG = f"{DOMAIN}_card_registered"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Fast News Reader from a config entry."""
    await _async_register_card(hass)

    coordinator = FastNewsReaderCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload entry when options change so new scan_interval/date_format apply."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_register_card(hass: HomeAssistant) -> None:
    """Serve the Lovelace card and add it as an extra frontend module — once per HA boot."""
    if hass.data.get(_CARD_REGISTERED_FLAG):
        return

    card_path = Path(__file__).parent / "www" / CARD_FILENAME
    if not card_path.is_file():
        _LOGGER.warning("Lovelace card file missing at %s", card_path)
        return

    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL_PATH, str(card_path), False)]
    )
    add_extra_js_url(hass, CARD_URL_PATH)
    hass.data[_CARD_REGISTERED_FLAG] = True
    _LOGGER.debug("Registered Lovelace card at %s", CARD_URL_PATH)
