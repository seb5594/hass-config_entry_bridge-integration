import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deviceIcon, deviceSubtitle, toneOf } from "../src/logic/format.ts";
import type { PanelDevice } from "../src/types.ts";

const device = (extra: Partial<PanelDevice> = {}): PanelDevice => ({
  id: "d", name: "Hub", manufacturer: "Acme", model: "H1", sw_version: null, hw_version: null, area: null, entry_type: null, groups: [], ...extra,
});

describe("deviceSubtitle", () => {
  it("joins what is known, in the order of Home Assistant's device rows", () => {
    assert.equal(deviceSubtitle(device(), "Service", "Firmware: 1.2"), "Service · Acme · H1 · Firmware: 1.2");
  });

  it("skips what is missing", () => {
    assert.equal(deviceSubtitle(device({ manufacturer: null, model: null }), null, null), "");
    assert.equal(deviceSubtitle(device({ model: null }), null, null), "Acme");
  });
});

describe("deviceIcon", () => {
  it("tells services from devices from the entities without a device", () => {
    assert.equal(deviceIcon(device({ entry_type: "service" })), "mdi:cloud-outline");
    assert.equal(deviceIcon(device()), "mdi:devices");
    assert.equal(deviceIcon(device({ id: null })), "mdi:shape-outline");
  });
});

describe("toneOf", () => {
  it("colours the state of a config entry", () => {
    assert.equal(toneOf("loaded", null), "ok");
    assert.equal(toneOf("setup_in_progress", null), "busy");
    assert.equal(toneOf("setup_error", null), "problem");
    assert.equal(toneOf("setup_retry", null), "problem");
    assert.equal(toneOf("not_loaded", null), "idle");
    assert.equal(toneOf("something_new", null), "idle");
  });

  it("shows a disabled entry as idle whatever its state", () => {
    assert.equal(toneOf("loaded", "user"), "idle");
  });
});
