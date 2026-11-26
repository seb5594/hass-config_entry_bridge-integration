"""Who may see and do what with a config entry, and what the panel of an entry contains.

Everything here is plain Python without Home Assistant imports, so the rules can be tested on their
own. The websocket layer feeds it data and sends the result; the rules are written by administrators only
and applied on the server for every request, so a dashboard in a browser can never widen them.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

PERSON_PREFIX = "person."
SECTIONS = ("settings", "devices")
ACTIONS = ("configure", "reload")
GROUPS = ("control", "sensor", "config", "diagnostic")

MAX_PATTERN_LENGTH = 200
MAX_LIST_LENGTH = 500
ENTITY_ID = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
PERSON_ID = re.compile(r"^person\.[a-z0-9_]+$")
# A group that is repeated and itself contains a repeat, like (a+)+ or (.*)*, can make a match run for
# minutes. Patterns are written by administrators but run on the requests of everybody else.
NESTED_REPEAT = re.compile(r"\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d*,\d*\})")

Policy = dict[str, Any]
Store = dict[str, Policy]


# --- patterns and hiding -------------------------------------------------------------------------

def compile_pattern(pattern: Any) -> re.Pattern[str] | None:
    """The case-insensitive expression for a pattern, or None when it is empty, too long, unsafe or invalid."""
    if not isinstance(pattern, str) or not pattern.strip() or len(pattern) > MAX_PATTERN_LENGTH:
        return None
    if NESTED_REPEAT.search(pattern):
        return None
    try:
        return re.compile(pattern, re.IGNORECASE)
    except re.error:
        return None


def is_hidden(entity_id: str, name: str, hidden_entities: Iterable[str], patterns: Iterable[re.Pattern[str]]) -> bool:
    """A pattern matches the entity ID or the displayed name; a hidden entity is listed by its ID."""
    if entity_id in hidden_entities:
        return True
    return any(pattern.search(entity_id) or pattern.search(name) for pattern in patterns)


def hiding_for(policy: Policy, person: str | None) -> tuple[set[str], list[re.Pattern[str]]]:
    """The hidden entity IDs and compiled patterns that apply to a person: the entry's own plus theirs."""
    rule = policy["people"].get(person or "", {})
    ids = set(policy["hidden_entities"]) | set(rule.get("hidden_entities", []))
    patterns = [compile_pattern(text) for text in [*policy["hidden_patterns"], *rule.get("hidden_patterns", [])]]
    return ids, [pattern for pattern in patterns if pattern is not None]


# --- stored policies -----------------------------------------------------------------------------

def empty_policy() -> Policy:
    return {"hidden_entities": [], "hidden_patterns": [], "people": {}}


def _strings(value: Any, valid) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value[:MAX_LIST_LENGTH]:
        if isinstance(item, str) and valid(item) and item not in result:
            result.append(item)
    return result


def clean_rule(raw: Any) -> Policy | None:
    """A person's rule in its stored shape; None when it grants nothing at all."""
    if not isinstance(raw, Mapping):
        return None
    sections = [name for name in SECTIONS if name in (raw.get("sections") or [])]
    rule = {
        "sections": sections,
        "configure": raw.get("configure") is True,
        "reload": raw.get("reload") is True,
        "hidden_entities": _strings(raw.get("hidden_entities"), ENTITY_ID.match),
        "hidden_patterns": _strings(raw.get("hidden_patterns"), lambda text: compile_pattern(text) is not None),
    }
    # Actions without anything to look at make no sense: the panel would not exist for that person.
    return rule if sections else None


def clean_policy(raw: Any) -> Policy:
    policy = empty_policy()
    if not isinstance(raw, Mapping):
        return policy
    policy["hidden_entities"] = _strings(raw.get("hidden_entities"), ENTITY_ID.match)
    policy["hidden_patterns"] = _strings(raw.get("hidden_patterns"), lambda text: compile_pattern(text) is not None)
    people = raw.get("people")
    for person, rule in (people.items() if isinstance(people, Mapping) else []):
        cleaned = clean_rule(rule)
        if isinstance(person, str) and PERSON_ID.match(person) and cleaned is not None:
            policy["people"][person] = cleaned
    return policy


