"""Config Entry Panel: shows a config entry like Home Assistant's settings page to people who are not administrators."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.loader import async_get_integration

from .api import BridgeData, async_register_commands
from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION
from .frontend import async_register_frontend, async_unregister_frontend
from .rules import clean_store


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Load the access rules, answer websocket commands and serve the card."""
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    stored = await store.async_load() or {}
    hass.data[DOMAIN] = BridgeData(store=store, rules=clean_store(stored))
    async_register_commands(hass)
    integration = await async_get_integration(hass, DOMAIN)
    await async_register_frontend(hass, str(integration.version))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Stop answering. Websocket commands cannot be removed, so they refuse while nothing is loaded."""
    hass.data.pop(DOMAIN, None)
    async_unregister_frontend(hass)
    return True
