import { ConfigEntryPanel } from "./card/card.ts";
import { OptionsDialog } from "./card/options-dialog.ts";
import { ConfigEntryPanelEditor } from "./editor/editor.ts";
import { bundled } from "./i18n/index.ts";

declare const __PANEL_VERSION__: string;

customElements.define("config-entry-panel", ConfigEntryPanel);
customElements.define("config-entry-panel-options", OptionsDialog);
customElements.define("config-entry-panel-editor", ConfigEntryPanelEditor);

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean; documentationURL?: string }[];
  }
}

/** The language of the running Home Assistant; the card picker reads the texts below only when it opens. */
function language(): string {
  const root = document.querySelector("home-assistant") as { hass?: { language?: string } } | null;
  return root?.hass?.language ?? navigator.language ?? "en";
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: "config-entry-panel",
  // A product name is not translated; the description is, in the language of the user.
  get name() {
    return bundled(language(), "card.name") ?? "Config Entry Panel";
  },
  get description() {
    return bundled(language(), "card.description") ?? "";
  },
  preview: false,
  documentationURL: "https://github.com/seb5594/hass-config_entry_panel-integration",
});

console.info(`%c CONFIG ENTRY PANEL %c ${typeof __PANEL_VERSION__ === "string" ? __PANEL_VERSION__ : "dev"} `, "color:#fff;background:#1877a5;font-weight:700", "color:#1877a5;background:#fff;font-weight:700");
