// A stand-in for the Home Assistant frontend and backend, good enough to run the card in a real browser.
// It is a demo and test harness only: the rules it applies are a simplified copy of the integration's.
const mdi = require("@mdi/js");

const ICONS = {
  "mdi:puzzle-outline": mdi.mdiPuzzleOutline, "mdi:cog-outline": mdi.mdiCogOutline, "mdi:dots-vertical": mdi.mdiDotsVertical,
  "mdi:reload": mdi.mdiReload, "mdi:chevron-down": mdi.mdiChevronDown, "mdi:cloud-outline": mdi.mdiCloudOutline,
  "mdi:devices": mdi.mdiDevices, "mdi:eye": mdi.mdiEye, "mdi:eye-off": mdi.mdiEyeOff, "mdi:account": mdi.mdiAccount,
  "mdi:help-circle-outline": mdi.mdiHelpCircleOutline, "mdi:shape-outline": mdi.mdiShapeOutline, "mdi:alert-circle-outline": mdi.mdiAlertCircleOutline,
  "mdi:calendar-clock": mdi.mdiCalendarClock, "mdi:thermometer": mdi.mdiThermometer, "mdi:bell-outline": mdi.mdiBellOutline,
  "mdi:lightbulb-outline": mdi.mdiLightbulbOutline, "mdi:signal": mdi.mdiSignal, "mdi:toggle-switch-outline": mdi.mdiToggleSwitchOutline,
  "mdi:clock-outline": mdi.mdiClockOutline, "mdi:close": mdi.mdiClose, "mdi:chevron-right": mdi.mdiChevronRight, "mdi:counter": mdi.mdiCounter,
};

