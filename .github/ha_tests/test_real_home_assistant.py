"""The panel inside a genuine Home Assistant core: registries, permissions and options flows for real.

They need Home Assistant and pytest-homeassistant-custom-component. The shared
engine installs both for every release the Compatibility workflow lists; to run them
locally: python .engine/.scripts/ha_matrix.py run 2026.9.4
"""

from pathlib import Path

import pytest

pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant import config_entries  # noqa: E402
from homeassistant.components import http, websocket_api  # noqa: E402
from homeassistant.config_entries import ConfigEntryState  # noqa: E402
from homeassistant.const import EntityCategory  # noqa: E402
from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.helpers import device_registry as dr  # noqa: E402
from homeassistant.helpers import entity_registry as er  # noqa: E402
from pytest_homeassistant_custom_component.common import (  # noqa: E402
    MockConfigEntry,
    MockModule,
    MockPlatform,
    mock_config_flow,
    mock_integration,
    mock_platform,
)

try:
    import probatio as vol  # noqa: E402
except ImportError:  # older Home Assistant releases
    import voluptuous as vol  # type: ignore[no-redef]  # noqa: E402

COMPONENT = next((Path(__file__).resolve().parents[2] / "custom_components").iterdir())
DOMAIN = COMPONENT.name
FULL = {"sections": ["settings", "devices"], "configure": True, "reload": True}


# --- helpers -------------------------------------------------------------------------------------

async def _set_up(hass: HomeAssistant) -> MockConfigEntry:
    # The shared plugin counts the declared dependencies as loaded without setting them up. The websocket
    # test client needs a real HTTP server and the websocket API view, so set those up by hand.
    assert await http.async_setup(hass, {})
    assert await websocket_api.async_setup(hass, {})
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _client_for(hass, hass_ws_client, user):
    """A websocket client logged in as `user`."""
    refresh_token = await hass.auth.async_create_refresh_token(user, "https://example.test")
    return await hass_ws_client(hass, hass.auth.async_create_access_token(refresh_token))


async def _call(client, command, **payload):
    await client.send_json_auto_id({"type": f"{DOMAIN}/{command}", **payload})
    return await client.receive_json()


def _person(hass: HomeAssistant, user, name="anna") -> str:
    """A person entity linked to `user`, which is how the panel finds who is calling."""
    entity_id = f"person.{name}"
    hass.states.async_set(entity_id, "home", {"user_id": user.id, "friendly_name": name.title()})
    return entity_id


def _target(hass: HomeAssistant) -> MockConfigEntry:
    """A config entry with two devices and a handful of entities, the thing the panel shows."""
    target = MockConfigEntry(domain="test_target", title="Target", state=ConfigEntryState.LOADED)
    target.add_to_hass(hass)
    devices = dr.async_get(hass)
    lamp = devices.async_get_or_create(config_entry_id=target.entry_id, identifiers={("test_target", "lamp")},
                                       name="Desk Lamp", manufacturer="Acme", model="L1", sw_version="1.2")
    hub = devices.async_get_or_create(config_entry_id=target.entry_id, identifiers={("test_target", "hub")},
                                      name="Hub", manufacturer="Acme", model="H1", entry_type=dr.DeviceEntryType.SERVICE)
    registry = er.async_get(hass)

    def add(domain, uid, device=None, category=None, name=None):
        return registry.async_get_or_create(
            domain, "test_target", uid, config_entry=target, device_id=device.id if device else None,
            entity_category=category, original_name=name or uid).entity_id

    ids = {
        "lamp": add("light", "lamp", lamp, name="Lamp"),
        "power": add("sensor", "power", lamp, name="Power"),
        "rssi": add("sensor", "rssi", lamp, EntityCategory.DIAGNOSTIC, "Signal strength"),
        "uptime": add("sensor", "uptime", hub, EntityCategory.DIAGNOSTIC, "Uptime"),
        "orphan": add("sensor", "orphan", None, name="Orphan"),
    }
    return target, ids


def _shown(panel) -> list[str]:
    return [e["entity_id"] for d in panel["devices"] for g in d["groups"] for e in g["entities"]]


