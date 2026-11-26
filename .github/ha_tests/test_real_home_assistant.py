"""The bridge inside a genuine Home Assistant core.

They need Home Assistant and pytest-homeassistant-custom-component. The shared
engine installs both for every release the Compatibility workflow lists; to run them
locally: python .engine/.scripts/ha_matrix.py run 2026.9.4
"""

from pathlib import Path

import pytest

pytest.importorskip("pytest_homeassistant_custom_component")

import probatio  # noqa: E402
from homeassistant import config_entries  # noqa: E402
from homeassistant.config_entries import ConfigEntryState  # noqa: E402
from homeassistant.components import websocket_api  # noqa: E402
from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.setup import async_setup_component  # noqa: E402
from pytest_homeassistant_custom_component.common import (  # noqa: E402
    MockConfigEntry,
    MockModule,
    MockPlatform,
    mock_config_flow,
    mock_integration,
    mock_platform,
)

DOMAIN = next((Path(__file__).resolve().parents[2] / "custom_components").iterdir()).name


@pytest.fixture(autouse=True)
def _enable_custom_integrations(enable_custom_integrations):
    """Let the test core find custom_components/."""


async def _set_up_bridge(hass: HomeAssistant) -> MockConfigEntry:
    # The shared plugin counts the declared dependencies as loaded without setting them up. The websocket
    # test client needs a real HTTP server and the websocket API view, so set those up by hand.
    assert await async_setup_component(hass, "http", {})
    assert await websocket_api.async_setup(hass, {})
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _target(hass: HomeAssistant) -> MockConfigEntry:
    """Another config entry the grants are about."""
    target = MockConfigEntry(domain="test_target", title="Target")
    target.add_to_hass(hass)
    return target


async def _client_for(hass, hass_ws_client, user):
    """A websocket client logged in as `user`."""
    refresh_token = await hass.auth.async_create_refresh_token(user, "https://example.test")
    return await hass_ws_client(hass, hass.auth.async_create_access_token(refresh_token))


async def _call(client, command, **payload):
    await client.send_json_auto_id({"type": f"{DOMAIN}/{command}", **payload})
    return await client.receive_json()


async def _person_for(hass: HomeAssistant, user, name="anna") -> str:
    """A person entity linked to `user`, which is how the bridge finds who is calling."""
    entity_id = f"person.{name}"
    hass.states.async_set(entity_id, "home", {"user_id": user.id, "friendly_name": name})
    return entity_id


