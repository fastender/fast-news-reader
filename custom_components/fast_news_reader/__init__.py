"""Fast News Reader integration."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.typing import ConfigType

from .const import CONF_AREA, DOMAIN
from .coordinator import FastNewsReaderCoordinator

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_LOGGER = logging.getLogger(__name__)
PLATFORMS = ["sensor"]

CARD_FILENAME = "fast-news-reader-card.js"
_CARD_REGISTERED_FLAG = f"{DOMAIN}_card_registered"


def _read_manifest_version() -> str:
    manifest_path = Path(__file__).parent / "manifest.json"
    try:
        return json.loads(manifest_path.read_text()).get("version", "0")
    except (OSError, ValueError) as err:
        _LOGGER.warning(
            "Could not read version from %s (%s); falling back to 0. The "
            "Lovelace card URL will not bust caches until this is fixed.",
            manifest_path,
            err,
        )
        return "0"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Run once at HA startup, before any config entries are loaded.

    Registering the Lovelace card here means it's available even if every
    feed entry fails to fetch. add_extra_js_url has to be called before the
    frontend serves its first page for the script to appear in the global
    customCards list, so doing it from setup_entry is too late on a fresh boot.
    """
    await _async_register_card(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Fast News Reader from a config entry."""
    coordinator = FastNewsReaderCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _apply_initial_area(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


def _apply_initial_area(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """One-shot: assign the area chosen during setup to this entry's device.

    Only fires the first time we see the area_id in entry.data; afterwards we
    clear it so manual area changes by the user aren't overwritten on reload.
    """
    area_id = entry.data.get(CONF_AREA)
    if not area_id:
        return

    registry = dr.async_get(hass)
    device = registry.async_get_device(identifiers={(DOMAIN, entry.entry_id)})
    if device is not None and device.area_id != area_id:
        registry.async_update_device(device.id, area_id=area_id)

    # Strip the marker so subsequent reloads don't re-apply the area.
    new_data = {k: v for k, v in entry.data.items() if k != CONF_AREA}
    hass.config_entries.async_update_entry(entry, data=new_data)


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
    """Serve the Lovelace card and add it as an extra frontend module, once per HA boot.

    The URL contains the integration version as a path segment, so each
    release is served under a completely different path. Browsers and
    service workers can't possibly hit a cached copy from the previous
    version - the URL is new.
    """
    if hass.data.get(_CARD_REGISTERED_FLAG):
        return

    card_path = Path(__file__).parent / "www" / CARD_FILENAME
    if not card_path.is_file():
        _LOGGER.warning("Lovelace card file missing at %s", card_path)
        return

    version = _read_manifest_version()
    versioned_url = f"/{DOMAIN}/{version}/{CARD_FILENAME}"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(versioned_url, str(card_path), False)]
    )
    add_extra_js_url(hass, versioned_url)
    hass.data[_CARD_REGISTERED_FLAG] = True
    _LOGGER.info("Registered Lovelace card at %s", versioned_url)
