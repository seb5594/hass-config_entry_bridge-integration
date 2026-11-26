import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import * as api from "../api.ts";
import { translate } from "../i18n/index.ts";
import { fillPlaceholders, initialData, isOpen, keys, menuEntries, submittable } from "../logic/flow.ts";
import type { FlowResult, Hass, SchemaField } from "../types.ts";
import { fire } from "../util/dom.ts";

type Localize = (key: string, ...placeholders: unknown[]) => string;

/**
 * The gear: runs the integration's options flow, step by step, in a dialog. The forms are drawn by
 * Home Assistant's own `ha-form`, so every field type the integration uses looks and works as in the settings.
 */
export class OptionsDialog extends LitElement {
  static override properties = {
    hass: { attribute: false },
    entryId: { attribute: false },
    domain: { attribute: false },
    heading: { attribute: false },
    _result: { state: true },
    _data: { state: true },
    _busy: { state: true },
    _problem: { state: true },
  };

  static override styles = css`
    dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 0; border-radius: 16px; background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45); }
    dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
    @media (max-width: 600px) { dialog { width: 100vw; max-width: 100vw; height: 100vh; max-height: 100vh; height: 100dvh; max-height: 100dvh; margin: 0; border-radius: 0; } form { height: 100vh; height: 100dvh; } }
    form { display: grid; grid-template-rows: auto 1fr auto; max-height: inherit; margin: 0; }
    h2 { margin: 0; padding: 20px 24px 8px; font-size: 1.25rem; font-weight: 500; overflow-wrap: anywhere; }
    .body { padding: 8px 24px; overflow: auto; }
    .body p, .body ha-markdown { margin: 0 0 12px; color: var(--secondary-text-color); overflow-wrap: anywhere; }
    .problem { color: var(--error-color); margin-bottom: 12px; }
    footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px 16px; }
    button { font: inherit; padding: 8px 16px; border-radius: 999px; border: 0; cursor: pointer; background: transparent; color: var(--primary-color); }
    button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
    button:disabled { opacity: 0.5; cursor: default; }
    .menu { display: grid; gap: 4px; }
    .menu button { text-align: left; padding: 12px 14px; border-radius: 10px; background: var(--secondary-background-color); color: var(--primary-text-color); }
  `;

  declare hass: Hass;
  declare entryId: string;
  declare domain: string;
  declare heading: string;
  declare _result: FlowResult | undefined;
  declare _data: Record<string, unknown>;
  declare _busy: boolean;
  declare _problem: string | undefined;
  private _localize: Localize | undefined;
  private _finished = false;

  constructor() {
    super();
    this._data = {};
    this._busy = false;
  }

  private get localize(): Localize {
    return this._localize ?? ((key, ...rest) => this.hass.localize(key, ...rest));
  }

  private t = (key: string) => translate(this.hass, key);

  /** A translated text of the integration, or null when it has none. */
  private text(key: string, placeholders?: Record<string, string> | null): string | null {
    const found = this.localize(key);
    return found && found !== key ? fillPlaceholders(found, placeholders) : null;
  }

  async open(): Promise<void> {
    try {
      this._localize = await this.hass.loadBackendTranslation?.("options", this.domain);
    } catch {
      this._localize = undefined; // the texts then fall back to the field names
    }
    try {
      this._show(await api.optionsStart(this.hass, this.entryId));
    } catch (error) {
      this._problem = (error as { message?: string }).message ?? api.errorCode(error);
    }
    await this.updateComplete;
    (this.renderRoot.querySelector("dialog") as HTMLDialogElement | null)?.showModal();
  }

  private _show(result: FlowResult): void {
    this._result = result;
    this._data = result.type === "form" ? initialData(result.data_schema) : {};
    if (result.type === "create_entry") this._finish(true);
  }

  private _finish(saved: boolean): void {
    if (this._finished) return;
    this._finished = true;
    fire(this, "flow-finished", { saved });
  }

