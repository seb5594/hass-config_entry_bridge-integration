// Every call to the integration's websocket API in one place.
import type { AccessInfo, EntryChoice, FlowResult, Hass, Panel, Person, Policy, Rule } from "./types.ts";

const D = "config_entry_panel";

/** Home Assistant answers a failed websocket command with an object that has a `code`. */
export function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "unknown";
}

export const panel = (hass: Hass, entryId: string, asPerson?: string) =>
  hass.callWS<Panel>({ type: `${D}/panel`, entry_id: entryId, ...(asPerson ? { as_person: asPerson } : {}) });

export const reload = (hass: Hass, entryId: string) => hass.callWS<null>({ type: `${D}/reload`, entry_id: entryId });

export const optionsStart = (hass: Hass, entryId: string) => hass.callWS<FlowResult>({ type: `${D}/options/start`, entry_id: entryId });

export const optionsStep = (hass: Hass, flowId: string, userInput?: Record<string, unknown>) =>
  hass.callWS<FlowResult>({ type: `${D}/options/step`, flow_id: flowId, ...(userInput ? { user_input: userInput } : {}) });

export const optionsAbort = (hass: Hass, flowId: string) => hass.callWS<null>({ type: `${D}/options/abort`, flow_id: flowId });

// --- administrators ---

export const entries = (hass: Hass) => hass.callWS<EntryChoice[]>({ type: `${D}/entries` });
export const people = (hass: Hass) => hass.callWS<Person[]>({ type: `${D}/people` });
export const accessGet = (hass: Hass, entryId: string) => hass.callWS<AccessInfo>({ type: `${D}/access/get`, entry_id: entryId });

export const personSet = (hass: Hass, entryId: string, person: string, rule: Rule) =>
  hass.callWS<Policy>({ type: `${D}/access/person/set`, entry_id: entryId, person, ...rule });

export const personRemove = (hass: Hass, entryId: string, person: string) =>
  hass.callWS<Policy>({ type: `${D}/access/person/remove`, entry_id: entryId, person });

export const hiddenSet = (hass: Hass, entryId: string, hiddenEntities: string[], hiddenPatterns: string[]) =>
  hass.callWS<Policy>({ type: `${D}/access/hidden/set`, entry_id: entryId, hidden_entities: hiddenEntities, hidden_patterns: hiddenPatterns });
