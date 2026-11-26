"""The websocket commands of the panel.

Everything is decided here, on the server: the caller is looked up from the connection, never taken from
the message. Administrators manage the rules, everybody else only gets what the rules allow.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from homeassistant import data_entry_flow
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.data_entry_flow import FlowManagerIndexView
from homeassistant.helpers.storage import Store

from .compat import vol
from .const import DOMAIN
from .rules import (
    PERSON_ID,
    Store as Rules,
    build_panel,
    capabilities,
    person_of_user,
    policy_of,
    with_hidden,
    with_person,
    without_person,
)

ERR_NOT_LOADED = "not_loaded"
ERR_INVALID = "invalid_rule"
FLOW_FINISHED = (data_entry_flow.FlowResultType.FORM, data_entry_flow.FlowResultType.MENU)


@dataclass
class BridgeData:
    """What the loaded integration keeps in `hass.data`."""

    store: Store
    rules: Rules
    # flow id -> id of the user who started it through the panel; nobody else may continue it
    flows: dict[str, str] = field(default_factory=dict)

    async def async_save(self) -> None:
        await self.store.async_save({"entries": self.rules})


# --- helpers -------------------------------------------------------------------------------------

def _data(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> BridgeData | None:
    data = hass.data.get(DOMAIN)
    if data is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Config Entry Panel is not set up")
    return data


def _entry(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]):
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if entry is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Config entry not found")
    return entry


def _persons(hass: HomeAssistant):
    return [(state.entity_id, state.attributes) for state in hass.states.async_all("person")]


async def _who(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> tuple[str | None, bool] | None:
    """(person, is_admin) of the caller, or of the person an administrator previews. None after an error was sent."""
    if (as_person := msg.get("as_person")) is None:
        return person_of_user(_persons(hass), connection.user.id), connection.user.is_admin
    if not connection.user.is_admin:
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Only administrators can preview")
        return None
    state = hass.states.get(as_person)
    user_id = state.attributes.get("user_id") if state else None
    user = await hass.auth.async_get_user(user_id) if user_id else None
    return as_person, bool(user and user.is_admin)


async def _caps(hass, connection, msg, data: BridgeData) -> tuple[dict[str, bool], str | None] | None:
    if (who := await _who(hass, connection, msg)) is None:
        return None
    person, is_admin = who
    return capabilities(policy_of(data.rules, msg["entry_id"]), person, is_admin=is_admin), person


def _require(hass, connection, msg, action: str):
    """(data, entry) when the caller holds `action` for the entry, else an error has been sent."""
    if (data := _data(hass, connection, msg)) is None or (entry := _entry(hass, connection, msg)) is None:
        return None
    caps = capabilities(policy_of(data.rules, msg["entry_id"]), person_of_user(_persons(hass), connection.user.id),
                        is_admin=connection.user.is_admin)
    if not caps[action]:
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Not allowed")
        return None
    return data, entry


def _gather(hass: HomeAssistant, entry) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """The entry, its devices and the entities of both, in the plain shapes the rules work with."""
    areas = ar.async_get(hass)
    device_registry = dr.async_get(hass)
    devices = []
    for device in device_registry.devices.values():
        if entry.entry_id not in device.config_entries:
            continue
        area = areas.async_get_area(device.area_id) if device.area_id else None
        devices.append({
            "id": device.id, "name": device.name_by_user or device.name or device.id,
            "manufacturer": device.manufacturer, "model": device.model, "sw_version": device.sw_version,
            "hw_version": device.hw_version, "area": area.name if area else None,
            "entry_type": device.entry_type.value if device.entry_type else None,
            "disabled": device.disabled_by is not None,
        })
    device_ids = {device["id"] for device in devices}
    entities = []
    for entity in er.async_get(hass).entities.values():
        if entity.config_entry_id != entry.entry_id and entity.device_id not in device_ids:
            continue
        state = hass.states.get(entity.entity_id)
        category = entity.entity_category
        entities.append({
            "entity_id": entity.entity_id, "device_id": entity.device_id,
            "name": state.name if state else entity.name or entity.original_name or entity.entity_id,
            "entity_category": getattr(category, "value", category), "disabled": entity.disabled_by is not None,
        })
    summary = {
        "entry_id": entry.entry_id, "domain": entry.domain, "title": entry.title, "state": entry.state.value,
        "disabled_by": getattr(entry.disabled_by, "value", entry.disabled_by), "reason": entry.reason,
        "source": entry.source, "pref_disable_polling": entry.pref_disable_polling,
        "pref_disable_new_entities": entry.pref_disable_new_entities, "supports_options": entry.supports_options,
    }
    return summary, devices, entities


def _serialize(hass: HomeAssistant, result: Any) -> dict[str, Any]:
    """The same JSON Home Assistant's own options flow API sends, so the frontend can render it alike."""
    return FlowManagerIndexView(hass.config_entries.options)._prepare_result_json(result)  # noqa: SLF001


