"""Who may do what with which config entry. Pure functions, no Home Assistant imports.

The grants are written by administrators only and checked on the server for every call, so a
dashboard (which a user could change in the browser) can never widen them.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

PERSON_PREFIX = "person."
CAPABILITIES = ("configure", "reload")

# entry_id -> person entity id -> capability -> allowed
Grants = dict[str, dict[str, dict[str, bool]]]


def clean_grants(raw: Any) -> Grants:
    """Read stored grants defensively: unknown shapes and empty grants are dropped."""
    grants: Grants = {}
    if not isinstance(raw, Mapping):
        return grants
    for entry_id, people in raw.items():
        if not isinstance(entry_id, str) or not isinstance(people, Mapping):
            continue
        for person, flags in people.items():
            if not (isinstance(person, str) and person.startswith(PERSON_PREFIX) and isinstance(flags, Mapping)):
                continue
            allowed = {name: flags.get(name) is True for name in CAPABILITIES}
            if any(allowed.values()):
                grants.setdefault(entry_id, {})[person] = allowed
    return grants


def with_grant(grants: Grants, entry_id: str, person: str, **flags: bool) -> Grants:
    """A copy of `grants` in which `person` has exactly the given capabilities for the entry."""
    if not person.startswith(PERSON_PREFIX):
        raise ValueError("Grants belong to person entities")
    updated = {key: {name: dict(value) for name, value in people.items()} for key, people in grants.items()}
    allowed = {name: flags.get(name, False) is True for name in CAPABILITIES}
    if any(allowed.values()):
        updated.setdefault(entry_id, {})[person] = allowed
    else:
        updated.get(entry_id, {}).pop(person, None)
        if not updated.get(entry_id):
            updated.pop(entry_id, None)
    return updated


def person_of_user(persons: Iterable[tuple[str, Mapping[str, Any]]], user_id: str) -> str | None:
    """The person entity linked to a user, from (entity_id, attributes) pairs."""
    for entity_id, attributes in persons:
        if attributes.get("user_id") == user_id:
            return entity_id
    return None


def capabilities_of(
    grants: Grants, entry_id: str, person: str | None, *, is_admin: bool
) -> dict[str, bool]:
    """What a caller may do with an entry. Administrators may do everything."""
    if is_admin:
        return {name: True for name in CAPABILITIES}
    granted = grants.get(entry_id, {}).get(person or "", {})
    return {name: granted.get(name) is True for name in CAPABILITIES}
