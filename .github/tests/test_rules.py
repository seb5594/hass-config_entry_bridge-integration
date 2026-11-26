"""The access rules and the panel builder are plain Python and are tested without Home Assistant."""
import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "rules", Path(__file__).resolve().parents[2] / "custom_components/config_entry_panel/rules.py")
rules = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rules)

ANNA, BEN = "person.anna", "person.ben"
FULL = {"sections": ["settings", "devices"], "configure": True, "reload": True}


class Patterns(unittest.TestCase):
    def test_valid_patterns_compile_case_insensitively(self):
        pattern = rules.compile_pattern("_RSSI$")
        self.assertTrue(pattern.search("sensor.lamp_rssi"))

    def test_empty_oversized_and_broken_patterns_are_refused(self):
        for text in ("", "   ", "(", "[a-", "a" * (rules.MAX_PATTERN_LENGTH + 1), None, 5):
            self.assertIsNone(rules.compile_pattern(text), repr(text))

    def test_patterns_that_can_run_for_minutes_are_refused(self):
        for text in ("(a+)+$", "(.*)*x", "(a*){2,}", r"^(\w+\s?)*$"):
            self.assertIsNone(rules.compile_pattern(text), text)

    def test_ordinary_groups_and_alternatives_are_fine(self):
        for text in ("^(sensor|binary_sensor)\\.", "(rssi|signal)$", "^light\\.(desk|wall)_", "a+b*c?"):
            self.assertIsNotNone(rules.compile_pattern(text), text)

    def test_a_pattern_matches_the_id_or_the_name(self):
        patterns = [rules.compile_pattern("signal")]
        self.assertTrue(rules.is_hidden("sensor.a", "Signal strength", set(), patterns))
        self.assertTrue(rules.is_hidden("sensor.signal_x", "X", set(), patterns))
        self.assertFalse(rules.is_hidden("sensor.a", "Power", set(), patterns))

    def test_a_listed_entity_is_hidden_by_its_id(self):
        self.assertTrue(rules.is_hidden("light.a", "A", {"light.a"}, []))
        self.assertFalse(rules.is_hidden("light.b", "B", {"light.a"}, []))


class Cleaning(unittest.TestCase):
    def test_a_rule_without_a_section_grants_nothing(self):
        self.assertIsNone(rules.clean_rule({"sections": [], "configure": True}))
        self.assertIsNone(rules.clean_rule("x"))

    def test_only_real_true_counts_for_actions(self):
        rule = rules.clean_rule({"sections": ["settings"], "configure": "yes", "reload": 1})
        self.assertEqual((rule["configure"], rule["reload"]), (False, False))

    def test_sections_are_known_and_ordered(self):
        rule = rules.clean_rule({"sections": ["devices", "admin", "settings", "devices"]})
        self.assertEqual(rule["sections"], ["settings", "devices"])

    def test_hiding_lists_keep_only_valid_unique_entries(self):
        rule = rules.clean_rule({"sections": ["devices"], "hidden_entities": ["light.a", "light.a", "Bad Id", 5],
                                 "hidden_patterns": ["_rssi$", "(", "(a+)+"]})
        self.assertEqual(rule["hidden_entities"], ["light.a"])
        self.assertEqual(rule["hidden_patterns"], ["_rssi$"])

    def test_garbage_in_the_store_is_dropped(self):
        raw = {"entries": {"e1": {"people": {ANNA: FULL, "light.x": FULL, BEN: {"sections": []}},
                                  "hidden_entities": ["sensor.x"]},
                           "e2": {"people": {}}, "e3": "x", 5: {}}}
        store = rules.clean_store(raw)
        self.assertEqual(list(store), ["e1"])
        self.assertEqual(list(store["e1"]["people"]), [ANNA])
        self.assertEqual(rules.clean_store(None), {})
        self.assertEqual(rules.clean_store({"entries": []}), {})