# --- setup ---------------------------------------------------------------------------------------

async def test_user_flow_creates_the_single_entry_and_refuses_a_second(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "form"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert again["type"] == "abort"


async def test_entry_loads_and_unloads(hass):
    entry = await _set_up(hass)
    assert entry.state is ConfigEntryState.LOADED
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED


async def test_while_not_loaded_every_command_refuses(hass, hass_ws_client):
    entry = await _set_up(hass)
    target, _ = _target(hass)
    await hass.config_entries.async_unload(entry.entry_id)
    response = await _call(await hass_ws_client(hass), "capabilities", entry_id=target.entry_id)
    assert not response["success"] and response["error"]["code"] == "not_loaded"


async def test_the_card_is_served_and_registered_for_every_browser(hass, hass_client, tmp_path, monkeypatch):
    from custom_components import __name__ as _  # noqa: F401  (the component package must be importable)
    import importlib

    frontend = importlib.import_module(f"custom_components.{DOMAIN}.frontend")
    (tmp_path / "config-entry-panel.js").write_text("console.log('card')")
    monkeypatch.setattr(frontend, "FRONTEND_DIR", tmp_path)
    registered = []
    monkeypatch.setattr("homeassistant.components.frontend.add_extra_js_url", lambda _hass, url: registered.append(url))
    await _set_up(hass)
    assert registered and registered[0].startswith(f"/{DOMAIN}/config-entry-panel.js?v=")
    response = await (await hass_client()).get(f"/{DOMAIN}/config-entry-panel.js")
    assert response.status == 200 and "console.log" in await response.text()


async def test_a_frontend_that_was_never_set_up_does_not_break_the_setup(hass, tmp_path, monkeypatch, caplog):
    import importlib

    (tmp_path / "config-entry-panel.js").write_text("x")
    monkeypatch.setattr(importlib.import_module(f"custom_components.{DOMAIN}.frontend"), "FRONTEND_DIR", tmp_path)

    def refuse(_hass, _url):
        raise KeyError("frontend_extra_module_url")

    monkeypatch.setattr("homeassistant.components.frontend.add_extra_js_url", refuse)
    entry = await _set_up(hass)
    assert entry.state is ConfigEntryState.LOADED
    assert "could not be registered" in caplog.text


async def test_a_missing_card_file_only_logs_a_warning(hass, tmp_path, monkeypatch, caplog):
    import importlib

    monkeypatch.setattr(importlib.import_module(f"custom_components.{DOMAIN}.frontend"), "FRONTEND_DIR", tmp_path)
    entry = await _set_up(hass)
    assert entry.state is ConfigEntryState.LOADED
    assert "card file" in caplog.text


# --- who may do what -----------------------------------------------------------------------------

async def test_only_administrators_manage_the_rules(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    target, _ = _target(hass)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    for command, payload in (
        ("access/person/set", {"person": "person.anna", **FULL}),
        ("access/person/remove", {"person": "person.anna"}),
        ("access/hidden/set", {"hidden_patterns": ["x"]}),
        ("access/get", {}),
    ):
        response = await _call(user, command, entry_id=target.entry_id, **payload)
        assert not response["success"] and response["error"]["code"] == "unauthorized", command
    for command in ("entries", "people"):
        assert (await _call(user, command))["error"]["code"] == "unauthorized"


async def test_rules_are_stored_read_back_and_removed(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    target, _ = _target(hass)
    person = _person(hass, hass_read_only_user)
    admin = await hass_ws_client(hass)
    set_ = await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, sections=["devices"], reload=True)
    assert set_["success"] and set_["result"]["people"][person]["reload"] is True
    got = await _call(admin, "access/get", entry_id=target.entry_id)
    assert got["result"]["policy"]["people"][person]["sections"] == ["devices"]
    assert {d["name"] for d in got["result"]["devices"]} == {"Desk Lamp", "Hub"}
    gone = await _call(admin, "access/person/remove", entry_id=target.entry_id, person=person)
    assert gone["result"]["people"] == {}


async def test_invalid_rules_are_refused_with_a_reason(hass, hass_ws_client):
    await _set_up(hass)
    target, _ = _target(hass)
    admin = await hass_ws_client(hass)
    for payload, command in (
        ({"person": "light.x", "sections": ["devices"]}, "access/person/set"),
        ({"person": "person.a", "sections": []}, "access/person/set"),
        ({"person": "person.a", "sections": ["devices"], "hidden_patterns": ["(a+)+"]}, "access/person/set"),
        ({"hidden_entities": ["Not An Id"]}, "access/hidden/set"),
        ({"hidden_patterns": ["("]}, "access/hidden/set"),
    ):
        response = await _call(admin, command, entry_id=target.entry_id, **payload)
        assert not response["success"] and response["error"]["code"] == "invalid_rule", payload


async def test_rules_for_a_missing_entry_are_refused(hass, hass_ws_client):
    await _set_up(hass)
    admin = await hass_ws_client(hass)
    response = await _call(admin, "access/person/set", entry_id="nope", person="person.a", sections=["devices"])
    assert response["error"]["code"] == "not_found"


async def test_rules_survive_a_restart_of_the_integration(hass, hass_ws_client, hass_read_only_user):
    entry = await _set_up(hass)
    target, _ = _target(hass)
    person = _person(hass, hass_read_only_user)
    admin = await hass_ws_client(hass)
    await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, **FULL)
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    got = await _call(admin, "access/get", entry_id=target.entry_id)
    assert got["result"]["policy"]["people"][person]["configure"] is True


async def test_people_come_with_their_role(hass, hass_ws_client, hass_read_only_user, hass_admin_user):
    await _set_up(hass)
    _person(hass, hass_read_only_user, "anna")
    _person(hass, hass_admin_user, "root")
    hass.states.async_set("person.ghost", "home", {"friendly_name": "Ghost"})
    people = {p["person"]: p["role"] for p in (await _call(await hass_ws_client(hass), "people"))["result"]}
    assert people == {"person.anna": "user", "person.root": "admin", "person.ghost": "none"}


# --- the panel -----------------------------------------------------------------------------------

async def test_an_unlisted_user_does_not_see_the_card(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    target, _ = _target(hass)
    _person(hass, hass_read_only_user)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    caps = (await _call(user, "capabilities", entry_id=target.entry_id))["result"]
    assert caps["visible"] is False and not any(caps[k] for k in ("settings", "devices", "configure", "reload"))
    refused = await _call(user, "panel", entry_id=target.entry_id)
    assert not refused["success"] and refused["error"]["code"] == "unauthorized"


async def test_a_user_without_a_person_does_not_see_the_card(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    target, _ = _target(hass)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    assert (await _call(user, "capabilities", entry_id=target.entry_id))["result"]["visible"] is False


async def test_a_listed_person_gets_the_panel_with_hidden_entities_left_out(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    target, ids = _target(hass)
    person = _person(hass, hass_read_only_user)
    admin = await hass_ws_client(hass)
    await _call(admin, "access/hidden/set", entry_id=target.entry_id, hidden_patterns=["signal"])
    await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, sections=["settings", "devices"],
                hidden_entities=[ids["uptime"]])
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    panel = (await _call(user, "panel", entry_id=target.entry_id))["result"]
    assert panel["entry"]["title"] == "Target" and panel["settings"]["source"] == "user"
    assert "entry_id" not in panel["entry"]
    shown = _shown(panel)
    assert ids["lamp"] in shown and ids["power"] in shown and ids["orphan"] in shown
    assert ids["rssi"] not in shown and ids["uptime"] not in shown
    assert [d["name"] for d in panel["devices"]] == ["Desk Lamp", ""]  # Hub had only a hidden entity; orphans last
    lamp = panel["devices"][0]
    assert (lamp["manufacturer"], lamp["model"], lamp["sw_version"]) == ("Acme", "L1", "1.2")


async def test_a_person_only_gets_the_sections_of_their_rule(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    target, _ = _target(hass)
    person = _person(hass, hass_read_only_user)
    admin = await hass_ws_client(hass)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, sections=["settings"])
    only_settings = (await _call(user, "panel", entry_id=target.entry_id))["result"]
    assert only_settings["devices"] == [] and only_settings["settings"] is not None
    await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, sections=["devices"])
    only_devices = (await _call(user, "panel", entry_id=target.entry_id))["result"]
    assert only_devices["settings"] is None and only_devices["devices"]


async def test_administrators_see_everything_including_the_entry_id(hass, hass_ws_client):
    await _set_up(hass)
    target, ids = _target(hass)
    admin = await hass_ws_client(hass)
    await _call(admin, "access/hidden/set", entry_id=target.entry_id, hidden_patterns=["."])
    panel = (await _call(admin, "panel", entry_id=target.entry_id))["result"]
    assert panel["entry"]["entry_id"] == target.entry_id
    assert set(_shown(panel)) == set(ids.values())


async def test_an_administrator_can_preview_what_a_person_sees(hass, hass_ws_client, hass_read_only_user, hass_admin_user):
    await _set_up(hass)
    target, ids = _target(hass)
    anna = _person(hass, hass_read_only_user)
    root = _person(hass, hass_admin_user, "root")
    admin = await hass_ws_client(hass)
    await _call(admin, "access/hidden/set", entry_id=target.entry_id, hidden_patterns=["signal"])
    await _call(admin, "access/person/set", entry_id=target.entry_id, person=anna, sections=["devices"])
    as_anna = (await _call(admin, "panel", entry_id=target.entry_id, as_person=anna))["result"]
    assert ids["rssi"] not in _shown(as_anna) and as_anna["settings"] is None
    nobody = await _call(admin, "capabilities", entry_id=target.entry_id, as_person="person.nobody")
    assert nobody["result"]["visible"] is False
    as_admin_person = (await _call(admin, "capabilities", entry_id=target.entry_id, as_person=root))["result"]
    assert as_admin_person["admin"] is True


async def test_only_administrators_can_preview(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    target, _ = _target(hass)
    person = _person(hass, hass_read_only_user)
    admin = await hass_ws_client(hass)
    await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, **FULL)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    response = await _call(user, "capabilities", entry_id=target.entry_id, as_person=person)
    assert not response["success"] and response["error"]["code"] == "unauthorized"


async def test_the_panel_of_a_missing_entry_is_not_found(hass, hass_ws_client):
    await _set_up(hass)
    response = await _call(await hass_ws_client(hass), "panel", entry_id="nope")
    assert response["error"]["code"] == "not_found"


async def test_disabled_devices_and_entities_never_show_up(hass, hass_ws_client):
    await _set_up(hass)
    target, ids = _target(hass)
    er.async_get(hass).async_update_entity(ids["orphan"], disabled_by=er.RegistryEntryDisabler.USER)
    panel = (await _call(await hass_ws_client(hass), "panel", entry_id=target.entry_id))["result"]
    assert ids["orphan"] not in _shown(panel)


# --- reload and the gear -------------------------------------------------------------------------

async def test_reload_needs_the_right_and_then_reloads(hass, hass_ws_client, hass_read_only_user, monkeypatch):
    await _set_up(hass)
    target, _ = _target(hass)
    person = _person(hass, hass_read_only_user)
    reloaded = []

    async def fake_reload(entry_id):
        reloaded.append(entry_id)
        return True

    monkeypatch.setattr(hass.config_entries, "async_reload", fake_reload)
    admin = await hass_ws_client(hass)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, sections=["settings"])
    denied = await _call(user, "reload", entry_id=target.entry_id)
    assert denied["error"]["code"] == "unauthorized" and reloaded == []
    await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, sections=["settings"], reload=True)
    assert (await _call(user, "reload", entry_id=target.entry_id))["success"]
    assert reloaded == [target.entry_id]


