# Changelog

## 2026.11.26.2

- 🐛 The card no longer disappears. A failed request used to hide a card that was already shown, and nothing asked again until the page was reloaded. Now only the server's own answer (*you may not see this card*) hides it; a dropped connection, a restarting Home Assistant or a reloading integration keep what is shown and are retried (after 2, 5, 15 and then every 60 seconds).
- The card asks again when the websocket reconnects, when a page comes back from the background after a minute, and every five minutes while it is visible.
- A rebuilt dashboard (Home Assistant calls `setConfig` again) no longer blanks the card, and nothing is announced to the dashboard before the server has answered.
- A popup that was just closed cannot open again by a state update.

## 2026.11.26.1

The first regular release.

- ✨ The card is as compact as Home Assistant's integration page: the entry with its gear and ⋮ menu on the right, then one row per device. A tap on a device opens a popup (a full-screen sheet on phones) with all its entities, grouped like the device page; a tap on the entry shows its settings.
- ✨ The editor fits phones, and hiding entities has a search. The lists are collapsed until opened.
- The card picker shows **Config Entry Panel** and a description in the language of the user.
- Supports Home Assistant 2024.7 and newer.

## 2026.11.26b1 (pre-release)

- ✨ First version. A dashboard card that shows a config entry like the settings page to people who are not administrators, with rights per person kept and enforced on the server, hiding by checkbox or pattern, preview as any person, and a card that does not exist for people who may not see it.