class Changing(unittest.TestCase):
    def test_giving_a_person_rights(self):
        store = rules.with_person({}, "e1", ANNA, FULL)
        self.assertEqual(store["e1"]["people"][ANNA]["sections"], ["settings", "devices"])

    def test_other_people_and_entries_are_untouched(self):
        store = rules.with_person(rules.with_person({}, "e1", ANNA, FULL), "e1", BEN, {"sections": ["devices"]})
        store = rules.with_person(store, "e2", ANNA, {"sections": ["settings"]})
        self.assertEqual(sorted(store["e1"]["people"]), [ANNA, BEN])
        self.assertEqual(store["e2"]["people"][ANNA]["sections"], ["settings"])

    def test_the_original_store_is_never_modified(self):
        original = rules.with_person({}, "e1", ANNA, FULL)
        rules.with_person(original, "e1", ANNA, {"sections": ["devices"]})
        rules.without_person(original, "e1", ANNA)
        self.assertEqual(original["e1"]["people"][ANNA]["sections"], ["settings", "devices"])

    def test_removing_the_last_person_removes_the_entry(self):
        store = rules.without_person(rules.with_person({}, "e1", ANNA, FULL), "e1", ANNA)
        self.assertEqual(store, {})

    def test_removing_an_unknown_person_changes_nothing(self):
        store = rules.with_person({}, "e1", ANNA, FULL)
        self.assertEqual(rules.without_person(store, "e1", BEN), store)
        self.assertEqual(rules.without_person({}, "e1", BEN), {})

    def test_invalid_input_is_explained(self):
        with self.assertRaisesRegex(ValueError, "person entities"):
            rules.with_person({}, "e1", "light.x", FULL)
        with self.assertRaisesRegex(ValueError, "at least one section"):
            rules.with_person({}, "e1", ANNA, {"sections": []})
        with self.assertRaisesRegex(ValueError, "valid or safe pattern"):
            rules.with_person({}, "e1", ANNA, {**FULL, "hidden_patterns": ["(a+)+"]})
        with self.assertRaisesRegex(ValueError, "entity IDs"):
            rules.with_hidden({}, "e1", ["Not An Id"], [])
        with self.assertRaisesRegex(ValueError, "valid or safe pattern"):
            rules.with_hidden({}, "e1", [], ["("])

    def test_entry_wide_hiding_is_stored_and_can_be_cleared(self):
        store = rules.with_hidden({}, "e1", ["sensor.a"], ["_rssi$"])
        self.assertEqual(store["e1"]["hidden_patterns"], ["_rssi$"])
        self.assertEqual(rules.with_hidden(store, "e1", [], []), {})


class Callers(unittest.TestCase):
    policy = rules.clean_policy({"people": {ANNA: {**FULL, "sections": ["settings"], "reload": False},
                                            BEN: {"sections": ["devices"]}}})

    def test_a_user_is_found_through_the_person_entity(self):
        persons = [(ANNA, {"user_id": "u1"}), (BEN, {"user_id": "u2"}), ("person.none", {})]
        self.assertEqual(rules.person_of_user(persons, "u2"), BEN)
        self.assertIsNone(rules.person_of_user(persons, "u9"))

    def test_administrators_may_do_everything(self):
        caps = rules.capabilities(rules.empty_policy(), None, is_admin=True)
        self.assertTrue(all(caps.values()))

    def test_a_listed_person_gets_exactly_their_sections_and_actions(self):
        caps = rules.capabilities(self.policy, ANNA, is_admin=False)
        self.assertEqual(caps, {"visible": True, "admin": False, "settings": True, "devices": False, "configure": True, "reload": False})
        ben = rules.capabilities(self.policy, BEN, is_admin=False)
        self.assertEqual((ben["settings"], ben["devices"], ben["configure"], ben["reload"]), (False, True, False, False))

    def test_everybody_else_does_not_see_the_card_at_all(self):
        for person in ("person.carl", None):
            caps = rules.capabilities(self.policy, person, is_admin=False)
            self.assertFalse(any(caps.values()), person)


DEVICES = [
    {"id": "d-lamp", "name": "Desk Lamp", "manufacturer": "Acme", "model": "L1", "sw_version": "1.2", "hw_version": None,
     "area": "Office", "entry_type": None, "disabled": False},
    {"id": "d-hub", "name": "Hub", "manufacturer": "Acme", "model": "H1", "sw_version": None, "hw_version": None,
     "area": None, "entry_type": "service", "disabled": False},
    {"id": "d-off", "name": "Off", "manufacturer": None, "model": None, "sw_version": None, "hw_version": None,
     "area": None, "entry_type": None, "disabled": True},
    {"id": "d-empty", "name": "Quiet", "manufacturer": None, "model": None, "sw_version": None, "hw_version": None,
     "area": None, "entry_type": None, "disabled": False},
]


def entity(entity_id, device_id="d-lamp", category=None, disabled=False, name=None):
    return {"entity_id": entity_id, "device_id": device_id, "entity_category": category, "disabled": disabled,
            "name": name or entity_id.split(".")[1].replace("_", " ").title()}


ENTITIES = [
    entity("light.desk_lamp"), entity("sensor.desk_lamp_power"), entity("sensor.desk_lamp_rssi", category="diagnostic"),
    entity("number.dim_time", category="config"), entity("switch.hub_led", "d-hub"),
    entity("sensor.hub_uptime", "d-hub", "diagnostic"), entity("sensor.orphan", None), entity("sensor.disabled", disabled=True),
]
ENTRY = {"entry_id": "e1", "domain": "demo", "title": "Demo", "state": "loaded", "disabled_by": None, "reason": "boom",
         "source": "user", "pref_disable_polling": False, "pref_disable_new_entities": True, "supports_options": True}


