import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import * as api from "../api.ts";
import { translate } from "../i18n/index.ts";
import { deviceIcon, deviceSubtitle, toneOf } from "../logic/format.ts";
import type { Hass, Panel, PanelDevice, PanelEntity } from "../types.ts";
import { fire, insideEditor } from "../util/dom.ts";
import { cardStyles } from "./styles.ts";
import type { OptionsDialog } from "./options-dialog.ts";

const RELOAD_SETTLE_MS = 1200;
const NOTICE_MS = 4000;

type Note = { kind: "ok" | "error"; text: string } | null;

export class ConfigEntryPanel extends LitElement {
  static override properties = {
    hass: { attribute: false },
    /** Editor preview: the person whose view an administrator wants to see. */
    previewPerson: { attribute: "preview-person" },
    _config: { state: true },
    _configError: { state: true },
    _panel: { state: true },
    _failure: { state: true },
    _menuOpen: { state: true },
    _busy: { state: true },
    _note: { state: true },
  };
  static override styles = cardStyles;

  declare hass: Hass;
  declare previewPerson: string | undefined;
  declare _config: { entry_id: string; title?: string } | undefined;
  declare _configError: string | undefined;
  declare _panel: Panel | undefined;
  declare _failure: string | undefined;
  declare _menuOpen: boolean;
  declare _busy: boolean;
  declare _note: Note;
  private _loadedFor: string | undefined;
  private _loading = false;
  private _shown: boolean | undefined;
  private _watched: string[] = [];
  private _closeMenu = (event: Event) => {
    if (!event.composedPath().includes(this.renderRoot.querySelector(".tools") as EventTarget)) this._menuOpen = false;
  };
  private _escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") this._menuOpen = false;
  };

  constructor() {
    super();
    this._menuOpen = false;
    this._busy = false;
    this._note = null;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("config-entry-panel-editor");
  }

  static getStubConfig(): Record<string, unknown> {
    return { type: "custom:config-entry-panel", entry_id: "" };
  }

  setConfig(raw: unknown): void {
    const config = raw as { entry_id?: unknown; title?: unknown } | null;
    if (typeof config !== "object" || config === null || (config.entry_id !== undefined && typeof config.entry_id !== "string")) {
      this._config = undefined;
      this._configError = "The card needs an entry_id";
      return;
    }
    this._configError = undefined;
    this._config = { entry_id: (config.entry_id ?? "").trim(), ...(typeof config.title === "string" && config.title ? { title: config.title } : {}) };
    this._panel = undefined;
    this._failure = undefined;
    this._loadedFor = undefined;
  }

  /** Fetches the panel again, for example after the editor changed a rule. */
  refresh(): void {
    this._loadedFor = undefined;
    this.requestUpdate();
  }

  getCardSize(): number {
    return this._shown === false ? 0 : 6;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  private t = (key: string, values?: Record<string, string | number>) => translate(this.hass, key, values);

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this._closeMenu);
    document.addEventListener("keydown", this._escape);
  }

  override disconnectedCallback(): void {
    document.removeEventListener("click", this._closeMenu);
    document.removeEventListener("keydown", this._escape);
    super.disconnectedCallback();
  }

  /** Re-render for a new `hass` only when something this card shows has changed. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    const previous = changed.get("hass") as Hass | undefined;
    if (changed.size !== 1 || !previous) return true;
    if (previous.user !== this.hass.user || previous.language !== this.hass.language) return true;
    return this._watched.some((id) => previous.states[id] !== this.hass.states[id]);
  }

  protected override willUpdate(): void {
    if (this.hass && this._config?.entry_id && this._loadedFor !== this._config.entry_id && !this._loading) void this._load();
  }

  /** A card nobody may see hides itself (and tells the dashboard) until the server has said it may be shown. */
  protected override updated(): void {
    const allowed = Boolean(this._panel?.caps.visible);
    const shown = allowed || Boolean(this.previewPerson) || (insideEditor(this) && Boolean(this._config));
    this.toggleAttribute("hidden", !shown);
    if (this._shown !== shown) {
      this._shown = shown;
      fire(this, "card-visibility-changed", { value: shown });
    }
  }

  private async _load(): Promise<void> {
    const entryId = this._config?.entry_id;
    if (!entryId) return;
    this._loading = true;
    this._loadedFor = entryId;
    try {
      const panel = await api.panel(this.hass, entryId, this.previewPerson);
      if (this._config?.entry_id === entryId) {
        this._panel = panel;
        this._failure = undefined;
      }
    } catch (error) {
      if (this._config?.entry_id !== entryId) return;
      const code = api.errorCode(error);
      this._panel = undefined;
      // "unauthorized" is the normal answer for everybody who may not see the card: say nothing.
      this._failure = code === "unauthorized" ? undefined : code === "not_found" ? this.t("card.entry_missing") : code === "unknown_command" || code === "not_loaded" ? this.t("card.not_installed") : this.t("card.load_failed", { message: (error as { message?: string }).message ?? code });
    } finally {
      this._loading = false;
    }
  }

  protected override render(): TemplateResult | typeof nothing {
    if (this._configError) return html`<ha-card><div class="notice error">${this._configError}</div></ha-card>`;
    if (!this._config || !this.hass) return nothing;
    if (!this._config.entry_id) return html`<ha-card><div class="notice">${this.t("card.pick_entry")}</div></ha-card>`;
    const preview = this.previewPerson ? html`<div class="banner"><ha-icon icon="mdi:eye"></ha-icon>${this.t("card.preview_banner", { person: this._personName(this.previewPerson) })}</div>` : nothing;
    const panel = this._panel;
    if (!panel) return this._renderWithout(preview);
    this._watched = panel.devices.flatMap((device) => device.groups.flatMap((group) => group.entities.map((entity) => entity.entity_id)));
    return html`<ha-card>${preview}${this._renderEntry(panel)}${panel.settings ? this._renderSettings(panel) : nothing}${panel.caps.devices ? this._renderDevices(panel) : nothing}</ha-card>`;
  }

  /** Nothing to show: an error for those who can act on it, a note in the editor, else not even a frame. */
  private _renderWithout(preview: TemplateResult | typeof nothing): TemplateResult | typeof nothing {
    this._watched = [];
    if (this.previewPerson && !this._failure) {
      return html`<ha-card>${preview}<div class="notice"><ha-icon icon="mdi:eye-off"></ha-icon><div><strong>${this.t("card.preview_hidden", { person: this._personName(this.previewPerson) })}</strong><br>${this.t("card.preview_hidden_hint")}</div></div></ha-card>`;
    }
    if (this._failure && (this.hass.user.is_admin || insideEditor(this))) {
      return html`<ha-card>${preview}<div class="notice error"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${this._failure}</div></ha-card>`;
    }
    if (insideEditor(this)) {
      return html`<ha-card><div class="notice dashed"><ha-icon icon="mdi:eye-off"></ha-icon>${this.t("card.hidden_in_editor")}</div></ha-card>`;
    }
    return nothing;
  }

  private _personName(id: string): string {
    const name = this.hass.states[id]?.attributes.friendly_name;
    return typeof name === "string" ? name : id;
  }

  private _renderEntry(panel: Panel): TemplateResult {
    const { entry, caps } = panel;
    const preview = Boolean(this.previewPerson);
    const tone = toneOf(entry.state, entry.disabled_by);
    const stateText = this.hass.localize(`ui.panel.config.integrations.config_entry.state.${entry.state}`) || entry.state;
    const gear = caps.configure && entry.supports_options;
    return html`<div class="entry">
        <ha-icon icon="mdi:puzzle-outline"></ha-icon>
        <div class="heading">
          <div class="title">${this._config?.title || entry.title}</div>
          <div class="subtitle"><span>${entry.domain}</span><span class="chip ${tone}">${stateText}</span></div>
        </div>
        <div class="tools">
          ${gear ? html`<button class="icon" aria-label=${this.t("menu.configure")} title=${this.t("menu.configure")} ?disabled=${preview} @click=${() => void this._configure()}><ha-icon icon="mdi:cog-outline"></ha-icon></button>` : nothing}
          ${caps.reload ? html`<button class="icon" aria-label=${this.t("menu.more")} aria-haspopup="menu" aria-expanded=${this._menuOpen} ?disabled=${preview} @click=${() => (this._menuOpen = !this._menuOpen)}><ha-icon icon="mdi:dots-vertical"></ha-icon></button>` : nothing}
          ${this._menuOpen ? html`<div class="menu" role="menu"><button role="menuitem" ?disabled=${this._busy} @click=${() => void this._reload()}><ha-icon icon="mdi:reload"></ha-icon>${this._busy ? this.t("menu.reloading") : this.t("menu.reload")}</button></div>` : nothing}
        </div>
      </div>
      ${this._note ? html`<div class="reason ${this._note.kind === "error" ? "error" : ""}" role="status">${this._note.text}</div>` : nothing}
      ${panel.settings?.reason ? html`<div class="reason">${panel.settings.reason}</div>` : nothing}`;
  }

  private _renderSettings(panel: Panel): TemplateResult {
    const settings = panel.settings;
    if (!settings) return html``;
    const on = (flag: boolean, yes: string, no: string) => this.t(flag ? yes : no);
    return html`<dl class="facts">
      <dt>${this.t("settings.source")}</dt><dd>${settings.source}</dd>
      <dt>${this.t("settings.polling")}</dt><dd>${on(!settings.pref_disable_polling, "settings.polling_on", "settings.polling_off")}</dd>
      <dt>${this.t("settings.new_entities")}</dt><dd>${on(!settings.pref_disable_new_entities, "settings.new_entities_on", "settings.new_entities_off")}</dd>
      ${panel.entry.entry_id ? html`<dt>${this.t("settings.entry_id")}</dt><dd>${panel.entry.entry_id}</dd>` : nothing}
    </dl>`;
  }

  private _renderDevices(panel: Panel): TemplateResult {
    const devices = panel.devices;
    return html`<div class="devices">
      <h2>${this.t("devices.title")}</h2>
      ${devices.length === 0 ? html`<div class="none">${this.t("card.no_entities")}</div>` : devices.map((device) => this._renderDevice(device, devices.length <= 2))}
    </div>`;
  }

  private _renderDevice(device: PanelDevice, open: boolean): TemplateResult {
    const type = device.entry_type === "service" ? this.hass.localize("ui.panel.config.devices.type.service_heading") : null;
    const firmware = device.sw_version ? this.hass.localize("ui.panel.config.integrations.config_entry.firmware", "version", device.sw_version) : null;
    const subtitle = deviceSubtitle(device, type, firmware);
    return html`<details class="device" ?open=${open}>
      <summary>
        <ha-icon icon=${deviceIcon(device)}></ha-icon>
        <div class="device-text"><div class="device-name">${device.id === null ? this.t("card.no_device") : device.name}</div>${subtitle ? html`<div class="device-info">${subtitle}</div>` : nothing}</div>
        <ha-icon class="chevron" icon="mdi:chevron-down"></ha-icon>
      </summary>
      ${device.groups.map((entry) => this._renderGroup(entry))}
    </details>`;
  }

  private _renderGroup(entry: PanelDevice["groups"][number]): TemplateResult {
    return html`<div class="group"><h3>${this.t(`groups.${entry.group}`)}</h3>${entry.entities.map((entity) => this._renderEntity(entity))}</div>`;
  }

  private _renderEntity(entity: PanelEntity): TemplateResult {
    const state = this.hass.states[entity.entity_id];
    const text = state ? (this.hass.formatEntityState?.(state) ?? state.state) : "–";
    return html`<button class="entity" title=${entity.entity_id} @click=${() => fire(this, "hass-more-info", { entityId: entity.entity_id })}>
      ${state ? html`<ha-state-icon .hass=${this.hass} .stateObj=${state}></ha-state-icon>` : html`<ha-icon icon="mdi:help-circle-outline"></ha-icon>`}
      <span class="name">${entity.name}</span><span class="state">${text}</span>
    </button>`;
  }

  private async _configure(): Promise<void> {
    const entry = this._panel?.entry;
    const entryId = this._config?.entry_id;
    if (!entry || !entryId) return;
    const dialog = document.createElement("config-entry-panel-options") as OptionsDialog;
    dialog.hass = this.hass;
    dialog.entryId = entryId;
    dialog.domain = entry.domain;
    dialog.heading = this._config?.title || entry.title;
    dialog.addEventListener("flow-finished", (event) => {
      this._notice("ok", this.t((event as CustomEvent<{ saved: boolean }>).detail.saved ? "flow.saved" : "flow.closed"));
      void this._load();
    });
    dialog.addEventListener("closed", () => dialog.remove());
    this.renderRoot.append(dialog);
    await dialog.open();
  }

  private async _reload(): Promise<void> {
    const entryId = this._config?.entry_id;
    if (!entryId) return;
    this._busy = true;
    try {
      await api.reload(this.hass, entryId);
      await new Promise((resolve) => setTimeout(resolve, RELOAD_SETTLE_MS));
      this._menuOpen = false;
      await this._load();
      this._notice("ok", this.t("menu.reloaded"));
    } catch (error) {
      this._notice("error", this.t("menu.failed", { message: (error as { message?: string }).message ?? api.errorCode(error) }));
    } finally {
      this._busy = false;
    }
  }

  private _notice(kind: "ok" | "error", text: string): void {
    this._note = { kind, text };
    setTimeout(() => {
      if (this._note?.text === text) this._note = null;
    }, NOTICE_MS);
  }
}