# --- everybody -----------------------------------------------------------------------------------

@websocket_api.websocket_command({
    "type": f"{DOMAIN}/capabilities", vol.Required("entry_id"): str, vol.Optional("as_person"): vol.Match(PERSON_ID.pattern)})
@websocket_api.async_response
async def ws_capabilities(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """What the caller may see and do. The card asks this first and disappears when `visible` is false."""
    if (data := _data(hass, connection, msg)) is None or (found := await _caps(hass, connection, msg, data)) is None:
        return
    connection.send_result(msg["id"], found[0])


@websocket_api.websocket_command({
    "type": f"{DOMAIN}/panel", vol.Required("entry_id"): str, vol.Optional("as_person"): vol.Match(PERSON_ID.pattern)})
@websocket_api.async_response
async def ws_panel(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The entry as the caller may see it: header, settings and devices, with hidden entities already left out."""
    if (data := _data(hass, connection, msg)) is None or (found := await _caps(hass, connection, msg, data)) is None:
        return
    caps, person = found
    if not caps["visible"]:
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Not allowed")
        return
    if (entry := _entry(hass, connection, msg)) is None:
        return
    summary, devices, entities = _gather(hass, entry)
    connection.send_result(msg["id"], build_panel(summary, devices, entities, caps, policy_of(data.rules, msg["entry_id"]), person))


@websocket_api.websocket_command({"type": f"{DOMAIN}/reload", vol.Required("entry_id"): str})
@websocket_api.async_response
async def ws_reload(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Reload a config entry for somebody who may."""
    if _require(hass, connection, msg, "reload") is None:
        return
    await hass.config_entries.async_reload(msg["entry_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command({"type": f"{DOMAIN}/options/start", vol.Required("entry_id"): str})
@websocket_api.async_response
async def ws_options_start(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Open the options dialog (the gear) of an entry for somebody who may."""
    if (found := _require(hass, connection, msg, "configure")) is None:
        return
    data, entry = found
    if not entry.supports_options:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_SUPPORTED, "This entry has no options")
        return
    try:
        result = await hass.config_entries.options.async_init(msg["entry_id"])
    except data_entry_flow.UnknownHandler:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_SUPPORTED, "This entry has no options")
        return
    if result["type"] in FLOW_FINISHED:
        data.flows[result["flow_id"]] = connection.user.id
    connection.send_result(msg["id"], _serialize(hass, result))


def _own_flow(data: BridgeData, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> bool:
    if data.flows.get(msg["flow_id"]) == connection.user.id:
        return True
    connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown flow")
    return False


@websocket_api.websocket_command(
    {"type": f"{DOMAIN}/options/step", vol.Required("flow_id"): str, vol.Optional("user_input"): dict})
@websocket_api.async_response
async def ws_options_step(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Continue a flow this user started through the panel."""
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
    if result["type"] not in FLOW_FINISHED:
        data.flows.pop(msg["flow_id"], None)
    connection.send_result(msg["id"], _serialize(hass, result))


@websocket_api.websocket_command({"type": f"{DOMAIN}/options/abort", vol.Required("flow_id"): str})
@callback
def ws_options_abort(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Close a flow this user started through the panel."""
    if (data := _data(hass, connection, msg)) is None or not _own_flow(data, connection, msg):
        return
    data.flows.pop(msg["flow_id"], None)
    try:
        hass.config_entries.options.async_abort(msg["flow_id"])
    except data_entry_flow.UnknownFlow:
        pass
    connection.send_result(msg["id"])


# --- administrators ------------------------------------------------------------------------------

@websocket_api.require_admin
@websocket_api.websocket_command({"type": f"{DOMAIN}/entries"})
@callback
def ws_entries(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The config entries an administrator can build a panel for."""
    connection.send_result(msg["id"], sorted(
        ({"entry_id": e.entry_id, "title": e.title, "domain": e.domain} for e in hass.config_entries.async_entries()
         if e.domain != DOMAIN), key=lambda item: item["title"].casefold()))


@websocket_api.require_admin
@websocket_api.websocket_command({"type": f"{DOMAIN}/people"})
@websocket_api.async_response
async def ws_people(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The persons with the role of their user: administrator, regular user, or no user at all."""
    users = {user.id: user for user in await hass.auth.async_get_users()}
    people = []
    for state in hass.states.async_all("person"):
        user = users.get(state.attributes.get("user_id") or "")
        people.append({
            "person": state.entity_id, "name": state.name, "picture": state.attributes.get("entity_picture"),
            "role": "none" if user is None else "admin" if user.is_admin else "user"})
    connection.send_result(msg["id"], sorted(people, key=lambda item: item["name"].casefold()))


@websocket_api.require_admin
@websocket_api.websocket_command({"type": f"{DOMAIN}/access/get", vol.Required("entry_id"): str})
@callback
def ws_access_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The rules of one entry, and every entity the hiding rules can refer to."""
    if (data := _data(hass, connection, msg)) is None or (entry := _entry(hass, connection, msg)) is None:
        return
    _, devices, entities = _gather(hass, entry)
    connection.send_result(msg["id"], {
        "policy": policy_of(data.rules, msg["entry_id"]),
        "devices": [{"id": d["id"], "name": d["name"]} for d in devices],
        "entities": [{"entity_id": e["entity_id"], "name": e["name"], "device_id": e["device_id"]}
                     for e in entities if not e["disabled"]],
    })


async def _change(hass, connection, msg, change) -> None:
    """Apply `change(rules)`, save, and answer with the new policy; invalid rules become an error."""
    if (data := _data(hass, connection, msg)) is None or _entry(hass, connection, msg) is None:
        return
    try:
        data.rules = change(data.rules)
    except ValueError as err:
        connection.send_error(msg["id"], ERR_INVALID, str(err))
        return
    await data.async_save()
    connection.send_result(msg["id"], policy_of(data.rules, msg["entry_id"]))


_STRINGS = [str]


@websocket_api.require_admin
@websocket_api.websocket_command({
    "type": f"{DOMAIN}/access/person/set", vol.Required("entry_id"): str, vol.Required("person"): str,
    vol.Required("sections"): [vol.In(("settings", "devices"))],
    vol.Optional("configure", default=False): bool, vol.Optional("reload", default=False): bool,
    vol.Optional("hidden_entities", default=list): _STRINGS, vol.Optional("hidden_patterns", default=list): _STRINGS})
@websocket_api.async_response
async def ws_person_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Give one person rights for one entry, or change them."""
    rule = {key: msg[key] for key in ("sections", "configure", "reload", "hidden_entities", "hidden_patterns")}
    await _change(hass, connection, msg, lambda rules: with_person(rules, msg["entry_id"], msg["person"], rule))


@websocket_api.require_admin
@websocket_api.websocket_command({
    "type": f"{DOMAIN}/access/person/remove", vol.Required("entry_id"): str, vol.Required("person"): str})
@websocket_api.async_response
async def ws_person_remove(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Take every right of one person for one entry away."""
    await _change(hass, connection, msg, lambda rules: without_person(rules, msg["entry_id"], msg["person"]))


@websocket_api.require_admin
@websocket_api.websocket_command({
    "type": f"{DOMAIN}/access/hidden/set", vol.Required("entry_id"): str,
    vol.Optional("hidden_entities", default=list): _STRINGS, vol.Optional("hidden_patterns", default=list): _STRINGS})
@websocket_api.async_response
async def ws_hidden_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Replace the entities hidden from everybody who is not an administrator."""
    await _change(hass, connection, msg,
                  lambda rules: with_hidden(rules, msg["entry_id"], msg["hidden_entities"], msg["hidden_patterns"]))


COMMANDS = (
    ws_capabilities, ws_panel, ws_reload, ws_options_start, ws_options_step, ws_options_abort,
    ws_entries, ws_people, ws_access_get, ws_person_set, ws_person_remove, ws_hidden_set,
)


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register once per run; a reloaded entry keeps the commands, which check that they are loaded."""
    marker = f"{DOMAIN}_commands"
    if hass.data.get(marker):
        return
    for command in COMMANDS:
        websocket_api.async_register_command(hass, command)
    hass.data[marker] = True