class Devices(unittest.TestCase):
    def build(self, hidden_ids=(), patterns=()):
        return rules.build_devices(DEVICES, ENTITIES, hidden_ids=set(hidden_ids),
                                   patterns=[rules.compile_pattern(p) for p in patterns], no_device_title="No device")

    def test_real_devices_come_first_alphabetically_then_the_entities_without_a_device(self):
        titles = [device["name"] for device in self.build()]
        self.assertEqual(titles, ["Desk Lamp", "Hub", "Quiet", "No device"])

    def test_disabled_devices_and_entities_are_left_out(self):
        built = self.build()
        self.assertNotIn("Off", [d["name"] for d in built])
        self.assertNotIn("sensor.disabled", str(built))

    def test_entities_are_sorted_into_the_groups_of_the_device_page(self):
        lamp = self.build()[0]
        self.assertEqual([g["group"] for g in lamp["groups"]], ["control", "sensor", "config", "diagnostic"])

    def test_hidden_entities_disappear_by_id_and_by_pattern(self):
        lamp = self.build(["light.desk_lamp"], ["_rssi$"])[0]
        shown = [e["entity_id"] for g in lamp["groups"] for e in g["entities"]]
        self.assertEqual(shown, ["sensor.desk_lamp_power", "number.dim_time"])

    def test_a_device_with_only_hidden_entities_goes_but_one_that_never_had_any_stays(self):
        names = [d["name"] for d in self.build([], ["^(switch|sensor)\\.hub_"])]
        self.assertNotIn("Hub", names)
        self.assertIn("Quiet", names)

    def test_device_details_are_passed_on(self):
        hub = next(d for d in self.build() if d["name"] == "Hub")
        self.assertEqual((hub["manufacturer"], hub["model"], hub["entry_type"]), ("Acme", "H1", "service"))
        self.assertEqual(self.build()[0]["area"], "Office")

    def test_group_of_follows_category_then_domain(self):
        self.assertEqual(rules.group_of("light.a", None), "control")
        self.assertEqual(rules.group_of("binary_sensor.a", None), "sensor")
        self.assertEqual(rules.group_of("sensor.a", "diagnostic"), "diagnostic")
        self.assertEqual(rules.group_of("switch.a", "config"), "config")


class Panel(unittest.TestCase):
    policy = rules.clean_policy({
        "hidden_patterns": ["_rssi$"],
        "people": {ANNA: {**FULL, "hidden_entities": ["sensor.hub_uptime"]},
                   BEN: {"sections": ["devices"]},
                   "person.cat": {"sections": ["settings"]}}})

    def panel(self, person, is_admin=False):
        caps = rules.capabilities(self.policy, person, is_admin=is_admin)
        return rules.build_panel(ENTRY, DEVICES, ENTITIES, caps, self.policy, person)

    @staticmethod
    def shown(panel):
        return [e["entity_id"] for d in panel["devices"] for g in d["groups"] for e in g["entities"]]

    def test_administrators_see_every_entity_and_the_entry_id(self):
        panel = self.panel(None, True)
        self.assertIn("sensor.desk_lamp_rssi", self.shown(panel))
        self.assertEqual(panel["entry"]["entry_id"], "e1")

    def test_a_person_gets_the_entry_wide_and_their_own_hiding(self):
        shown = self.shown(self.panel(ANNA))
        self.assertNotIn("sensor.desk_lamp_rssi", shown)
        self.assertNotIn("sensor.hub_uptime", shown)
        self.assertIn("sensor.desk_lamp_power", shown)

    def test_one_persons_hiding_does_not_apply_to_another(self):
        shown = self.shown(self.panel(BEN))
        self.assertIn("sensor.hub_uptime", shown)
        self.assertNotIn("sensor.desk_lamp_rssi", shown)

    def test_without_the_settings_section_no_settings_leave_the_server(self):
        panel = self.panel(BEN)
        self.assertIsNone(panel["settings"])
        self.assertNotIn("entry_id", panel["entry"])
        self.assertEqual(panel["entry"]["title"], "Demo")

    def test_without_the_devices_section_no_device_leaves_the_server(self):
        panel = self.panel("person.cat")
        self.assertEqual(panel["devices"], [])
        self.assertEqual(panel["settings"]["reason"], "boom")

    def test_a_person_who_may_see_settings_still_does_not_get_the_entry_id(self):
        self.assertNotIn("entry_id", self.panel(ANNA)["entry"])


if __name__ == "__main__":
    unittest.main()