async def test_user_flow_creates_the_single_entry_and_refuses_a_second(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "form"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert again["type"] == "abort"


async def test_entry_loads_and_unloads(hass):
    entry = await _set_up_bridge(hass)
    assert entry.state is ConfigEntryState.LOADED
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED


async def test_a_regular_user_cannot_grant_anything(hass, hass_ws_client, hass_read_only_user):
    await _set_up_bridge(hass)
    target = await _target(hass)
    client = await _client_for(hass, hass_ws_client, hass_read_only_user)
    response = await _call(client, "grants/set", entry_id=target.entry_id, person="person.anna", configure=True)
    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"


async def test_an_administrator_grants_and_reads_the_grants_back(hass, hass_ws_client, hass_read_only_user):
    await _set_up_bridge(hass)
    target = await _target(hass)
    person = await _person_for(hass, hass_read_only_user)
    admin = await hass_ws_client(hass)
    response = await _call(admin, "grants/set", entry_id=target.entry_id, person=person, reload=True)
    expected = {target.entry_id: {person: {"configure": False, "reload": True}}}
    assert response["success"] and response["result"] == expected
    assert (await _call(admin, "grants/get"))["result"] == expected
    removed = await _call(admin, "grants/set", entry_id=target.entry_id, person=person)
    assert removed["result"] == {}


async def test_capabilities_follow_the_grant_for_exactly_that_person_and_entry(hass, hass_ws_client, hass_read_only_user):
    await _set_up_bridge(hass)
    target, other = await _target(hass), MockConfigEntry(domain="test_other")
    other.add_to_hass(hass)
    person = await _person_for(hass, hass_read_only_user)
    admin = await hass_ws_client(hass)
    await _call(admin, "grants/set", entry_id=target.entry_id, person=person, configure=True)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    assert (await _call(user, "capabilities", entry_id=target.entry_id))["result"] == {"configure": True, "reload": False}
    assert (await _call(user, "capabilities", entry_id=other.entry_id))["result"] == {"configure": False, "reload": False}
    assert (await _call(admin, "capabilities", entry_id=other.entry_id))["result"] == {"configure": True, "reload": True}


async def test_without_a_grant_nothing_works_for_a_regular_user(hass, hass_ws_client, hass_read_only_user):
    await _set_up_bridge(hass)
    target = await _target(hass)
    await _person_for(hass, hass_read_only_user)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    for command in ("reload", "options/start"):
        response = await _call(user, command, entry_id=target.entry_id)
        assert not response["success"]
        assert response["error"]["code"] == "unauthorized"


async def test_a_flow_cannot_be_continued_by_somebody_who_did_not_start_it(hass, hass_ws_client, hass_read_only_user):
    await _set_up_bridge(hass)
    user = await _client_for(hass, hass_ws_client, hass_read_only_user)
    response = await _call(user, "options/step", flow_id="does-not-exist")
    assert not response["success"]
    assert response["error"]["code"] == "not_found"


class _TargetOptionsFlow(config_entries.OptionsFlow):
    """An integration with a gear: one text option, saved when the form is sent."""

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        return self.async_show_form(step_id="init", data_schema=probatio.Schema({probatio.Required("name"): str}))


class _TargetConfigFlow(config_entries.ConfigFlow):
    VERSION = 1

    @staticmethod
    def async_get_options_flow(config_entry):
        return _TargetOptionsFlow()


async def _target_with_options(hass) -> MockConfigEntry:
    mock_integration(hass, MockModule("options_target"))
    mock_platform(hass, "options_target.config_flow", MockPlatform())
    target = MockConfigEntry(domain="options_target", title="Options target")
    target.add_to_hass(hass)
    return target


async def test_a_granted_person_runs_the_options_flow_and_the_options_are_saved(hass, hass_ws_client, hass_read_only_user):
    await _set_up_bridge(hass)
    person = await _person_for(hass, hass_read_only_user)
    with mock_config_flow("options_target", _TargetConfigFlow):
        target = await _target_with_options(hass)
        admin = await hass_ws_client(hass)
        await _call(admin, "grants/set", entry_id=target.entry_id, person=person, configure=True)
        user = await _client_for(hass, hass_ws_client, hass_read_only_user)

        started = await _call(user, "options/start", entry_id=target.entry_id)
        assert started["success"], started
        form = started["result"]
        assert form["type"] == "form" and form["step_id"] == "init"
        assert form["data_schema"][0]["name"] == "name"  # serialized like Home Assistant's own flow API

        finished = await _call(user, "options/step", flow_id=form["flow_id"], user_input={"name": "Kitchen"})
        assert finished["success"] and finished["result"]["type"] == "create_entry"
        assert target.options == {"name": "Kitchen"}

        # The flow is over: it cannot be continued again.
        again = await _call(user, "options/step", flow_id=form["flow_id"], user_input={"name": "x"})
        assert not again["success"]


async def test_another_user_cannot_continue_a_flow_that_was_not_theirs(hass, hass_ws_client, hass_read_only_user, hass_admin_user):
    await _set_up_bridge(hass)
    person = await _person_for(hass, hass_read_only_user)
    with mock_config_flow("options_target", _TargetConfigFlow):
        target = await _target_with_options(hass)
        admin = await hass_ws_client(hass)
        await _call(admin, "grants/set", entry_id=target.entry_id, person=person, configure=True)
        user = await _client_for(hass, hass_ws_client, hass_read_only_user)
        form = (await _call(user, "options/start", entry_id=target.entry_id))["result"]
        stolen = await _call(admin, "options/step", flow_id=form["flow_id"], user_input={"name": "Mine"})
        assert not stolen["success"] and stolen["error"]["code"] == "not_found"
        assert target.options == {}
