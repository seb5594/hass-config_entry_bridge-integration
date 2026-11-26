"""Import shims so one code base runs on the Home Assistant releases it supports."""
from __future__ import annotations

try:  # Home Assistant 2026.x ships its own schema library under this name
    import probatio as vol
except ImportError:  # older releases use voluptuous
    import voluptuous as vol  # type: ignore[no-redef]

__all__ = ["vol"]