class _OptionsFlow(config_entries.OptionsFlow):
    """An integration with a gear: one text option, saved when the form is sent."""

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        return self.async_show_form(step_id="init", data_schema=vol.Schema({vol.Required("name"): str}))


class _ConfigFlow(config_entries.ConfigFlow):
    VERSION = 1

    @staticmethod
    def async_get_options_flow(config_entry):
        return _OptionsFlow()


def _with_options(hass) -> MockConfigEntry:
    mock_integration(hass, MockModule("options_target"))
    mock_platform(hass, "options_target.config_flow", MockPlatform())
    target = MockConfigEntry(domain="options_target", title="Options target")
    target.add_to_hass(hass)
    return target


async def test_a_granted_person_runs_the_options_flow_and_the_options_are_saved(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    person = _person(hass, hass_read_only_user)
    with mock_config_flow("options_target", _ConfigFlow):
        target = _with_options(hass)
        admin = await hass_ws_client(hass)
        await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, **FULL)
        user = await _client_for(hass, hass_ws_client, hass_read_only_user)
        started = await _call(user, "options/start", entry_id=target.entry_id)
        assert started["success"], started
        form = started["result"]
        assert form["type"] == "form" and form["step_id"] == "init"
        assert form["data_schema"][0]["name"] == "name"  # serialized like Home Assistant's own flow API
        finished = await _call(user, "options/step", flow_id=form["flow_id"], user_input={"name": "Kitchen"})
        assert finished["success"] and finished["result"]["type"] == "create_entry"
        assert target.options == {"name": "Kitchen"}
        again = await _call(user, "options/step", flow_id=form["flow_id"], user_input={"name": "x"})
        assert not again["success"]  # the flow is over


