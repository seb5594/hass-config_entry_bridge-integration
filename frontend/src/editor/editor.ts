import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import * as api from "../api.ts";
import { translate } from "../i18n/index.ts";
import { isValidPattern } from "../logic/patterns.ts";
import type { AccessInfo, EntryChoice, Hass, Person, Policy, Rule } from "../types.ts";
import { fire } from "../util/dom.ts";

const FILTER_FROM = 12;
const NEW_PATTERN = "_";
const NEW_RULE: Rule = { sections: ["settings", "devices"], configure: false, reload: false, hidden_entities: [], hidden_patterns: [] };

type Status = { kind: "saving" | "saved" | "error"; text: string } | null;

/** The card editor. Who sees what is saved on the server at once; only the entry and the title live in the YAML. */
export class ConfigEntryPanelEditor extends LitElement {
  static override properties = {
    hass: { attribute: false },
    _config: { state: true },
    _entries: { state: true },
    _people: { state: true },
    _access: { state: true },
    _preview: { state: true },
    _newPerson: { state: true },
    _filters: { state: true },
    _status: { state: true },
    _failure: { state: true },
  };

  static override styles = css`
    :host { display: block; }
    .stack { display: grid; gap: 22px; }
    h3 { margin: 0 0 4px; font-size: 1rem; font-weight: 500; }
    .hint { color: var(--secondary-text-color); font-size: 0.85rem; margin: 2px 0 8px; }
    .note { padding: 8px 12px; border-radius: 8px; background: var(--secondary-background-color); font-size: 0.85rem; color: var(--secondary-text-color); }
    .warn { padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--warning-color, #ff9800) 18%, transparent); font-size: 0.85rem; }
    label.field { display: grid; gap: 4px; font-size: 0.85rem; color: var(--secondary-text-color); }
    select, input[type="text"] { width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; color: var(--primary-text-color); background: var(--card-background-color); border: 1px solid var(--divider-color); border-radius: 8px; }
    input.invalid { border-color: var(--error-color); }
    label.check { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; cursor: pointer; color: var(--primary-text-color); }
    label.check input { margin-top: 3px; accent-color: var(--primary-color); }
    .row { display: flex; gap: 8px; align-items: center; }
    .row > :first-child { flex: 1; }
    button { font: inherit; cursor: pointer; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--divider-color); background: transparent; color: var(--primary-color); }
    button.danger { color: var(--error-color); }
    button:disabled { opacity: 0.5; cursor: default; }
    details.person { border: 1px solid var(--divider-color); border-radius: 12px; margin-bottom: 8px; }
    details.person > summary { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; list-style: none; }
    details.person > summary::-webkit-details-marker { display: none; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: var(--secondary-background-color); display: grid; place-items: center; flex: none; color: var(--secondary-text-color); }
    .who { flex: 1; min-width: 0; }
    .chip { font-size: 0.75rem; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--divider-color); color: var(--secondary-text-color); margin-left: 6px; }
    .body { padding: 4px 14px 14px; display: grid; gap: 12px; }
    fieldset { border: 0; padding: 0; margin: 0; }
    legend { padding: 0; font-size: 0.8rem; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.05em; }
    .device-title { margin: 10px 0 2px; font-weight: 500; font-size: 0.9rem; color: var(--primary-text-color); }
    .entity-id { color: var(--secondary-text-color); font-size: 0.8rem; margin-left: 6px; }
    .scroll { max-height: 260px; overflow: auto; border: 1px solid var(--divider-color); border-radius: 8px; padding: 4px 12px 8px; }
    .status { font-size: 0.85rem; }
    .status.saved { color: var(--success-color, #43a047); }
    .status.error { color: var(--error-color); }
    .preview { border: 1px dashed var(--divider-color); border-radius: 12px; padding: 12px; margin-top: 12px; }
  `;

  declare hass: Hass;
  declare _config: { type: string; entry_id: string; title?: string };
  declare _entries: EntryChoice[] | undefined;
  declare _people: Person[];
  declare _access: AccessInfo | undefined;
  declare _preview: string;
  declare _newPerson: string;
  declare _filters: Record<string, string>;
  declare _status: Status;
  declare _failure: string | undefined;
  private _loadedFor: string | undefined;

  constructor() {
    super();
    this._config = { type: "custom:config-entry-panel", entry_id: "" };
    this._people = [];
    this._preview = "";
    this._newPerson = "";
    this._filters = {};
    this._status = null;
  }

