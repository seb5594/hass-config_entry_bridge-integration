// Small text helpers for the cards rows.
import type { PanelDevice } from "../types.ts";

/** "Service · Acme · L1": what Home Assistant's own device rows show below the name. */
export function deviceSubtitle(device: PanelDevice, typeLabel: string | null, firmware: string | null): string {
  return [typeLabel, device.manufacturer, device.model, firmware].filter((part): part is string => Boolean(part)).join(" · ");
}

export function deviceIcon(device: PanelDevice): string {
  if (device.id === null) return "mdi:shape-outline";
  return device.entry_type === "service" ? "mdi:cloud-outline" : "mdi:devices";
}

export type Tone = "ok" | "busy" | "idle" | "problem";

const TONES: Record<string, Tone> = {
  loaded: "ok",
  setup_in_progress: "busy",
  unload_in_progress: "busy",
  not_loaded: "idle",
  setup_retry: "problem",
  setup_error: "problem",
  migration_error: "problem",
  failed_unload: "problem",
};

/** The colour of the state chip of a config entry. */
export function toneOf(state: string, disabledBy: string | null): Tone {
  return disabledBy ? "idle" : TONES[state] ?? "idle";
}
