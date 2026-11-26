"""Serves the card and tells every browser to load it, so nobody has to add a dashboard resource by hand."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant

from .const import CARD_FILE, DOMAIN, URL_BASE

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent / "frontend"
MARKER = f"{DOMAIN}_frontend_url"


async def async_register_frontend(hass: HomeAssistant, version: str) -> bool:
    """Serve the built card and register it as extra module. Returns False when there is nothing to serve."""
    if hass.data.get(MARKER):
        return True
    card = FRONTEND_DIR / CARD_FILE
    if hass.http is None or not card.is_file():
        _LOGGER.warning("The card file %s is missing; the panel works, but the card cannot be shown", card)
        return False
    url = f"{URL_BASE}/{CARD_FILE}"
    try:
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths([StaticPathConfig(url, str(card), cache_headers=False)])
    except ImportError:  # before Home Assistant 2024.7
        hass.http.register_static_path(url, str(card), cache_headers=False)
    # The version in the address makes browsers fetch a new card after an update.
    versioned = f"{url}?v={version}"
    try:
        from homeassistant.components.frontend import add_extra_js_url

        add_extra_js_url(hass, versioned)
    except (ImportError, KeyError) as err:
        # The frontend is a dependency, so this only happens where it was never set up, such as test cores.
        _LOGGER.warning("The card is served but could not be registered for the browser: %s", err)
        return False
    hass.data[MARKER] = versioned
    return True


def async_unregister_frontend(hass: HomeAssistant) -> None:
    """Stop loading the card. The served file stays until the next restart, which is harmless."""
    if url := hass.data.pop(MARKER, None):
        from homeassistant.components.frontend import remove_extra_js_url

        try:
            remove_extra_js_url(hass, url)
        except KeyError:
            pass
