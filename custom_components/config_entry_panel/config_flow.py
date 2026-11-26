"""One click setup: the panel has nothing to configure, grants are managed in the card."""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow

try:
    from homeassistant.config_entries import ConfigFlowResult
except ImportError:  # before Home Assistant 2024.4
    from homeassistant.data_entry_flow import FlowResult as ConfigFlowResult

from .const import DOMAIN


class ConfigEntryPanelFlow(ConfigFlow, domain=DOMAIN):
    """Confirm and create the single entry."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        # Older releases do not know `single_config_entry` in the manifest.
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Config Entry Panel", data={})
        return self.async_show_form(step_id="user")