def clean_store(raw: Any) -> Store:
    """Read the stored policies defensively: unknown shapes are dropped, empty policies are not kept."""
    store: Store = {}
    entries = raw.get("entries") if isinstance(raw, Mapping) else None
    for entry_id, policy in (entries.items() if isinstance(entries, Mapping) else []):
        cleaned = clean_policy(policy)
        if isinstance(entry_id, str) and cleaned != empty_policy():
            store[entry_id] = cleaned
    return store


def policy_of(store: Store, entry_id: str) -> Policy:
    return store.get(entry_id, empty_policy())


def _stored(store: Store, entry_id: str, policy: Policy) -> Store:
    updated = {key: value for key, value in store.items() if key != entry_id}
    if policy != empty_policy():
        updated[entry_id] = policy
    return updated


def with_person(store: Store, entry_id: str, person: str, rule: Mapping[str, Any]) -> Store:
    """A copy of the store in which `person` has `rule` for the entry. Invalid input raises ValueError."""
    if not PERSON_ID.match(person):
        raise ValueError("Rules belong to person entities such as person.anna")
    invalid = [text for text in rule.get("hidden_patterns", []) if compile_pattern(text) is None]
    if invalid:
        raise ValueError(f"Not a valid or safe pattern: {invalid[0]}")
    cleaned = clean_rule(rule)
    if cleaned is None:
        raise ValueError("A person needs at least one section to see")
    policy = {**policy_of(store, entry_id), "people": {**policy_of(store, entry_id)["people"], person: cleaned}}
    return _stored(store, entry_id, policy)


def without_person(store: Store, entry_id: str, person: str) -> Store:
    policy = policy_of(store, entry_id)
    return _stored(store, entry_id, {**policy, "people": {k: v for k, v in policy["people"].items() if k != person}})


def with_hidden(store: Store, entry_id: str, hidden_entities: list[str], hidden_patterns: list[str]) -> Store:
    """A copy of the store with the entry-wide hiding rules replaced."""
    invalid = [text for text in hidden_patterns if compile_pattern(text) is None]
    if invalid:
        raise ValueError(f"Not a valid or safe pattern: {invalid[0]}")
    if any(not ENTITY_ID.match(entity_id) for entity_id in hidden_entities):
        raise ValueError("Hidden entities must be entity IDs")
    policy = {**policy_of(store, entry_id), "hidden_entities": _strings(hidden_entities, ENTITY_ID.match),
              "hidden_patterns": _strings(hidden_patterns, lambda text: True)}
    return _stored(store, entry_id, policy)


# --- who is calling ------------------------------------------------------------------------------

def person_of_user(persons: Iterable[tuple[str, Mapping[str, Any]]], user_id: str) -> str | None:
    """The person entity linked to a user, from (entity_id, attributes) pairs."""
    for entity_id, attributes in persons:
        if attributes.get("user_id") == user_id:
            return entity_id
    return None


def capabilities(policy: Policy, person: str | None, *, is_admin: bool) -> dict[str, bool]:
    """What a caller may see and do. Administrators may do everything.

    `visible` is false for everybody who is neither an administrator nor listed with a section, which is
    what makes the card disappear for them.
    """
    if is_admin:
        return {"visible": True, "admin": True, "settings": True, "devices": True, "configure": True, "reload": True}
    rule = policy["people"].get(person or "")
    if rule is None:
        return {"visible": False, "admin": False, "settings": False, "devices": False, "configure": False, "reload": False}
    return {"visible": True, "admin": False, "settings": "settings" in rule["sections"],
            "devices": "devices" in rule["sections"], "configure": rule["configure"], "reload": rule["reload"]}


