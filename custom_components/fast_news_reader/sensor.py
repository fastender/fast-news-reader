"""Sensor platform for Fast News Reader.

Each configured feed becomes a Device in HA, with five sensor entities:

- The main count sensor (state = number of entries, attributes = full
  channel + entries list, drop-in compatible with the v0.3 schema and
  unique_id-stable across upgrades).
- `latest_title`, `latest_link`, `latest_image`, `latest_published` -
  convenience sensors so simple Lovelace cards don't need templates.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ATTRIBUTION, DOMAIN
from .coordinator import FastNewsReaderCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up sensor entities for the configured feed."""
    coordinator: FastNewsReaderCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            FastNewsReaderSensor(coordinator, entry),
            LatestTitleSensor(coordinator, entry),
            LatestLinkSensor(coordinator, entry),
            LatestImageSensor(coordinator, entry),
            LatestPublishedSensor(coordinator, entry),
        ]
    )


def _device_info(coordinator: FastNewsReaderCoordinator, entry: ConfigEntry) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=coordinator.feed_name,
        manufacturer="Fast News Reader",
        configuration_url=coordinator.feed_url,
    )


class FastNewsReaderSensor(
    CoordinatorEntity[FastNewsReaderCoordinator], SensorEntity
):
    """Main count sensor, drop-in compatible with v0.3 schema and unique_id."""

    _attr_has_entity_name = False
    _attr_icon = "mdi:rss"
    # Keep `entries` and `channel` out of the recorder. With full <content:encoded>
    # HTML they routinely exceed HA's 16 KB-per-attribute soft limit, which
    # otherwise spams 'state attributes exceed maximum size' warnings and bloats
    # the database. Runtime state still carries them, so the Lovelace card sees
    # them as before.
    _unrecorded_attributes = frozenset({"entries", "channel"})

    def __init__(
        self,
        coordinator: FastNewsReaderCoordinator,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self._attr_name = coordinator.feed_name
        self._attr_unique_id = f"{DOMAIN}_{entry.entry_id}"
        self._attr_attribution = ATTRIBUTION
        self._attr_device_info = _device_info(coordinator, entry)

    @property
    def native_value(self) -> int | None:
        if not self.coordinator.data:
            return None
        return len(self.coordinator.data.get("entries", []))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if not self.coordinator.data:
            return {}
        return {
            "channel": self.coordinator.data.get("channel", {}),
            "entries": self.coordinator.data.get("entries", []),
            "attribution": ATTRIBUTION,
            "friendly_name": self.coordinator.feed_name,
        }


class _LatestSensor(CoordinatorEntity[FastNewsReaderCoordinator], SensorEntity):
    """Shared base for the latest_* convenience sensors, bound to the same Device."""

    _attr_attribution = ATTRIBUTION
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: FastNewsReaderCoordinator,
        entry: ConfigEntry,
        suffix: str,
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{DOMAIN}_{entry.entry_id}_{suffix}"
        self._attr_device_info = _device_info(coordinator, entry)


class LatestTitleSensor(_LatestSensor):
    _attr_icon = "mdi:newspaper-variant-outline"
    _attr_translation_key = "latest_title"

    def __init__(self, coordinator: FastNewsReaderCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "latest_title")

    @property
    def native_value(self) -> str | None:
        latest = self.coordinator.latest_entry
        return latest.get("title") if latest else None


class LatestLinkSensor(_LatestSensor):
    _attr_icon = "mdi:link-variant"
    _attr_translation_key = "latest_link"
    _attr_entity_registry_enabled_default = False  # opt-in, niche, keeps lists clean

    def __init__(self, coordinator: FastNewsReaderCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "latest_link")

    @property
    def native_value(self) -> str | None:
        latest = self.coordinator.latest_entry
        return latest.get("link") if latest else None


class LatestImageSensor(_LatestSensor):
    """Latest image URL, also exposed as entity_picture so cards render the thumbnail."""

    _attr_icon = "mdi:image-outline"
    _attr_translation_key = "latest_image"

    def __init__(self, coordinator: FastNewsReaderCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "latest_image")

    @property
    def native_value(self) -> str | None:
        latest = self.coordinator.latest_entry
        return latest.get("image") if latest else None

    @property
    def entity_picture(self) -> str | None:
        return self.native_value


class LatestPublishedSensor(_LatestSensor):
    _attr_icon = "mdi:clock-outline"
    _attr_translation_key = "latest_published"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, coordinator: FastNewsReaderCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "latest_published")

    @property
    def native_value(self) -> datetime | None:
        latest = self.coordinator.latest_entry
        return latest.get("published_dt") if latest else None
