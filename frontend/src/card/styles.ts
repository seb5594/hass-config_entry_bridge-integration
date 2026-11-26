import { css } from "lit";

export const cardStyles = css`
  :host { display: block; }
  :host([hidden]) { display: none !important; }
  ha-card { overflow: visible; }
  .banner { padding: 8px 16px; font-size: 0.85rem; color: var(--text-primary-color, #fff); background: var(--info-color, var(--primary-color)); display: flex; gap: 8px; align-items: center; border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0; }
  .notice { padding: 16px; color: var(--secondary-text-color); display: flex; gap: 12px; align-items: flex-start; }
  .notice.dashed { border: 2px dashed var(--divider-color); margin: 8px; border-radius: var(--ha-card-border-radius, 12px); }
  .error { color: var(--error-color); }
  .entry { display: flex; align-items: center; gap: 14px; padding: 14px 8px 14px 16px; }
  .entry > ha-icon { --mdc-icon-size: 28px; color: var(--primary-color); flex: none; }
  .heading { flex: 1; min-width: 0; }
  .title { font-size: 1.15rem; line-height: 1.3; font-weight: 500; overflow-wrap: anywhere; color: var(--primary-text-color); }
  .subtitle { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 2px; font-size: 0.85rem; color: var(--secondary-text-color); }
  .chip { display: inline-flex; align-items: center; padding: 0 10px; border-radius: 999px; font-size: 0.75rem; line-height: 1.6; border: 1px solid currentColor; color: var(--secondary-text-color); }
  .chip.ok { color: var(--success-color, #43a047); }
  .chip.busy { color: var(--info-color, #039be5); }
  .chip.problem { color: var(--error-color, #db4437); }
  .tools { display: flex; align-items: center; position: relative; }
  button.icon { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 50%; cursor: pointer; background: transparent; color: var(--secondary-text-color); }
  button.icon:hover:not(:disabled) { background: var(--secondary-background-color); color: var(--primary-text-color); }
  button.icon:disabled { opacity: 0.45; cursor: default; }
  button.icon ha-icon { --mdc-icon-size: 24px; }
  .menu { position: absolute; right: 8px; top: 44px; z-index: 5; min-width: 180px; padding: 6px 0; border-radius: 10px; background: var(--card-background-color, #fff); box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3); border: 1px solid var(--divider-color); }
  .menu button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 16px; border: 0; background: transparent; cursor: pointer; font: inherit; color: var(--primary-text-color); text-align: left; }
  .menu button:hover:not(:disabled) { background: var(--secondary-background-color); }
  .menu button:disabled { opacity: 0.5; cursor: default; }
  .menu ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
  .reason { margin: 0 16px 10px; padding: 8px 12px; border-radius: 8px; background: var(--secondary-background-color); font-size: 0.85rem; overflow-wrap: anywhere; }
  .reason.error { color: var(--error-color); }
  .facts { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 4px 16px; margin: 0; padding: 0 16px 12px; font-size: 0.9rem; }
  .facts dt { color: var(--secondary-text-color); }
  .facts dd { margin: 0; overflow-wrap: anywhere; color: var(--primary-text-color); }
  .devices { border-top: 1px solid var(--divider-color); }
  .devices h2 { margin: 0; padding: 12px 16px 4px; font-size: 0.75rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
  .none { padding: 8px 16px 16px; color: var(--secondary-text-color); font-size: 0.9rem; }
  details.device + details.device { border-top: 1px solid var(--divider-color); }
  details.device > summary { display: flex; align-items: center; gap: 14px; padding: 10px 16px; cursor: pointer; list-style: none; }
  details.device > summary::-webkit-details-marker { display: none; }
  details.device > summary > ha-icon { --mdc-icon-size: 26px; color: var(--secondary-text-color); flex: none; }
  details.device > summary .chevron { margin-left: auto; transition: transform 0.15s; }
  details.device[open] > summary .chevron { transform: rotate(180deg); }
  .device-name { font-size: 1rem; color: var(--primary-text-color); overflow-wrap: anywhere; }
  .device-info { font-size: 0.82rem; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .group { padding: 0 8px 8px 8px; }
  .group h3 { margin: 6px 8px 2px; font-size: 0.72rem; font-weight: 500; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.05em; }
  button.entity { display: flex; align-items: center; gap: 14px; width: 100%; padding: 6px 8px; border: 0; border-radius: 8px; cursor: pointer; background: transparent; font: inherit; color: inherit; text-align: left; }
  button.entity:hover { background: var(--secondary-background-color); }
  button.entity .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary-text-color); }
  button.entity .state { color: var(--secondary-text-color); white-space: nowrap; }
  button.entity ha-state-icon, button.entity ha-icon { flex: none; color: var(--state-icon-color, var(--secondary-text-color)); }
  .toast { margin: 0 16px 10px; font-size: 0.85rem; color: var(--success-color, #43a047); }
`;
