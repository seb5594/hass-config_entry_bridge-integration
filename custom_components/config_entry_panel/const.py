"""Constants of the Config Entry Panel."""

DOMAIN = "config_entry_panel"
STORAGE_KEY = f"{DOMAIN}.access"
STORAGE_VERSION = 1

# Where the card is served from, and the file the frontend build writes.
URL_BASE = f"/{DOMAIN}"
CARD_FILE = "config-entry-panel.js"
