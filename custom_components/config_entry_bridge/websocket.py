"""The websocket commands of the bridge.

Everything is checked here, on the server: the caller is looked up from the connection, never taken
from the message. Administrators manage the grants, granted people use them.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import probatio
from homeassistant import data_entry_flow
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.data_entry_flow import FlowManagerIndexView
from homeassistant.helpers.storage import Store

from .access import Grants, capabilities_of, person_of_user, with_grant
from .const import DOMAIN, PERSON_PREFIX

ERR_NOT_LOADED = "not_loaded"


@dataclass
class BridgeData:
    """What the loaded integration keeps in `hass.data`."""

    store: Store
    grants: Grants
    # flow id -> id of the user who started it through the bridge; nobody else may continue it
    flows: dict[str, str] | None = None

    def __post_init__(self) -> None:
        self.flows = self.flows if self.flows is not None else {}


def _data(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> BridgeData | None:
    data = hass.data.get(DOMAIN)
    if data is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Config Entry Bridge is not set up")
    return data


def _capabilities(hass: HomeAssistant, connection: websocket_api.ActiveConnection, data: BridgeData, entry_id: str) -> dict[str, bool]:
    user = connection.user
    persons = ((state.entity_id, state.attributes) for state in hass.states.async_all("person"))
    return capabilities_of(data.grants, entry_id, person_of_user(persons, user.id), is_admin=user.is_admin)


def _require(hass, connection, msg, capability: str) -> BridgeData | None:
    """The loaded data when the caller holds `capability` for the entry, else an error has been sent."""
    if (data := _data(hass, connection, msg)) is None:
        return None
    if hass.config_entries.async_get_entry(msg["entry_id"]) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Config entry not found")
        return None
    if not _capabilities(hass, connection, data, msg["entry_id"])[capability]:
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Not allowed")
        return None
    return data


def _serialize(hass: HomeAssistant, result: Any) -> dict[str, Any]:
    """The same JSON Home Assistant's own options flow API sends, so the frontend can render it alike."""
    return FlowManagerIndexView(hass.config_entries.options)._prepare_result_json(result)  # noqa: SLF001


@websocket_api.require_admin
@websocket_api.websocket_command({"type": f"{DOMAIN}/grants/get"})
@callback
def ws_get_grants(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Administrators read every grant."""
    if (data := _data(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], data.grants)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        "type": f"{DOMAIN}/grants/set",
        probatio.Required("entry_id"): str,
        probatio.Required("person"): probatio.All(str, probatio.Match(rf"^{PERSON_PREFIX}[a-z0-9_]+$")),
        probatio.Optional("configure", default=False): bool,
        probatio.Optional("reload", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_set_grants(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Administrators give a person the right to configure and/or reload one config entry."""
    if (data := _data(hass, connection, msg)) is None:
        return
    if hass.config_entries.async_get_entry(msg["entry_id"]) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Config entry not found")
        return
    data.grants = with_grant(data.grants, msg["entry_id"], msg["person"], configure=msg["configure"], reload=msg["reload"])
    await data.store.async_save({"grants": data.grants})
    connection.send_result(msg["id"], data.grants)


@websocket_api.websocket_command({"type": f"{DOMAIN}/capabilities", probatio.Required("entry_id"): str})
@callback
def ws_capabilities(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """What the calling user may do with the entry; the card shows its buttons from this."""
    if (data := _data(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], _capabilities(hass, connection, data, msg["entry_id"]))


@websocket_api.websocket_command({"type": f"{DOMAIN}/reload", probatio.Required("entry_id"): str})
@websocket_api.async_response
async def ws_reload(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Reload a config entry for a person who was allowed to."""
    if _require(hass, connection, msg, "reload") is None:
        return
    await hass.config_entries.async_reload(msg["entry_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command({"type": f"{DOMAIN}/options/start", probatio.Required("entry_id"): str})
@websocket_api.async_response
async def ws_options_start(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Open the options dialog (the gear) of an entry for a person who was allowed to."""
    if (data := _require(hass, connection, msg, "configure")) is None:
        return
    try:
        result = await hass.config_entries.options.async_init(msg["entry_id"])
    except data_entry_flow.UnknownHandler:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_SUPPORTED, "This entry has no options")
        return
    if result["type"] is data_entry_flow.FlowResultType.FORM or result["type"] is data_entry_flow.FlowResultType.MENU:
        data.flows[result["flow_id"]] = connection.user.id
    connection.send_result(msg["id"], _serialize(hass, result))


def _own_flow(data: BridgeData, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> bool:
    if data.flows.get(msg["flow_id"]) == connection.user.id:
        return True
    connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown flow")
    return False


@websocket_api.websocket_command(
    {"type": f"{DOMAIN}/options/step", probatio.Required("flow_id"): str, probatio.Optional("user_input"): dict}
)
@websocket_api.async_response
async def ws_options_step(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Continue a flow this user started through the bridge."""
    if (data := _data(hass, connection, msg)) is None or not _own_flow(data, connection, msg):
        return
    try:
        result = await hass.config_entries.options.async_configure(msg["flow_id"], msg.get("user_input"))
    except data_entry_flow.UnknownFlow:
        data.flows.pop(msg["flow_id"], None)
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown flow")
        return
    except data_entry_flow.InvalidData as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, f"Invalid data: {err.schema_errors}")
        return
    if result["type"] not in (data_entry_flow.FlowResultType.FORM, data_entry_flow.FlowResultType.MENU):
        data.flows.pop(msg["flow_id"], None)
    connection.send_result(msg["id"], _serialize(hass, result))


@websocket_api.websocket_command({"type": f"{DOMAIN}/options/abort", probatio.Required("flow_id"): str})
@callback
def ws_options_abort(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Close a flow this user started through the bridge."""
    if (data := _data(hass, connection, msg)) is None or not _own_flow(data, connection, msg):
        return
    data.flows.pop(msg["flow_id"], None)
    try:
        hass.config_entries.options.async_abort(msg["flow_id"])
    except data_entry_flow.UnknownFlow:
        pass
    connection.send_result(msg["id"])


COMMANDS = (ws_get_grants, ws_set_grants, ws_capabilities, ws_reload, ws_options_start, ws_options_step, ws_options_abort)


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register once per run; a reloaded entry keeps the commands, which check that they are loaded."""
    marker = f"{DOMAIN}_commands"
    if hass.data.get(marker):
        return
    for command in COMMANDS:
        websocket_api.async_register_command(hass, command)
    hass.data[marker] = True
