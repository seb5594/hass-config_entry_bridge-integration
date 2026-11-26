"""Config Entry Bridge: lets chosen people use parts of the administrator-only config entry pages."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .access import clean_grants
from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION
from .websocket import BridgeData, async_register_commands


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Load the grants and make the websocket commands answer."""
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    stored = await store.async_load() or {}
    hass.data[DOMAIN] = BridgeData(store=store, grants=clean_grants(stored.get("grants")))
    async_register_commands(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Stop answering. Websocket commands cannot be removed, so they refuse while nothing is loaded."""
    hass.data.pop(DOMAIN, None)
    return True
