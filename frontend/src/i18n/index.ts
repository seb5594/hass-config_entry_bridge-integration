// Texts: the card's own translations, plus Home Assistant's own words wherever it already has them.
// Home Assistant knows every language it supports for terms such as "Devices", "Reload" or "Diagnostic",
// so those are asked from `hass.localize` first and the bundled texts only fill the gaps.
import type { Hass } from "../types.ts";
import de from "../translations/de.json" with { type: "json" };
import en from "../translations/en.json" with { type: "json" };
import es from "../translations/es.json" with { type: "json" };
import fr from "../translations/fr.json" with { type: "json" };
import it from "../translations/it.json" with { type: "json" };
import nl from "../translations/nl.json" with { type: "json" };

type Tree = { [key: string]: string | Tree };

export const BUNDLED: Record<string, Tree> = { en, de, fr, es, it, nl };

/** Our key -> the key Home Assistant uses for the same word. */
export const HOME_ASSISTANT_KEYS: Record<string, string> = {
  "settings.integration": "ui.panel.config.entities.picker.headers.integration",
  "devices.area": "ui.panel.config.entities.picker.headers.area",
  "devices.title": "ui.panel.config.integrations.integration_page.entries_device",
  "groups.control": "ui.panel.config.devices.entities.control",
  "groups.sensor": "ui.panel.config.devices.entities.sensor",
  "groups.config": "ui.panel.config.devices.entities.config",
  "groups.diagnostic": "ui.panel.config.devices.entities.diagnostic",
  "menu.configure": "ui.panel.config.integrations.config_entry.configure",
  "menu.reload": "ui.panel.config.integrations.config_entry.reload",
  "flow.cancel": "ui.common.cancel",
  "flow.close": "ui.common.close",
  "flow.next": "ui.common.next",
  "flow.submit": "ui.common.save",
  "editor.add": "ui.common.add",
  "editor.remove": "ui.common.remove",
  "editor.entities": "ui.panel.config.devices.entities.entities",
};

export function lookup(tree: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function fill(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** The bundled text for a language, falling back from `pt-BR` to `pt` to English. */
export function bundled(language: string, key: string): string | undefined {
  const candidates = [language, language.split("-")[0] ?? "", "en"];
  for (const candidate of candidates) {
    const tree = BUNDLED[candidate];
    const found = tree ? lookup(tree, key) : undefined;
    if (found) return found;
  }
  return undefined;
}

export function translate(hass: Hass | undefined, key: string, values: Record<string, string | number> = {}): string {
  const haKey = HOME_ASSISTANT_KEYS[key];
  if (hass && haKey) {
    const text = hass.localize(haKey);
    // Home Assistant answers with an empty text, or the key itself, for words it does not have.
    if (text && text !== haKey) return text;
  }
  return fill(bundled(hass?.language ?? "en", key) ?? key, values);
}