  setConfig(raw: unknown): void {
    const config = (raw ?? {}) as { type?: string; entry_id?: unknown; title?: unknown };
    this._config = {
      type: config.type ?? "custom:config-entry-panel",
      entry_id: typeof config.entry_id === "string" ? config.entry_id : "",
      ...(typeof config.title === "string" && config.title ? { title: config.title } : {}),
    };
  }

  private t = (key: string, values?: Record<string, string | number>) => translate(this.hass, key, values);

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && !this._entries) void this._loadStatic();
    if (this.hass && this._entries && this._config.entry_id && this._loadedFor !== this._config.entry_id) {
      this._loadedFor = this._config.entry_id;
      void this._loadAccess();
    }
  }

  private async _loadStatic(): Promise<void> {
    this._entries = [];
    try {
      [this._entries, this._people] = await Promise.all([api.entries(this.hass), api.people(this.hass)]);
    } catch (error) {
      this._failure = api.errorCode(error) === "unknown_command" ? this.t("card.not_installed") : (error as { message?: string }).message;
    }
  }

  private async _loadAccess(): Promise<void> {
    try {
      this._access = await api.accessGet(this.hass, this._config.entry_id);
    } catch {
      this._access = undefined;
    }
  }

  private _emit(patch: Partial<{ entry_id: string; title: string | undefined }>): void {
    const next = { ...this._config, ...patch };
    if (!next.title) delete next.title;
    this._config = next;
    fire(this, "config-changed", { config: next });
  }

  /** Runs one change on the server, shows its outcome, and refreshes the preview. */
  private async _save(change: () => Promise<Policy>): Promise<void> {
    this._status = { kind: "saving", text: this.t("editor.saving") };
    try {
      const policy = await change();
      if (this._access) this._access = { ...this._access, policy };
      this._status = { kind: "saved", text: this.t("editor.saved") };
      (this.renderRoot.querySelector("config-entry-panel") as { refresh?: () => void } | null)?.refresh?.();
    } catch (error) {
      this._status = { kind: "error", text: this.t("editor.save_failed", { message: (error as { message?: string }).message ?? api.errorCode(error) }) };
    }
  }

  private _setRule(person: string, rule: Rule): Promise<void> {
    return this._save(() => api.personSet(this.hass, this._config.entry_id, person, rule));
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    if (this._failure) return html`<div class="warn">${this._failure}</div>`;
    return html`<div class="stack">
      ${this._renderEntry()}
      ${this._config.entry_id ? html`<div class="note">${this.t("editor.rules_note")}</div>
        ${this._renderPeople()}${this._renderGlobalHiding()}${this._renderPreview()}` : nothing}
      ${this._status ? html`<div class="status ${this._status.kind}" role="status">${this._status.text}</div>` : nothing}
    </div>`;
  }

  private _renderEntry(): TemplateResult {
    const entries = this._entries;
    const known = entries?.some((entry) => entry.entry_id === this._config.entry_id) ?? false;
    return html`<div>
      <label class="field">${this.t("editor.entry")}
        <select @change=${(event: Event) => this._emit({ entry_id: (event.target as HTMLSelectElement).value })}>
          ${entries === undefined ? html`<option value="">${this.t("editor.entry_loading")}</option>` : html`<option value="" ?selected=${!this._config.entry_id}>–</option>`}
          ${(entries ?? []).map((entry) => html`<option value=${entry.entry_id} ?selected=${entry.entry_id === this._config.entry_id}>${entry.title} (${entry.domain})</option>`)}
          ${!known && this._config.entry_id ? html`<option value=${this._config.entry_id} selected>${this._config.entry_id}</option>` : nothing}
        </select>
      </label>
      <label class="field" style="margin-top:12px">${this.t("editor.title")}
        <input type="text" .value=${this._config.title ?? ""} @change=${(event: Event) => this._emit({ title: (event.target as HTMLInputElement).value.trim() || undefined })}>
        <span class="hint">${this.t("editor.title_hint")}</span>
      </label>
    </div>`;
  }

  private _person(id: string): Person {
    return this._people.find((person) => person.person === id) ?? { person: id, name: id, picture: null, role: "none" };
  }

  private _renderPeople(): TemplateResult {
    const rules = this._access?.policy.people ?? {};
    const listed = Object.keys(rules);
    const unlisted = this._people.filter((person) => !listed.includes(person.person));
    const selected = unlisted.some((person) => person.person === this._newPerson) ? this._newPerson : unlisted[0]?.person ?? "";
    return html`<div>
      <h3>${this.t("editor.who_title")}</h3>
      <p class="hint">${this.t("editor.who_hint")}</p>
      ${listed.length === 0 ? html`<p class="hint">${this.t("editor.no_one")}</p>` : listed.map((person) => this._renderRule(person, rules[person] as Rule))}
      ${unlisted.length === 0 ? html`<p class="hint">${this.t("editor.no_more_people")}</p>` : html`<div class="row">
        <select aria-label=${this.t("editor.add_person")} @change=${(event: Event) => (this._newPerson = (event.target as HTMLSelectElement).value)}>
          ${unlisted.map((person) => html`<option value=${person.person} ?selected=${person.person === selected}>${person.name}</option>`)}
        </select>
        <button @click=${() => { this._preview = selected; void this._setRule(selected, NEW_RULE); }}>${this.t("editor.add")}</button>
      </div>`}
    </div>`;
  }

  private _renderRule(personId: string, rule: Rule): TemplateResult {
    const person = this._person(personId);
    const section = (name: "settings" | "devices", label: string) => html`<label class="check"><input type="checkbox" .checked=${rule.sections.includes(name)}
      @change=${(event: Event) => {
        const checked = (event.target as HTMLInputElement).checked;
        const sections = (["settings", "devices"] as const).filter((item) => (item === name ? checked : rule.sections.includes(item)));
        if (sections.length === 0) { (event.target as HTMLInputElement).checked = true; return; } // the last one stays: remove the person instead
        void this._setRule(personId, { ...rule, sections: [...sections] });
      }}>${label}</label>`;
    const action = (name: "configure" | "reload", label: string) => html`<label class="check"><input type="checkbox" .checked=${rule[name]}
      @change=${(event: Event) => void this._setRule(personId, { ...rule, [name]: (event.target as HTMLInputElement).checked })}>${label}</label>`;
    return html`<details class="person" open>
      <summary>
        ${person.picture ? html`<img class="avatar" src=${person.picture} alt="">` : html`<span class="avatar"><ha-icon icon="mdi:account"></ha-icon></span>`}
        <span class="who">${person.name}<span class="chip">${this.t(`editor.role_${person.role}`)}</span></span>
        <button class="danger" @click=${(event: Event) => { event.preventDefault(); void this._save(() => api.personRemove(this.hass, this._config.entry_id, personId)); }}>${this.t("editor.remove")}</button>
      </summary>
      <div class="body">
        ${person.role === "admin" ? html`<div class="note">${this.t("editor.admin_hint")}</div>` : nothing}
        <fieldset><legend>${this.t("editor.sections")}</legend>${section("settings", this.t("editor.section_settings"))}${section("devices", this.t("editor.section_devices"))}</fieldset>
        <fieldset><legend>${this.t("editor.may")}</legend>${action("configure", this.t("editor.may_configure"))}${action("reload", this.t("editor.may_reload"))}</fieldset>
        ${this._renderHiding(`person:${personId}`, rule.hidden_patterns, rule.hidden_entities,
          (patterns) => this._setRule(personId, { ...rule, hidden_patterns: patterns }),
          (entities) => this._setRule(personId, { ...rule, hidden_entities: entities }), this.t("editor.hide_person", { person: person.name }), "")}
        <div><button @click=${() => (this._preview = personId)}>${this.t("editor.preview")} ${person.name}</button></div>
      </div>
    </details>`;
  }

  private _renderGlobalHiding(): TemplateResult {
    const policy = this._access?.policy;
    const patterns = policy?.hidden_patterns ?? [];
    const entities = policy?.hidden_entities ?? [];
    return this._renderHiding("global", patterns, entities,
      (next) => this._save(() => api.hiddenSet(this.hass, this._config.entry_id, entities, next)),
      (next) => this._save(() => api.hiddenSet(this.hass, this._config.entry_id, next, patterns)),
      this.t("editor.hide_title"), this.t("editor.hide_hint"));
  }

  /** Patterns and a checkbox list: the two ways to hide entities, for the whole card or for one person. */
  private _renderHiding(scope: string, patterns: string[], hidden: string[], onPatterns: (value: string[]) => Promise<void>, onEntities: (value: string[]) => Promise<void>, title: string, hint: string): TemplateResult {
    const all = this._access?.entities ?? [];
    const filter = (this._filters[scope] ?? "").toLowerCase();
    const shown = filter ? all.filter((entity) => entity.entity_id.includes(filter) || entity.name.toLowerCase().includes(filter)) : all;
    const devices = new Map((this._access?.devices ?? []).map((device) => [device.id, device.name]));
    const groups = [...new Set(shown.map((entity) => entity.device_id))];
    const toggle = (id: string, on: boolean) => (on ? [...new Set([...hidden, id])] : hidden.filter((item) => item !== id));
    return html`<div>
      ${scope === "global" ? html`<h3>${title}</h3>` : html`<h3 style="font-size:.9rem">${title}</h3>`}
      ${hint ? html`<p class="hint">${hint}</p>` : nothing}
      <fieldset><legend>${this.t("editor.patterns")}</legend>
        <p class="hint">${this.t("editor.pattern_hint")}</p>
        ${patterns.map((pattern, index) => html`<div class="row" style="margin-bottom:6px">
          <input type="text" class=${isValidPattern(pattern) ? "" : "invalid"} .value=${pattern}
            @change=${(event: Event) => { const value = (event.target as HTMLInputElement).value; if (isValidPattern(value) || value === "") void onPatterns(patterns.map((item, at) => (at === index ? value : item)).filter(Boolean)); else (event.target as HTMLInputElement).classList.add("invalid"); }}>
          <button class="danger" aria-label=${this.t("editor.remove")} @click=${() => void onPatterns(patterns.filter((_, at) => at !== index))}>×</button>
        </div>`)}
        <button @click=${() => void onPatterns([...patterns, NEW_PATTERN])}>${this.t("editor.pattern_add")}</button>
        <p class="hint" style="margin-top:6px">${this.t("editor.pattern_invalid")}</p>
      </fieldset>
      <fieldset style="margin-top:12px"><legend>${this.t("editor.entities")} · ${this.t("editor.count_hidden", { count: hidden.length })}</legend>
        ${all.length === 0 ? html`<p class="hint">${this.t("editor.entities_none")}</p>` : html`
          ${all.length > FILTER_FROM ? html`<input type="text" placeholder=${this.t("editor.entities_filter")} .value=${this._filters[scope] ?? ""} @input=${(event: Event) => (this._filters = { ...this._filters, [scope]: (event.target as HTMLInputElement).value })}>` : nothing}
          <div class="scroll">${groups.map((deviceId) => html`
            <div class="device-title">${deviceId ? devices.get(deviceId) ?? deviceId : this.t("card.no_device")}</div>
            ${shown.filter((entity) => entity.device_id === deviceId).map((entity) => html`<label class="check">
              <input type="checkbox" .checked=${hidden.includes(entity.entity_id)} @change=${(event: Event) => void onEntities(toggle(entity.entity_id, (event.target as HTMLInputElement).checked))}>
              <span>${entity.name}<span class="entity-id">${entity.entity_id}</span></span></label>`)}`)}</div>`}
      </fieldset>
    </div>`;
  }

  private _renderPreview(): TemplateResult {
    const listed = Object.keys(this._access?.policy.people ?? {});
    const selected = this._preview && this._people.some((person) => person.person === this._preview) ? this._preview : listed[0] ?? "";
    return html`<div>
      <h3>${this.t("editor.preview")}</h3>
      <p class="hint">${this.t("editor.preview_hint")}</p>
      <select @change=${(event: Event) => (this._preview = (event.target as HTMLSelectElement).value)}>
        <option value="" ?selected=${!selected}>${this.t("editor.preview_none")}</option>
        ${this._people.map((person) => html`<option value=${person.person} ?selected=${person.person === selected}>${person.name}</option>`)}
      </select>
      ${selected ? html`<div class="preview"><config-entry-panel .hass=${this.hass} preview-person=${selected}></config-entry-panel></div>` : nothing}
    </div>`;
  }

  protected override updated(): void {
    const card = this.renderRoot.querySelector("config-entry-panel") as (HTMLElement & { setConfig(config: unknown): void }) | null;
    if (!card) return;
    const key = JSON.stringify([this._config.entry_id, this._config.title]);
    if ((card as unknown as { _pushed?: string })._pushed !== key) {
      (card as unknown as { _pushed?: string })._pushed = key;
      card.setConfig({ entry_id: this._config.entry_id, title: this._config.title });
    }
  }
}