  private async _step(input?: Record<string, unknown>): Promise<void> {
    const result = this._result;
    if (!result) return;
    this._busy = true;
    this._problem = undefined;
    try {
      this._show(await api.optionsStep(this.hass, result.flow_id, input));
    } catch (error) {
      this._problem = (error as { message?: string }).message ?? api.errorCode(error);
    } finally {
      this._busy = false;
    }
  }

  private async _close(): Promise<void> {
    const result = this._result;
    if (result && isOpen(result)) {
      this._result = undefined;
      try {
        await api.optionsAbort(this.hass, result.flow_id);
      } catch {
        // the flow may already be gone
      }
    }
    this._finish(false);
    (this.renderRoot.querySelector("dialog") as HTMLDialogElement | null)?.close();
    fire(this, "closed");
  }

  protected override render(): TemplateResult {
    const result = this._result;
    return html`<dialog @cancel=${(event: Event) => { event.preventDefault(); void this._close(); }}>
      <form method="dialog" @submit=${(event: Event) => { event.preventDefault(); void this._submit(); }}>
        <h2>${(result?.step_id && this.text(keys.title(this.domain, result.step_id))) || this.heading}</h2>
        <div class="body">${this._problem ? html`<div class="problem" role="alert">${this._problem}</div>` : nothing}${this._renderResult(result)}</div>
        <footer>${this._renderFooter(result)}</footer>
      </form>
    </dialog>`;
  }

  private _renderResult(result: FlowResult | undefined): TemplateResult | typeof nothing {
    if (!result) return nothing;
    const placeholders = result.description_placeholders;
    const step = result.step_id ?? "init";
    if (result.type === "form") {
      const description = this.text(keys.description(this.domain, step), placeholders);
      return html`${description ? this._markdown(description) : nothing}
        <ha-form .hass=${this.hass} .data=${this._data} .schema=${result.data_schema ?? []} .error=${result.errors ?? undefined}
          .computeLabel=${(field: SchemaField) => this.text(keys.label(this.domain, step, field.name)) ?? field.name}
          .computeHelper=${(field: SchemaField) => this.text(keys.helper(this.domain, step, field.name)) ?? ""}
          .computeError=${(code: string) => this.text(keys.error(this.domain, code), placeholders) ?? code}
          @value-changed=${(event: CustomEvent<{ value: Record<string, unknown> }>) => (this._data = event.detail.value)}></ha-form>
        ${result.errors?.base ? html`<div class="problem" role="alert">${this.text(keys.error(this.domain, result.errors.base), placeholders) ?? result.errors.base}</div>` : nothing}`;
    }
    if (result.type === "menu") {
      const description = this.text(keys.description(this.domain, step), placeholders);
      return html`${description ? this._markdown(description) : nothing}<div class="menu">${menuEntries(result).map((option) =>
        html`<button type="button" ?disabled=${this._busy} @click=${() => void this._step({ next_step_id: option.id })}>${this.text(keys.menu(this.domain, step, option.id)) ?? option.label ?? option.id}</button>`)}</div>`;
    }
    if (result.type === "abort") {
      return html`<p>${this.text(keys.abort(this.domain, result.reason ?? ""), placeholders) ?? result.reason}</p>`;
    }
    if (result.type === "create_entry") return html`<p>${this.t("flow.saved")}</p>`;
    return html`<p>${this.t("flow.unsupported")}</p>`;
  }

  private _markdown(text: string): TemplateResult {
    return customElements.get("ha-markdown") ? html`<ha-markdown breaks .content=${text}></ha-markdown>` : html`<p>${text}</p>`;
  }

  private _renderFooter(result: FlowResult | undefined): TemplateResult {
    const open = result !== undefined && isOpen(result);
    return html`<button type="button" @click=${() => void this._close()}>${this.t(open ? "flow.cancel" : "flow.close")}</button>
      ${result?.type === "form" ? html`<button type="submit" class="primary" ?disabled=${this._busy}>${this.t(result.last_step === false ? "flow.next" : "flow.submit")}</button>` : nothing}`;
  }

  private async _submit(): Promise<void> {
    if (this._result?.type === "form") await this._step(submittable(this._data));
  }
}