/** Registers the elements Home Assistant would provide. */
function stubElements(ICONS) {
  const icon = (name) => {
    const d = ICONS[name] || ICONS["mdi:help-circle-outline"];
    return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="${d}"/></svg>`;
  };
  // Like Home Assistant's own icons, these draw into a shadow root. Light DOM children would shift the
  // node positions Lit counts while it clones a template, and parts would end up in the wrong place.
  class HaIcon extends HTMLElement {
    static get observedAttributes() { return ["icon"]; }
    constructor() { super(); this.attachShadow({ mode: "open" }); }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { this.render(); }
    render() {
      this.shadowRoot.innerHTML = `<style>:host{display:inline-block;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);vertical-align:middle}</style>` + icon(this.getAttribute("icon"));
    }
  }
  class HaStateIcon extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }); }
    set stateObj(value) { this._s = value; this.render(); }
    connectedCallback() { this.render(); }
    render() {
      const id = this._s?.entity_id || "";
      const name = id.startsWith("light.") ? "mdi:lightbulb-outline" : id.startsWith("sensor.") ? (id.includes("temp") ? "mdi:thermometer" : "mdi:counter") : id.startsWith("switch.") ? "mdi:toggle-switch-outline" : id.startsWith("calendar.") ? "mdi:calendar-clock" : "mdi:bell-outline";
      this.shadowRoot.innerHTML = `<style>:host{display:inline-block;width:24px;height:24px}</style>` + icon(name);
    }
  }
  class HaCard extends HTMLElement {}
  class HaForm extends HTMLElement {
    // Draws the common field types as plain inputs and reports changes like ha-form does.
    // Properties arrive one by one; draw once they have all been set.
    schedule() { if (!this._scheduled) { this._scheduled = true; queueMicrotask(() => { this._scheduled = false; this.render(); }); } }
    set schema(v) { this._schema = v; this.schedule(); }
    set data(v) { this._data = v; this.schedule(); }
    set computeLabel(v) { this._label = v; this.schedule(); }
    set computeHelper(v) { this._helper = v; this.schedule(); }
    render() {
      if (!this._schema || !this._data) return;
      this.innerHTML = "";
      this.style.cssText = "display:grid;gap:12px";
      for (const field of this._schema) {
        const label = document.createElement("label");
        label.style.cssText = "display:grid;gap:4px;font-size:.85rem;color:var(--secondary-text-color)";
        label.append(this._label?.(field) || field.name);
        let input;
        if (field.type === "boolean") { input = document.createElement("input"); input.type = "checkbox"; input.checked = Boolean(this._data[field.name]); input.onchange = () => this.emit(field.name, input.checked); label.style.cssText = "display:flex;gap:8px;align-items:center;font-size:1rem;color:var(--primary-text-color)"; label.prepend(input); this.append(label); continue; }
        if (field.type === "select") { input = document.createElement("select"); for (const [v, l] of field.options) { const o = new Option(l, v); o.selected = this._data[field.name] === v; input.add(o); } input.onchange = () => this.emit(field.name, input.value); }
        else { input = document.createElement("input"); input.type = field.type === "integer" ? "number" : "text"; input.value = this._data[field.name] ?? ""; input.oninput = () => this.emit(field.name, field.type === "integer" ? Number(input.value) : input.value, true); }
        input.style.cssText = "padding:10px 12px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font:inherit";
        input.setAttribute("name", field.name);
        label.append(input);
        const helper = this._helper?.(field);
        if (helper) { const small = document.createElement("small"); small.textContent = helper; label.append(small); }
        this.append(label);
      }
    }
    emit(name, value, quiet) { this._data = { ...this._data, [name]: value }; this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: this._data }, bubbles: true, composed: true })); if (!quiet) this.render(); }
  }
  for (const [tag, cls] of [["ha-icon", HaIcon], ["ha-state-icon", HaStateIcon], ["ha-card", HaCard], ["ha-form", HaForm]]) if (!customElements.get(tag)) customElements.define(tag, cls);
}

const THEMES = {
  dark: "--primary-color:#03a9f4;--primary-text-color:#e1e1e1;--secondary-text-color:#9b9b9b;--divider-color:rgba(225,225,225,.12);--card-background-color:#1c1c1c;--secondary-background-color:#282828;--success-color:#43a047;--error-color:#ef5350;--info-color:#039be5;--warning-color:#ff9800;--ha-card-border-radius:16px;background:#111;color:#e1e1e1",
  light: "--primary-color:#03a9f4;--primary-text-color:#212121;--secondary-text-color:#727272;--divider-color:#e0e0e0;--card-background-color:#fff;--secondary-background-color:#f5f5f5;--success-color:#43a047;--error-color:#db4437;--info-color:#039be5;--warning-color:#ff9800;--ha-card-border-radius:16px;background:#fafafa;color:#212121",
};

/** The page: theme variables, HA's card look and a mount point. */
function pageHtml(theme = "dark") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{${THEMES[theme]}} body{margin:0;padding:20px;font-family:Roboto,"Segoe UI",Arial,sans-serif;font-size:14px;${THEMES[theme]}}
    ha-card{display:block;background:var(--card-background-color);border-radius:var(--ha-card-border-radius);box-shadow:0 2px 6px rgba(0,0,0,.35);color:var(--primary-text-color)}
    .slot{margin:0 auto 18px;max-width:520px} .slot>h4{margin:0 0 6px;font-size:12px;font-weight:500;color:#8a8a8a;text-transform:uppercase;letter-spacing:.06em}
  </style></head><body><div id="root"></div></body></html>`;
}

