<!-- header:begin (generated from project metadata) -->
<h1 align="center">
  <img src="https://raw.githubusercontent.com/seb5594/hass-config_entry_bridge-integration/main/custom_components/config_entry_bridge/brand/icon@2x.png" alt="Config Entry Bridge" width="160" height="160">
  <br>
  Config Entry Bridge
</h1>

<p align="center">
  <a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=seb5594&amp;repository=hass-config_entry_bridge-integration&amp;category=integration"><img src="https://img.shields.io/static/v1?label=HACS%20%C2%B7%20Marketplace&amp;message=Add%20integration&amp;color=41BDF5&amp;logo=homeassistantcommunitystore&amp;logoColor=white&amp;style=for-the-badge" alt="HACS · Marketplace" height="28"></a>
  <a href="https://github.com/seb5594/hass-config_entry_bridge-integration/actions/workflows/compat.yml"><img src="https://img.shields.io/static/v1?label=home%20assistant&amp;message=%E2%89%A5%202026.9.0&amp;color=1877A5&amp;style=for-the-badge" alt="home assistant" height="28"></a><br>
  <a href="https://github.com/seb5594/hass-config_entry_bridge-integration/releases"><img src="https://img.shields.io/static/v1?label=integration%20version&amp;message=2026.11.26&amp;color=1877A5&amp;style=for-the-badge" alt="integration version" height="28"></a>
  <a href="https://github.com/seb5594/hass-config_entry_bridge-integration/releases"><img src="https://img.shields.io/github/downloads/seb5594/hass-config_entry_bridge-integration/latest/total?label=downloads&amp;color=1877A5&amp;style=for-the-badge" alt="downloads" height="28"></a><br>
  <a href="https://github.com/seb5594/hass-config_entry_bridge-integration/stargazers"><img src="https://img.shields.io/github/stars/seb5594/hass-config_entry_bridge-integration?label=stars&amp;style=flat" alt="stars" height="20"></a>
  <a href="https://github.com/seb5594/hass-config_entry_bridge-integration/forks"><img src="https://img.shields.io/github/forks/seb5594/hass-config_entry_bridge-integration?label=forks&amp;style=flat" alt="forks" height="20"></a>
  <a href="https://github.com/seb5594/hass-config_entry_bridge-integration/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/seb5594/hass-config_entry_bridge-integration/ci.yml?branch=main&amp;label=checks&amp;style=flat" alt="checks" height="20"></a>
  <a href="https://github.com/seb5594/hass-config_entry_bridge-integration/issues"><img src="https://img.shields.io/github/issues/seb5594/hass-config_entry_bridge-integration?label=issues&amp;style=flat" alt="issues" height="20"></a><br>
  <a href="https://paypal.me/seb5594"><img src="https://img.shields.io/static/v1?label=Support&amp;message=PayPal&amp;color=0070BA&amp;logo=paypal&amp;logoColor=white&amp;style=for-the-badge" alt="PayPal" height="24"></a>
  <a href="https://buymeacoffee.com/seb5594"><img src="https://raw.githubusercontent.com/seb5594/Home-Assistant-Apps/473dc258f963096745aac327df54950eb9b59066/.github/assets/support-beer.svg" alt="Buy me a beer" height="24"></a><br>
  <a href="https://github.com/seb5594/hass-config_entry_bridge-integration#license"><img src="https://img.shields.io/github/license/seb5594/hass-config_entry_bridge-integration?label=license&amp;style=flat" alt="license" height="20"></a>
</p>
<!-- header:end -->

**🇬🇧 English** · [🇩🇪 Deutsch](README.de.md)

A custom Home Assistant component to modify the config entry option permission hidden by a gear, to allow regular users to see and set integration settings.

Home Assistant only lets administrators open the settings (the gear) of a config entry or reload it. This integration lets an administrator hand exactly these two rights to chosen people, per config entry, without making them administrators. It is the companion of the [Config Entry Card](https://github.com/seb5594/Home-Assistant-Config-Entry-Lovelace-Card), which shows the entry, its devices and the buttons on a dashboard.

## Install

Use the HACS badge above, restart Home Assistant and add **Config Entry Bridge** under **Settings → Devices & services**. There is nothing to configure.

## How it works

- An administrator grants `configure` and/or `reload` for one config entry to one *person*. The grants are stored by the integration itself, not in a dashboard.
- Every call is checked on the server: the caller is the logged-in user of the websocket connection, mapped to their person entity. Changing a dashboard in the browser cannot widen a grant.
- Opening the gear runs the same options flow Home Assistant runs for administrators. A flow can only be continued by the user who started it.
- Administrators always may do everything and manage the grants.

## Websocket commands

| Command | Who | Purpose |
| --- | --- | --- |
| `config_entry_bridge/grants/get` | administrator | All grants |
| `config_entry_bridge/grants/set` | administrator | `entry_id`, `person`, `configure`, `reload`; both `false` removes the grant |
| `config_entry_bridge/capabilities` | everybody | What the caller may do with `entry_id` |
| `config_entry_bridge/reload` | granted | Reload `entry_id` |
| `config_entry_bridge/options/start`, `…/step`, `…/abort` | granted | The options flow of `entry_id`, in the format of Home Assistant's own flow API |

## Limits

- A person you grant `configure` can change every option the integration offers. Grant it like you would hand over a screwdriver.
- Only options flows are covered, not reconfigure, sub-entries, rename, disable or delete.
- Grants of a deleted config entry stay in the storage file until the grant is removed; they have no effect.
- Needs Home Assistant 2026.9 or newer. The permission rules and the whole flow (grant, start, send, save, refuse) run against real Home Assistant releases in CI.

<!-- support:begin (generated, shared text) -->
## Say thanks

All my projects are built in my spare time, just for the fun of it. Still, they take a lot of time and care, and many of the smart home gadgets I buy end up here because I want to make them cloud-free and smart-home ready. Every bit of support means a lot to me.

If my work helped you or turned out to be useful, show your appreciation with a hot drink for my next sleepless night.

[![PayPal](https://img.shields.io/static/v1?label=Support&message=PayPal&color=0070BA&logo=paypal&logoColor=white&style=for-the-badge)](https://paypal.me/seb5594) [![Buy me a beer](https://raw.githubusercontent.com/seb5594/Home-Assistant-Apps/473dc258f963096745aac327df54950eb9b59066/.github/assets/support-beer.svg)](https://buymeacoffee.com/seb5594)
<!-- support:end -->

<!-- license:begin (generated from the license file) -->
## License

[![license](https://img.shields.io/static/v1?label=license&message=Apache-2.0&color=5B6770&style=flat)](LICENSE)

Published under the [Apache License 2.0](LICENSE).
<!-- license:end -->
