import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidPattern, matches, MAX_PATTERN_LENGTH } from "../src/logic/patterns.ts";

describe("isValidPattern", () => {
  it("accepts ordinary expressions", () => {
    for (const pattern of ["_rssi$", "^(sensor|binary_sensor)\\.", "a+b*c?", "signal"]) assert.equal(isValidPattern(pattern), true, pattern);
  });

  it("refuses empty, broken and oversized ones", () => {
    for (const pattern of ["", "  ", "(", "[a-", "a".repeat(MAX_PATTERN_LENGTH + 1)]) assert.equal(isValidPattern(pattern), false, pattern);
  });

  it("refuses the ones the server refuses because they can run for minutes", () => {
    for (const pattern of ["(a+)+$", "(.*)*x", "(a*){2,}", "^(\\w+\\s?)*$"]) assert.equal(isValidPattern(pattern), false, pattern);
  });
});

describe("matches", () => {
  it("looks at the id and the name, ignoring case", () => {
    assert.equal(matches("sensor.lamp_rssi", "Lamp", ["_RSSI$"]), true);
    assert.equal(matches("sensor.a", "Signal strength", ["signal"]), true);
    assert.equal(matches("sensor.a", "Power", ["signal"]), false);
  });

  it("ignores invalid patterns", () => {
    assert.equal(matches("sensor.a", "x", ["(", "(a+)+"]), false);
  });
});
