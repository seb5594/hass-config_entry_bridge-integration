// The part of Home Assistant's frontend API and of the panel's websocket answers this card relies on.

export interface HassUser {
  id: string;
  name: string;
  is_admin: boolean;
}

export interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface Hass {
  user: HassUser;
  states: Record<string, HassState>;
  language: string;
  callWS<T>(message: { type: string } & Record<string, unknown>): Promise<T>;
  localize(key: string, ...placeholders: unknown[]): string;
  /** The websocket connection; it tells when it is ready again after a drop. */
  connection?: {
    addEventListener?(type: "ready" | "disconnected", listener: () => void): void;
    removeEventListener?(type: "ready" | "disconnected", listener: () => void): void;
  };
  /** The state as the user's language and units show it. */
  formatEntityState?(state: HassState): string;
  /** Loads the translations of an integration's flows; resolves to a `localize` that knows them. */
  loadBackendTranslation?(category: string, integration?: string, configFlow?: boolean): Promise<(key: string, ...placeholders: unknown[]) => string>;
}

export interface Caps {
  /** False hides the whole card, as if it did not exist. */
  visible: boolean;
  admin: boolean;
  settings: boolean;
  devices: boolean;
  configure: boolean;
  reload: boolean;
}

export interface PanelEntry {
  entry_id?: string;
  domain: string;
  title: string;
  state: string;
  disabled_by: string | null;
  supports_options: boolean;
}

export interface PanelSettings {
  source: string;
  reason: string | null;
  pref_disable_polling: boolean;
  pref_disable_new_entities: boolean;
}

export type GroupName = "control" | "sensor" | "config" | "diagnostic";

export interface PanelEntity {
  entity_id: string;
  name: string;
}

export interface PanelDevice {
  /** Null for the entities that belong to no device. */
  id: string | null;
  name: string;
  manufacturer: string | null;
  model: string | null;
  sw_version: string | null;
  hw_version: string | null;
  area: string | null;
  entry_type: string | null;
  groups: { group: GroupName; entities: PanelEntity[] }[];
}

export interface Panel {
  entry: PanelEntry;
  caps: Caps;
  settings: PanelSettings | null;
  devices: PanelDevice[];
}

/** A field of the serialized data schema of a flow step, as `ha-form` expects it. */
export interface SchemaField {
  name: string;
  type?: string;
  required?: boolean;
  optional?: boolean;
  default?: unknown;
  description?: { suggested_value?: unknown } | null;
  schema?: SchemaField[];
}

export interface FlowResult {
  type: "form" | "menu" | "create_entry" | "abort" | string;
  flow_id: string;
  step_id?: string;
  data_schema?: SchemaField[];
  errors?: Record<string, string> | null;
  description_placeholders?: Record<string, string> | null;
  menu_options?: string[] | Record<string, string>;
  reason?: string;
  last_step?: boolean | null;
}

export interface Person {
  person: string;
  name: string;
  picture: string | null;
  role: "admin" | "user" | "none";
}

export interface Rule {
  sections: ("settings" | "devices")[];
  configure: boolean;
  reload: boolean;
  hidden_entities: string[];
  hidden_patterns: string[];
}

export interface Policy {
  hidden_entities: string[];
  hidden_patterns: string[];
  people: Record<string, Rule>;
}

export interface AccessInfo {
  policy: Policy;
  devices: { id: string; name: string }[];
  entities: { entity_id: string; name: string; device_id: string | null }[];
}

export interface EntryChoice {
  entry_id: string;
  title: string;
  domain: string;
}
