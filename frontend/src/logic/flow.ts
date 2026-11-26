// Turning the steps of an options flow into what the dialog needs. Pure functions, no DOM.
import type { FlowResult, SchemaField } from "../types.ts";

/** The values a form starts with: a suggested value, else the default, for every field (also inside sections). */
export function initialData(schema: SchemaField[] | undefined): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of schema ?? []) {
    if (field.type === "expandable" && field.schema) {
      data[field.name] = initialData(field.schema);
    } else if (field.type === "grid" && field.schema) {
      Object.assign(data, initialData(field.schema)); // a grid only lays its fields out side by side
    } else {
      const value = field.description?.suggested_value ?? field.default;
      if (value !== undefined) data[field.name] = value;
    }
  }
  return data;
}

/** The data to send: fields that were never filled in are left out, as Home Assistant's own dialog does. */
export function submittable(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    result[key] = isPlain(value) ? submittable(value) : value;
  }
  return result;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const prefix = (domain: string) => `component.${domain}.options`;

export const keys = {
  title: (domain: string, step: string) => `${prefix(domain)}.step.${step}.title`,
  description: (domain: string, step: string) => `${prefix(domain)}.step.${step}.description`,
  label: (domain: string, step: string, field: string) => `${prefix(domain)}.step.${step}.data.${field}`,
  helper: (domain: string, step: string, field: string) => `${prefix(domain)}.step.${step}.data_description.${field}`,
  menu: (domain: string, step: string, option: string) => `${prefix(domain)}.step.${step}.menu_options.${option}`,
  error: (domain: string, code: string) => `${prefix(domain)}.error.${code}`,
  abort: (domain: string, reason: string) => `${prefix(domain)}.abort.${reason}`,
};

/** `menu_options` is a list of step ids or a mapping from id to label. */
export function menuEntries(result: FlowResult): { id: string; label: string | null }[] {
  const options = result.menu_options;
  if (Array.isArray(options)) return options.map((id) => ({ id, label: null }));
  return Object.entries(options ?? {}).map(([id, label]) => ({ id, label }));
}

export function isOpen(result: FlowResult): boolean {
  return result.type === "form" || result.type === "menu";
}

/** Texts with `{placeholders}` filled in from the flow's `description_placeholders`. */
export function fillPlaceholders(text: string, placeholders: Record<string, string> | null | undefined): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => placeholders?.[name] ?? match);
}