/** Page-side fake: the data, the websocket commands and `makeHass(user)`. Evaluated inside the browser. */
function pageScript() {
  return `(() => {
  const entry = { entry_id: "e1", domain: "perdis_roster", title: "Depot Nord - 000123", state: "loaded", disabled_by: null, supports_options: true,
    source: "user", reason: null, pref_disable_polling: false, pref_disable_new_entities: false };
  const devices = [
    { id: "d1", name: "Depot Nord - 000123", manufacturer: "PERDIS WebComm", model: "Roster API", sw_version: "2026.11", hw_version: null, area: null, entry_type: "service" },
    { id: "d2", name: "Wall Display", manufacturer: "Acme", model: "WD-1", sw_version: "1.4.2", hw_version: null, area: "Hallway", entry_type: null },
  ];
  const entities = [
    ["calendar.next_shift", "Next shift", "d1", null, "Tomorrow 06:12"], ["sensor.shift_count", "Shifts this week", "d1", null, "5"],
    ["sensor.hours_balance", "Hours balance", "d1", null, "+3.5 h"], ["sensor.last_sync", "Last sync", "d1", "diagnostic", "2 min ago"],
    ["sensor.api_rssi", "API signal strength", "d1", "diagnostic", "-61 dBm"], ["switch.notify_changes", "Notify about changes", "d1", "config", "on"],
    ["light.display", "Display backlight", "d2", null, "on"], ["sensor.display_temp", "Display temperature", "d2", null, "41 °C"],
  ].map(([entity_id, name, device_id, entity_category, state]) => ({ entity_id, name, device_id, entity_category, state }));
  const states = {};
  for (const e of entities) states[e.entity_id] = { entity_id: e.entity_id, state: e.state, attributes: { friendly_name: e.name } };
  const people = [["person.anna", "u-anna", "Anna", "user"], ["person.ben", "u-ben", "Ben", "user"], ["person.carl", "u-carl", "Carl", "user"], ["person.root", "u-root", "Root", "admin"]];
  for (const [id, uid, name] of people) states[id] = { entity_id: id, state: "home", attributes: { user_id: uid, friendly_name: name } };
  const state = { policy: { hidden_entities: [], hidden_patterns: ["rssi$"], people: {
    "person.anna": { sections: ["settings", "devices"], configure: true, reload: true, hidden_entities: ["sensor.last_sync"], hidden_patterns: [] },
    "person.ben": { sections: ["devices"], configure: false, reload: false, hidden_entities: [], hidden_patterns: [] } } },
    options: { shift_reminder: 30, notify: true }, reloads: 0, flows: {}, calls: [], fail: 0 };
  const GROUP = (e) => e.entity_category === "diagnostic" ? "diagnostic" : e.entity_category === "config" ? "config" : /^(sensor|binary_sensor)\\./.test(e.entity_id) ? "sensor" : "control";
  const hiddenFor = (person) => { const rule = state.policy.people[person] || {}; return { ids: [...state.policy.hidden_entities, ...(rule.hidden_entities || [])], patterns: [...state.policy.hidden_patterns, ...(rule.hidden_patterns || [])].map((p) => new RegExp(p, "i")) }; };
  const caps = (person, admin) => { if (admin) return { visible: true, admin: true, settings: true, devices: true, configure: true, reload: true }; const r = state.policy.people[person]; if (!r) return { visible: false, admin: false, settings: false, devices: false, configure: false, reload: false }; return { visible: true, admin: false, settings: r.sections.includes("settings"), devices: r.sections.includes("devices"), configure: r.configure, reload: r.reload }; };
  const err = (code, message) => Object.assign(new Error(message || code), { code, message: message || code });
  const personOf = (user) => people.find(([, uid]) => uid === user.id)?.[0] || null;
  const panel = (c, person) => {
    const { ids, patterns } = c.admin ? { ids: [], patterns: [] } : hiddenFor(person);
    const visible = (e) => !(ids.includes(e.entity_id) || patterns.some((p) => p.test(e.entity_id) || p.test(e.name)));
    const out = devices.map((d) => ({ ...d, groups: ["control", "sensor", "config", "diagnostic"].map((g) => ({ group: g, entities: entities.filter((e) => e.device_id === d.id && visible(e) && GROUP(e) === g).map((e) => ({ entity_id: e.entity_id, name: e.name })) })).filter((g) => g.entities.length) })).filter((d) => d.groups.length);
    return { entry: { domain: entry.domain, title: entry.title, state: entry.state, disabled_by: null, supports_options: true, ...(c.admin ? { entry_id: entry.entry_id } : {}) }, caps: c,
      settings: c.settings ? { source: entry.source, reason: entry.reason, pref_disable_polling: false, pref_disable_new_entities: false } : null, devices: c.devices ? out : [] };
  };
  const form = (flow_id) => ({ type: "form", flow_id, step_id: "init", last_step: false, errors: null, description_placeholders: { hours: "30" }, data_schema: [
    { name: "shift_reminder", type: "integer", required: true, default: state.options.shift_reminder, description: { suggested_value: state.options.shift_reminder } },
    { name: "notify", type: "boolean", optional: true, default: state.options.notify } ] });
  const handlers = {
    "config_entry_panel/panel": (m, user) => { const person = m.as_person || personOf(user); const admin = m.as_person ? people.find(([id]) => id === m.as_person)?.[3] === "admin" : user.is_admin; const c = caps(person, admin); if (!c.visible) throw err("unauthorized"); return panel(c, person); },
    "config_entry_panel/reload": (m, user) => { if (!caps(personOf(user), user.is_admin).reload) throw err("unauthorized"); state.reloads++; entry.state = "setup_in_progress"; setTimeout(() => (entry.state = "loaded"), 800); return null; },
    "config_entry_panel/options/start": (m, user) => { if (!caps(personOf(user), user.is_admin).configure) throw err("unauthorized"); const id = "flow-" + Math.random().toString(36).slice(2, 7); state.flows[id] = user.id; return form(id); },
    "config_entry_panel/options/step": (m, user) => { if (state.flows[m.flow_id] !== user.id) throw err("not_found"); if (m.user_input?.shift_reminder > 120) { return { ...form(m.flow_id), errors: { base: "too_long" } }; } Object.assign(state.options, m.user_input || {}); delete state.flows[m.flow_id]; return { type: "create_entry", flow_id: m.flow_id }; },
    "config_entry_panel/options/abort": (m, user) => { delete state.flows[m.flow_id]; return null; },
    "config_entry_panel/entries": () => [{ entry_id: "e1", title: entry.title, domain: entry.domain }],
    "config_entry_panel/people": () => people.map(([person, , name, role]) => ({ person, name, picture: null, role })),
    "config_entry_panel/access/get": () => ({ policy: state.policy, devices: devices.map((d) => ({ id: d.id, name: d.name })), entities: entities.map((e) => ({ entity_id: e.entity_id, name: e.name, device_id: e.device_id })) }),
    "config_entry_panel/access/person/set": (m) => { state.policy.people[m.person] = { sections: m.sections, configure: m.configure, reload: m.reload, hidden_entities: m.hidden_entities, hidden_patterns: m.hidden_patterns }; return state.policy; },
    "config_entry_panel/access/person/remove": (m) => { delete state.policy.people[m.person]; return state.policy; },
    "config_entry_panel/access/hidden/set": (m) => { state.policy.hidden_entities = m.hidden_entities; state.policy.hidden_patterns = m.hidden_patterns; return state.policy; },
  };
  const LOCAL = { "ui.panel.config.integrations.config_entry.state.loaded": "Loaded", "ui.panel.config.integrations.config_entry.state.setup_in_progress": "Initializing", "ui.panel.config.devices.type.service_heading": "Service",
    "ui.panel.config.devices.entities.control": "Controls", "ui.panel.config.devices.entities.sensor": "Sensors", "ui.panel.config.devices.entities.config": "Configuration", "ui.panel.config.devices.entities.diagnostic": "Diagnostic",
    "ui.panel.config.integrations.integration_page.entries_device": "Devices", "ui.panel.config.integrations.config_entry.configure": "Configure", "ui.panel.config.integrations.config_entry.reload": "Reload" };
  const OPTIONS = { "component.perdis_roster.options.step.init.title": "Roster options", "component.perdis_roster.options.step.init.description": "Choose how early you want to be reminded before a shift starts.",
    "component.perdis_roster.options.step.init.data.shift_reminder": "Reminder before a shift (minutes)", "component.perdis_roster.options.step.init.data.notify": "Notify me about roster changes",
    "component.perdis_roster.options.step.init.data_description.shift_reminder": "Between 5 and 120 minutes.", "component.perdis_roster.options.error.too_long": "That is longer than two hours." };
  window.fake = { state, entities, people, entry,
    makeHass(user) {
      const listeners = new Set();
      const connection = { addEventListener: (type, cb) => type === "ready" && listeners.add(cb), removeEventListener: (type, cb) => listeners.delete(cb), emitReady: () => listeners.forEach((cb) => cb()) };
      return { user, connection, language: "en", states, localize: (k, ...r) => { const v = LOCAL[k] ?? OPTIONS[k]; if (v) return v; if (k.endsWith("config_entry.firmware")) return "Firmware: " + r[1]; return ""; },
        loadBackendTranslation: async () => (k) => OPTIONS[k] || "", formatEntityState: (s) => s.state,
        callWS: async (m) => { state.calls.push(m.type); await new Promise((r) => setTimeout(r, 20)); if (state.fail > 0) { state.fail--; throw Object.assign(new Error("connection lost"), { code: 3 }); } const h = handlers[m.type]; if (!h) throw err("unknown_command"); return JSON.parse(JSON.stringify(h(m, user) ?? null)); } };
    } };
})();`;
}

/** The script that defines the stand-in elements inside the page. */
function stubScript() {
  return `(${stubElements.toString()})(${JSON.stringify(ICONS)});`;
}

module.exports = { stubScript, pageHtml, pageScript, THEMES };
