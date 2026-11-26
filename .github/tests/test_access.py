"""The permission rules are plain Python and are tested without Home Assistant."""
import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "access", Path(__file__).resolve().parents[2] / "custom_components/config_entry_bridge/access.py")
access = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(access)

ANNA, BEN = "person.anna", "person.ben"


class Grants(unittest.TestCase):
    def test_a_grant_gives_exactly_the_requested_capabilities(self):
        grants = access.with_grant({}, "e1", ANNA, configure=True)
        self.assertEqual(grants, {"e1": {ANNA: {"configure": True, "reload": False}}})

    def test_removing_the_last_capability_removes_the_person_and_the_entry(self):
        grants = access.with_grant(access.with_grant({}, "e1", ANNA, reload=True), "e1", ANNA)
        self.assertEqual(grants, {})

    def test_changing_one_person_leaves_the_others_alone(self):
        grants = access.with_grant(access.with_grant({}, "e1", ANNA, reload=True), "e1", BEN, configure=True)
        self.assertEqual(sorted(grants["e1"]), [ANNA, BEN])
        self.assertTrue(access.with_grant(grants, "e1", BEN)["e1"][ANNA]["reload"])

    def test_the_original_is_never_modified(self):
        original = access.with_grant({}, "e1", ANNA, reload=True)
        access.with_grant(original, "e1", ANNA)
        self.assertIn(ANNA, original["e1"])

    def test_only_person_entities_can_hold_grants(self):
        with self.assertRaises(ValueError):
            access.with_grant({}, "e1", "light.lamp", configure=True)


class Stored(unittest.TestCase):
    def test_garbage_is_ignored_and_only_real_true_values_count(self):
        raw = {"e1": {ANNA: {"configure": "yes", "reload": True}, "light.x": {"reload": True}, BEN: "x"},
               "e2": [], 5: {}}
        self.assertEqual(access.clean_grants(raw), {"e1": {ANNA: {"configure": False, "reload": True}}})

    def test_anything_but_a_mapping_gives_no_grants(self):
        self.assertEqual(access.clean_grants(None), {})
        self.assertEqual(access.clean_grants([1]), {})


class Callers(unittest.TestCase):
    grants = {"e1": {ANNA: {"configure": True, "reload": False}}}

    def test_a_user_is_found_through_the_person_entity(self):
        persons = [(ANNA, {"user_id": "u1"}), (BEN, {"user_id": "u2"}), ("person.none", {})]
        self.assertEqual(access.person_of_user(persons, "u2"), BEN)
        self.assertIsNone(access.person_of_user(persons, "u9"))

    def test_a_granted_person_gets_only_what_was_granted(self):
        self.assertEqual(access.capabilities_of(self.grants, "e1", ANNA, is_admin=False), {"configure": True, "reload": False})

    def test_everybody_else_gets_nothing(self):
        for person, entry in ((BEN, "e1"), (ANNA, "e2"), (None, "e1")):
            self.assertEqual(access.capabilities_of(self.grants, entry, person, is_admin=False), {"configure": False, "reload": False})

    def test_administrators_may_do_everything(self):
        self.assertEqual(access.capabilities_of({}, "e1", None, is_admin=True), {"configure": True, "reload": True})


if __name__ == "__main__":
    unittest.main()