async def test_without_the_right_the_gear_does_not_open(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    person = _person(hass, hass_read_only_user)
    with mock_config_flow("options_target", _ConfigFlow):
        target = _with_options(hass)
        admin = await hass_ws_client(hass)
        await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, sections=["settings"], reload=True)
        user = await _client_for(hass, hass_ws_client, hass_read_only_user)
        denied = await _call(user, "options/start", entry_id=target.entry_id)
        assert denied["error"]["code"] == "unauthorized"


async def test_an_entry_without_options_has_no_gear(hass, hass_ws_client):
    await _set_up(hass)
    target, _ = _target(hass)
    response = await _call(await hass_ws_client(hass), "options/start", entry_id=target.entry_id)
    assert not response["success"] and response["error"]["code"] == "not_supported"


async def test_a_flow_can_be_aborted_and_only_by_its_owner(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    person = _person(hass, hass_read_only_user)
    with mock_config_flow("options_target", _ConfigFlow):
        target = _with_options(hass)
        admin = await hass_ws_client(hass)
        await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, **FULL)
        user = await _client_for(hass, hass_ws_client, hass_read_only_user)
        flow_id = (await _call(user, "options/start", entry_id=target.entry_id))["result"]["flow_id"]
        stolen = await _call(admin, "options/abort", flow_id=flow_id)
        assert stolen["error"]["code"] == "not_found"
        assert (await _call(user, "options/abort", flow_id=flow_id))["success"]
        assert hass.config_entries.options.async_progress() == []


async def test_nobody_continues_a_flow_that_was_not_theirs(hass, hass_ws_client, hass_read_only_user):
    await _set_up(hass)
    person = _person(hass, hass_read_only_user)
    with mock_config_flow("options_target", _ConfigFlow):
        target = _with_options(hass)
        admin = await hass_ws_client(hass)
        await _call(admin, "access/person/set", entry_id=target.entry_id, person=person, **FULL)
        user = await _client_for(hass, hass_ws_client, hass_read_only_user)
        flow_id = (await _call(user, "options/start", entry_id=target.entry_id))["result"]["flow_id"]
        stolen = await _call(admin, "options/step", flow_id=flow_id, user_input={"name": "Mine"})
        assert stolen["error"]["code"] == "not_found" and target.options == {}


async def test_an_unknown_flow_is_not_found(hass, hass_ws_client):
    await _set_up(hass)
    response = await _call(await hass_ws_client(hass), "options/step", flow_id="does-not-exist")
    assert response["error"]["code"] == "not_found"
