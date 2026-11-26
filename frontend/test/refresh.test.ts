import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classify, isDefinitive, isStale, REFRESH_EVERY_MS, retryDelay, RETRY_DELAYS, STALE_AFTER_MS } from "../src/logic/refresh.ts";

describe("classify", () => {
  it("hides the card only for the answer that says the viewer may not see it", () => {
    assert.equal(classify("unauthorized"), "hide");
  });

  it("reports a deleted config entry", () => {
    assert.equal(classify("not_found"), "missing");
  });

  it("treats everything else as temporary, so a shown card is never taken away by a hiccup", () => {
    for (const code of ["3", "1", "unknown", "unknown_command", "not_loaded", "timeout", "home_assistant_error"]) assert.equal(classify(code), "retry", code);
  });

  it("knows which answers are final", () => {
    assert.deepEqual(["unauthorized", "not_found", "3", "not_loaded"].map(isDefinitive), [true, true, false, false]);
  });
});

describe("retryDelay", () => {
  it("waits longer after every failure and then keeps the longest wait", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 50].map((attempt) => retryDelay(attempt)), [2_000, 5_000, 15_000, 60_000, 60_000, 60_000]);
  });

  it("copes with a negative attempt and with a custom schedule", () => {
    assert.equal(retryDelay(-3), RETRY_DELAYS[0]);
    assert.equal(retryDelay(1, [10, 20]), 20);
    assert.equal(retryDelay(9, [10, 20]), 20);
  });

  it("never asks more often than every two seconds after a failure", () => {
    assert.ok(Math.min(...RETRY_DELAYS) >= 2_000);
  });
});

describe("isStale", () => {
  it("is stale without a load and after the limit", () => {
    assert.equal(isStale(undefined, 1_000), true);
    assert.equal(isStale(0, STALE_AFTER_MS), true);
  });

  it("is fresh before the limit", () => {
    assert.equal(isStale(1_000, 1_000 + STALE_AFTER_MS - 1), false);
  });

  it("refreshes a visible card every few minutes, not every few seconds", () => {
    assert.ok(REFRESH_EVERY_MS >= 60_000);
  });
});
