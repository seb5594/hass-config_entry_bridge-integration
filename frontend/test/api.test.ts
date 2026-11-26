import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as api from "../src/api.ts";
import type { Hass } from "../src/types.ts";

function recorder() {
  const calls: Record<string, unknown>[] = [];
  const hass = { callWS: async (message: Record<string, unknown>) => { calls.push(message); return null; } } as unknown as Hass;
  return { hass, calls };
}

describe("errorCode", () => {
  it("reads the code Home Assistant sends with a failed command", () => {
    assert.equal(api.errorCode({ code: "unauthorized", message: "x" }), "unauthorized");
  });

  it("copes with anything else", () => {
    for (const error of [null, undefined, "boom", new Error("x"), 5]) assert.equal(api.errorCode(error), "unknown");
  });
});

describe("commands", () => {
  it("asks for the panel, as a previewed person only when told to", async () => {
    const { hass, calls } = recorder();
    await api.panel(hass, "e1");
    await api.panel(hass, "e1", "person.anna");
    assert.deepEqual(calls, [
      { type: "config_entry_panel/panel", entry_id: "e1" },
      { type: "config_entry_panel/panel", entry_id: "e1", as_person: "person.anna" },
    ]);
  });

  it("sends the steps of a flow with and without input", async () => {
    const { hass, calls } = recorder();
    await api.optionsStart(hass, "e1");
    await api.optionsStep(hass, "f1");
    await api.optionsStep(hass, "f1", { a: 1 });
    await api.optionsAbort(hass, "f1");
    assert.deepEqual(calls.map((call) => call.type), ["config_entry_panel/options/start", "config_entry_panel/options/step", "config_entry_panel/options/step", "config_entry_panel/options/abort"]);
    assert.equal("user_input" in (calls[1] ?? {}), false);
    assert.deepEqual(calls[2]?.user_input, { a: 1 });
  });

  it("flattens a rule into the command that saves it", async () => {
    const { hass, calls } = recorder();
    await api.personSet(hass, "e1", "person.anna", { sections: ["devices"], configure: true, reload: false, hidden_entities: ["a.b"], hidden_patterns: ["x"] });
    await api.hiddenSet(hass, "e1", ["a.b"], ["x"]);
    await api.personRemove(hass, "e1", "person.anna");
    assert.deepEqual(calls[0], { type: "config_entry_panel/access/person/set", entry_id: "e1", person: "person.anna", sections: ["devices"], configure: true, reload: false, hidden_entities: ["a.b"], hidden_patterns: ["x"] });
    assert.deepEqual(calls[1], { type: "config_entry_panel/access/hidden/set", entry_id: "e1", hidden_entities: ["a.b"], hidden_patterns: ["x"] });
    assert.deepEqual(calls[2], { type: "config_entry_panel/access/person/remove", entry_id: "e1", person: "person.anna" });
  });
});