# --- the panel of an entry -----------------------------------------------------------------------

def group_of(entity_id: str, entity_category: str | None) -> str:
    """The group of Home Assistant's device page an entity belongs to."""
    if entity_category in ("config", "diagnostic"):
        return entity_category
    return "sensor" if entity_id.split(".")[0] in ("sensor", "binary_sensor") else "control"


def _sort_key(text: str) -> str:
    return text.casefold()


def build_devices(
    devices: list[Mapping[str, Any]],
    entities: list[Mapping[str, Any]],
    *,
    hidden_ids: set[str],
    patterns: list[re.Pattern[str]],
    no_device_title: str = "",
) -> list[dict[str, Any]]:
    """Devices with their visible entities, grouped like the device page.

    `devices` are dicts with id, name, manufacturer, model, sw_version, hw_version, area, entry_type,
    disabled; `entities` are dicts with entity_id, name, device_id, entity_category, disabled. A device
    whose entities are all hidden is left out, one that never had an entity stays. Entities that belong to
    no device are collected in one last pseudo device without an id.
    """
    active = [entity for entity in entities if not entity.get("disabled")]
    result: list[dict[str, Any]] = []

    def groups_for(own: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
        visible = [entity for entity in own if not is_hidden(entity["entity_id"], entity["name"], hidden_ids, patterns)]
        grouped = []
        for group in GROUPS:
            members = sorted((e for e in visible if group_of(e["entity_id"], e.get("entity_category")) == group),
                             key=lambda e: _sort_key(e["name"]))
            if members:
                grouped.append({"group": group, "entities": [{"entity_id": e["entity_id"], "name": e["name"]} for e in members]})
        return grouped

    for device in sorted((d for d in devices if not d.get("disabled")), key=lambda d: _sort_key(d["name"])):
        own = [entity for entity in active if entity.get("device_id") == device["id"]]
        groups = groups_for(own)
        if own and not groups:
            continue
        result.append({**{key: device.get(key) for key in ("id", "name", "manufacturer", "model", "sw_version", "hw_version", "area", "entry_type")}, "groups": groups})
    orphans = groups_for([entity for entity in active if not entity.get("device_id")])
    if orphans:
        result.append({"id": None, "name": no_device_title, "manufacturer": None, "model": None, "sw_version": None,
                       "hw_version": None, "area": None, "entry_type": None, "groups": orphans})
    return result


HEADER_FIELDS = ("entry_id", "domain", "title", "state", "disabled_by", "supports_options")
SETTINGS_FIELDS = ("source", "reason", "pref_disable_polling", "pref_disable_new_entities")


def build_panel(
    entry: Mapping[str, Any],
    devices: list[Mapping[str, Any]],
    entities: list[Mapping[str, Any]],
    caps: Mapping[str, bool],
    policy: Policy,
    person: str | None,
    no_device_title: str = "",
) -> dict[str, Any]:
    """Everything the card shows for one caller: only the sections that caller may see, entities already filtered.

    The header (title, integration, state) is part of every panel; the settings only of a panel that
    includes the settings section, and the entry ID only of an administrator's.
    """
    hidden_ids, patterns = hiding_for(policy, person)
    if caps["admin"]:
        hidden_ids, patterns = set(), []  # administrators see every entity
    header = {key: entry.get(key) for key in HEADER_FIELDS}
    if not caps["admin"]:
        header.pop("entry_id")
    panel: dict[str, Any] = {"entry": header, "caps": dict(caps), "settings": None, "devices": []}
    if caps["settings"]:
        panel["settings"] = {key: entry.get(key) for key in SETTINGS_FIELDS}
    if caps["devices"]:
        panel["devices"] = build_devices(devices, entities, hidden_ids=hidden_ids, patterns=patterns,
                                         no_device_title=no_device_title)
    return panel
