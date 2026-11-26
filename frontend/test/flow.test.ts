import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillPlaceholders, initialData, isOpen, keys, menuEntries, submittable } from "../src/logic/flow.ts";
import type { FlowResult } from "../src/types.ts";

describe("initialData", () => {
  it("starts with defaults, and a suggested value wins", () => {
    const data = initialData([
      { name: "host", default: "localhost" },
      { name: "port", default: 80, description: { suggested_value: 8080 } },
      { name: "token" },
    ]);
    assert.deepEqual(data, { host: "localhost", port: 8080 });
  });

  it("keeps false and zero, which are real values", () => {
    assert.deepEqual(initialData([{ name: "on", default: false }, { name: "n", default: 0 }]), { on: false, n: 0 });
  });

  it("nests the fields of an expandable section and flattens a grid", () => {
    const data = initialData([
      { name: "advanced", type: "expandable", schema: [{ name: "timeout", default: 10 }] },
      { name: "pair", type: "grid", schema: [{ name: "a", default: 1 }, { name: "b", default: 2 }] },
    ]);
    assert.deepEqual(data, { advanced: { timeout: 10 }, a: 1, b: 2 });
  });

  it("copes with a step that has no schema", () => {
    assert.deepEqual(initialData(undefined), {});
    assert.deepEqual(initialData([]), {});
  });
});

describe("submittable", () => {
  it("leaves out what was never filled in, also in sections", () => {
    assert.deepEqual(submittable({ a: 1, b: undefined, s: { c: undefined, d: "x" } }), { a: 1, s: { d: "x" } });
  });

  it("keeps lists and empty strings as they are", () => {
    assert.deepEqual(submittable({ list: [1, 2], text: "" }), { list: [1, 2], text: "" });
  });
});

describe("translation keys", () => {
  it("follow the layout of Home Assistant's own options flow texts", () => {
    assert.equal(keys.label("demo", "init", "host"), "component.demo.options.step.init.data.host");
    assert.equal(keys.helper("demo", "init", "host"), "component.demo.options.step.init.data_description.host");
    assert.equal(keys.description("demo", "init"), "component.demo.options.step.init.description");
    assert.equal(keys.title("demo", "init"), "component.demo.options.step.init.title");
    assert.equal(keys.menu("demo", "init", "next"), "component.demo.options.step.init.menu_options.next");
    assert.equal(keys.error("demo", "cannot_connect"), "component.demo.options.error.cannot_connect");
    assert.equal(keys.abort("demo", "done"), "component.demo.options.abort.done");
  });
});

describe("menus and steps", () => {
  it("reads menu options given as a list or as a mapping", () => {
    assert.deepEqual(menuEntries({ type: "menu", flow_id: "f", menu_options: ["a", "b"] }), [{ id: "a", label: null }, { id: "b", label: null }]);
    assert.deepEqual(menuEntries({ type: "menu", flow_id: "f", menu_options: { a: "Alpha" } }), [{ id: "a", label: "Alpha" }]);
    assert.deepEqual(menuEntries({ type: "menu", flow_id: "f" }), []);
  });

  it("knows which steps keep the flow open", () => {
    const result = (type: string): FlowResult => ({ type, flow_id: "f" });
    assert.deepEqual(["form", "menu", "create_entry", "abort", "external"].map((type) => isOpen(result(type))), [true, true, false, false, false]);
  });

  it("fills placeholders and leaves unknown ones", () => {
    assert.equal(fillPlaceholders("Hello {name}, {other}", { name: "Anna" }), "Hello Anna, {other}");
    assert.equal(fillPlaceholders("x {a}", null), "x {a}");
  });
});
