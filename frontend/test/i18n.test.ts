import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { bundled, fill, HOME_ASSISTANT_KEYS, lookup, translate } from "../src/i18n/index.ts";
import type { Hass } from "../src/types.ts";

const hassWith = (language: string, localize: (key: string) => string): Hass =>
  ({ language, localize }) as unknown as Hass;

function keysOf(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "object" ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`]);
}

const folder = new URL("../src/translations/", import.meta.url);
const load = (file: string) => JSON.parse(readFileSync(new URL(file, folder), "utf8"));
const english = keysOf(load("en.json")).sort();

describe("translations", () => {
  for (const file of readdirSync(folder).filter((name) => name.endsWith(".json"))) {
    it(`${file} has exactly the keys of English`, () => {
      assert.deepEqual(keysOf(load(file)).sort(), english);
    });
    it(`${file} keeps every placeholder`, () => {
      const tree = load(file);
      for (const key of english) {
        const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        const original = lookup(load("en.json"), key) ?? "";
        assert.deepEqual(placeholders(lookup(tree, key) ?? ""), placeholders(original), `${file}: ${key}`);
      }
    });
  }

  it("maps only to words that exist in the card", () => {
    for (const key of Object.keys(HOME_ASSISTANT_KEYS)) assert.ok(lookup(load("en.json"), key), key);
  });
});

describe("translate", () => {
  it("prefers the words of Home Assistant", () => {
    const hass = hassWith("de", (key) => (key.endsWith("config_entry.reload") ? "Neu laden (HA)" : ""));
    assert.equal(translate(hass, "menu.reload"), "Neu laden (HA)");
  });

  it("falls back to the bundled text when Home Assistant has no word, or answers with the key", () => {
    assert.equal(translate(hassWith("de", () => ""), "menu.reload"), "Neu laden");
    assert.equal(translate(hassWith("de", (key) => key), "menu.reload"), "Neu laden");
  });

  it("falls back from a regional language to its base language and then to English", () => {
    assert.equal(bundled("de-AT", "settings.entry_id"), "Eintrags-ID");
    assert.equal(bundled("xx", "settings.entry_id"), "Entry ID");
  });

  it("fills placeholders and leaves unknown ones alone", () => {
    assert.equal(fill("Hello {name} {other}", { name: "Anna" }), "Hello Anna {other}");
    assert.equal(translate(hassWith("en", () => ""), "card.preview_banner", { person: "Anna" }), "Preview: this is what Anna sees.");
  });

  it("returns the key for a text nobody wrote", () => {
    assert.equal(translate(undefined, "does.not.exist"), "does.not.exist");
  });
});
