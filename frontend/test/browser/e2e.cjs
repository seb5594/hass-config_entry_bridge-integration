// Drives the built card in a real browser against the stand-in Home Assistant of fake-ha.cjs.
//   npm run build && npm run e2e        (needs Playwright with Chromium; not part of `npm test`)
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const { pageHtml, pageScript, stubScript } = require("./fake-ha.cjs");

const CARD = path.resolve(__dirname, "../../../custom_components/config_entry_panel/frontend/config-entry-panel.js");
const USERS = {
  anna: { id: "u-anna", name: "Anna", is_admin: false },
  ben: { id: "u-ben", name: "Ben", is_admin: false },
  carl: { id: "u-carl", name: "Carl", is_admin: false },
  root: { id: "u-root", name: "Root", is_admin: true },
};

async function open(browser, theme = "dark", viewport = { width: 620, height: 900 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.errors = [];
  page.on("pageerror", (error) => page.errors.push(error.message));
  await page.setContent(pageHtml(theme));
  await page.addScriptTag({ content: stubScript() });
  await page.addScriptTag({ content: pageScript() });
  await page.addScriptTag({ path: CARD, type: "module" });
  await page.waitForFunction(() => customElements.get("config-entry-panel"));
  return page;
}

/** Puts a card for `user` on the page and waits until it settled. Returns facts about it. */
async function mount(page, userKey, { preview, title } = {}) {
  return page.evaluate(async ({ user, preview, title }) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    document.getElementById("root").append(slot);
    const card = document.createElement("config-entry-panel");
    card.id = "card-" + user.id;
    const events = [];
    card.addEventListener("card-visibility-changed", (event) => events.push(event.detail.value));
    card.setConfig({ type: "custom:config-entry-panel", entry_id: "e1", ...(title ? { title } : {}) });
    card.hass = window.fake.makeHass(user);
    if (preview) card.setAttribute("preview-person", preview);
    slot.append(card);
    await new Promise((r) => setTimeout(r, 250));
    return { hidden: card.hasAttribute("hidden"), events, height: Math.round(card.getBoundingClientRect().height), text: card.shadowRoot.textContent.replace(/\s+/g, " ").trim() };
  }, { user: USERS[userKey], preview, title });
}

module.exports = { open, mount, USERS, CARD };

if (require.main === module) {
  (async () => {
    const browser = await chromium.launch();
    try {
      // 1. visibility and filtering per person
      let page = await open(browser);
      const anna = await mount(page, "anna");
      assert.equal(anna.hidden, false);
      assert.match(anna.text, /Depot Nord - 000123/);
      assert.match(anna.text, /Next shift/);
      assert.doesNotMatch(anna.text, /Last sync/, "Anna's own rule hides the last sync");
      assert.doesNotMatch(anna.text, /API signal strength/, "the entry-wide pattern hides the signal strength");
      const carl = await mount(page, "carl");
      assert.deepEqual([carl.hidden, carl.height, carl.events.at(-1)], [true, 0, false], "an unlisted user does not see the card at all");
      const ben = await mount(page, "ben");
      assert.doesNotMatch(ben.text, /Source|Polling/, "Ben has no settings section");
      assert.match(ben.text, /Wall Display/);
      const root = await mount(page, "root");
      assert.match(root.text, /Last sync/);
      assert.match(root.text, /API signal strength/, "administrators see every entity");
      const preview = await mount(page, "root", { preview: "person.carl" });
      assert.match(preview.text, /Carl does not see this card at all/);
      assert.deepEqual(page.errors, []);
      await page.close();

      // 2. the gear: the options flow runs in a dialog and saves
      page = await open(browser);
      await mount(page, "anna");
      await page.locator("#card-u-anna").locator("button[aria-label='Configure']").click();
      const dialog = page.locator("#card-u-anna").locator("config-entry-panel-options").locator("dialog");
      await dialog.waitFor({ state: "visible" });
      assert.match(await dialog.innerText(), /Roster options/);
      assert.match(await dialog.innerText(), /Reminder before a shift/);
      await dialog.locator("input[name=shift_reminder]").fill("200");
      await dialog.locator("button[type=submit]").click();
      await page.waitForFunction(() => document.querySelector("config-entry-panel").shadowRoot.querySelector("config-entry-panel-options").shadowRoot.textContent.includes("longer than two hours"));
      await dialog.locator("input[name=shift_reminder]").fill("45");
      await dialog.locator("button[type=submit]").click();
      await page.waitForFunction(() => window.fake.state.options.shift_reminder === 45);
      await page.waitForFunction(() => document.querySelector("config-entry-panel").shadowRoot.textContent.includes("Saved"));
      assert.deepEqual(page.errors, []);
      await page.close();

      // 3. reload from the menu, and cancelling the gear leaves nothing open
      page = await open(browser);
      await mount(page, "anna");
      const card = page.locator("#card-u-anna");
      await card.locator("button[aria-haspopup=menu]").click();
      await card.locator("[role=menuitem]").click();
      await page.waitForFunction(() => document.querySelector("config-entry-panel").shadowRoot.textContent.includes("Reloaded"), null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => window.fake.state.reloads), 1);
      await card.locator("button[aria-label='Configure']").click();
      await card.locator("config-entry-panel-options").locator("dialog").waitFor({ state: "visible" });
      await card.locator("config-entry-panel-options").locator("button", { hasText: "Cancel" }).click();
      await page.waitForFunction(() => !document.querySelector("config-entry-panel").shadowRoot.querySelector("config-entry-panel-options"));
      assert.deepEqual(await page.evaluate(() => Object.keys(window.fake.state.flows)), [], "the flow was aborted");
      assert.deepEqual(page.errors, []);
      await page.close();

      // 4. the editor manages people and previews them
      page = await open(browser);
      const result = await page.evaluate(async () => {
        const editor = document.createElement("config-entry-panel-editor");
        const changes = [];
        editor.addEventListener("config-changed", (event) => changes.push(event.detail.config));
        editor.setConfig({ type: "custom:config-entry-panel", entry_id: "e1" });
        editor.hass = window.fake.makeHass({ id: "u-root", name: "Root", is_admin: true });
        document.getElementById("root").append(editor);
        await new Promise((r) => setTimeout(r, 400));
        const q = (s) => [...editor.shadowRoot.querySelectorAll(s)];
        const add = q("select").find((s) => [...s.options].some((o) => o.value === "person.carl"));
        add.value = "person.carl"; add.dispatchEvent(new Event("change"));
        add.parentElement.querySelector("button").click();
        await new Promise((r) => setTimeout(r, 400));
        return { carl: window.fake.state.policy.people["person.carl"], text: editor.shadowRoot.textContent.replace(/\s+/g, " "), previewHidden: editor.shadowRoot.querySelector("config-entry-panel")?.hasAttribute("hidden"), changes };
      });
      assert.deepEqual(result.carl.sections, ["settings", "devices"]);
      assert.equal(result.carl.configure, false, "a new person may change nothing");
      assert.match(result.text, /Anna.*User/);
      assert.match(result.text, /Root|Ben/);
      assert.equal(result.previewHidden, false, "the preview of a listed person shows their view");
      assert.deepEqual(page.errors, []);
      await page.close();
      console.log("e2e: all checks passed");
    } finally {
      await browser.close();
    }
  })().catch((error) => { console.error(error); process.exit(1); });
}
