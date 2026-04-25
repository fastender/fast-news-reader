"""Sensor platform for Fast News Reader."""
from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ATTRIBUTION, DOMAIN
from .coordinator import FastNewsReaderCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up sensor entity for the configured feed."""
    coordinator: FastNewsReaderCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([FastNewsReaderSensor(coordinator, entry)])


class FastNewsReaderSensor(CoordinatorEntity[FastNewsReaderCoordinator], SensorEntity):
    """Single sensor entity exposing parsed feed data."""

    _attr_has_entity_name = False

    def __init__(
        self,
        coordinator: FastNewsReaderCoordinator,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self._attr_name = coordinator.feed_name
        self._attr_unique_id = f"{DOMAIN}_{entry.entry_id}"
        self._attr_attribution = ATTRIBUTION

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
