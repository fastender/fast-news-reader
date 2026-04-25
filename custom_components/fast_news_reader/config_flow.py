"""Config flow for Fast News Reader."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

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


class FastNewsReaderConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Fast News Reader."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            await self.async_set_unique_id(user_input[CONF_FEED_URL])
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=user_input[CONF_NAME], data=user_input
            )

        schema = vol.Schema(
            {
                vol.Required(CONF_NAME): str,
                vol.Required(CONF_FEED_URL): str,
                vol.Optional(
                    CONF_SCAN_INTERVAL,
                    default=int(DEFAULT_SCAN_INTERVAL.total_seconds()),
                ): int,
                vol.Optional(CONF_DATE_FORMAT, default=DEFAULT_DATE_FORMAT): str,
                vol.Optional(CONF_LOCAL_TIME, default=DEFAULT_LOCAL_TIME): bool,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
