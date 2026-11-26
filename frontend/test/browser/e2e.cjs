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
      // 1. the first view is compact; the details are in a popup; rights and filters apply per person
      let page = await open(browser, "dark", { width: 390, height: 844 });
      const anna = await mount(page, "anna");
      assert.equal(anna.hidden, false);
      assert.match(anna.text, /Depot Nord - 000123/);
      assert.match(anna.text, /Wall Display/, "devices are listed as rows");
      assert.doesNotMatch(anna.text, /Next shift|Controls/, "entities are not part of the first view");
      const sheet = async (user, device) => {
        const card = page.locator(`#card-${user}`);
        await card.locator("button.device-row", { hasText: device }).click();
        const dialog = card.locator("dialog.sheet");
        await dialog.waitFor({ state: "visible" });
        return { card, dialog, text: await dialog.innerText() };
      };
      let popup = await sheet("u-anna", "Depot Nord");
      assert.match(popup.text, /Next shift/);
      assert.match(popup.text, /controls/i);
      assert.doesNotMatch(popup.text, /Last sync/, "Anna's own rule hides the last sync");
      assert.doesNotMatch(popup.text, /API signal strength/, "the entry-wide pattern hides the signal strength");
      const box = await popup.dialog.boundingBox();
      assert.ok(box.width >= 389 && box.height >= 843, "on a phone the popup fills the screen");
      await popup.dialog.locator("button[aria-label='Close']").click();
      await popup.dialog.waitFor({ state: "detached" });
      const entryInfo = page.locator("#card-u-anna");
      await entryInfo.locator("button.entry-main").click();
      assert.match(await entryInfo.locator("dialog.sheet").innerText(), /Polling for updates/);
      await page.keyboard.press("Escape");
      await entryInfo.locator("dialog.sheet").waitFor({ state: "detached" });
      const carl = await mount(page, "carl");
      assert.deepEqual([carl.hidden, carl.height, carl.events.at(-1)], [true, 0, false], "an unlisted user does not see the card at all");
      const ben = await mount(page, "ben");
      assert.equal(await page.locator("#card-u-ben button.entry-main").isDisabled(), true, "Ben has no settings section: the entry row opens nothing");
      assert.match(ben.text, /Wall Display/);
      await mount(page, "root");
      popup = await sheet("u-root", "Depot Nord");
      assert.match(popup.text, /Last sync/);
      assert.match(popup.text, /API signal strength/, "administrators see every entity");
      await popup.dialog.locator("button[aria-label='Close']").click();
      const preview = await mount(page, "root", { preview: "person.carl" });
      assert.match(preview.text, /Carl does not see this card at all/);
      assert.deepEqual(page.errors, []);
      await page.close();

      // 1b. a tap on an entity closes the popup and opens Home Assistant's more-info
      page = await open(browser, "dark", { width: 390, height: 844 });
      await mount(page, "anna");
      await page.evaluate(() => { window.__moreInfo = []; document.addEventListener("hass-more-info", (event) => window.__moreInfo.push(event.detail.entityId)); });
      popup = await sheet("u-anna", "Depot Nord");
      await popup.dialog.locator("button.entity", { hasText: "Next shift" }).click();
      assert.deepEqual(await page.evaluate(() => window.__moreInfo), ["calendar.next_shift"]);
      await page.locator("#card-u-anna dialog.sheet").waitFor({ state: "detached", timeout: 3000 }); // the popup made room for the dialog of Home Assistant
      await page.close();

      // 1c. the card picker lists the product name in title case and the description in the user's language
      page = await open(browser);
      assert.equal(await page.evaluate(() => window.customCards.find((c) => c.type === "config-entry-panel").name), "Config Entry Panel");
      await page.evaluate(() => { const root = document.createElement("home-assistant"); root.hass = { language: "de" }; document.body.append(root); });
      assert.match(await page.evaluate(() => window.customCards.find((c) => c.type === "config-entry-panel").description), /Zahnrad/);
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

      // 4. the editor manages people and previews them, and fits a phone
      page = await open(browser, "dark", { width: 390, height: 844 });
      const result = await page.evaluate(async () => {
        const editor = document.createElement("config-entry-panel-editor");
        editor.setConfig({ type: "custom:config-entry-panel", entry_id: "e1" });
        editor.hass = window.fake.makeHass({ id: "u-root", name: "Root", is_admin: true });
        document.getElementById("root").append(editor);
        await new Promise((r) => setTimeout(r, 500));
        const q = (s) => [...editor.shadowRoot.querySelectorAll(s)];
        const add = q("select").find((s) => [...s.options].some((o) => o.value === "person.carl"));
        add.value = "person.carl"; add.dispatchEvent(new Event("change"));
        add.parentElement.querySelector("button").click();
        await new Promise((r) => setTimeout(r, 400));
        // open the hiding section and search
        const hide = q("details.hide")[0];
        hide.open = true;
        const search = hide.querySelector("input[type=search]");
        const visibleBefore = hide.querySelectorAll(".scroll label.check").length;
        search.value = "rssi"; search.dispatchEvent(new Event("input"));
        await new Promise((r) => setTimeout(r, 100));
        const found = [...editor.shadowRoot.querySelectorAll("details.hide")[0].querySelectorAll(".scroll label.check")].map((l) => l.textContent.trim());
        search.value = "zzz"; search.dispatchEvent(new Event("input"));
        await new Promise((r) => setTimeout(r, 100));
        const none = editor.shadowRoot.querySelectorAll("details.hide")[0].querySelector(".scroll").textContent;
        return { carl: window.fake.state.policy.people["person.carl"], text: editor.shadowRoot.textContent.replace(/\s+/g, " "),
          previewHidden: editor.shadowRoot.querySelector("config-entry-panel")?.hasAttribute("hidden"), visibleBefore, found, none,
          overflow: [document.documentElement.scrollWidth, document.documentElement.clientWidth, editor.scrollWidth, editor.clientWidth] };
      });
      assert.deepEqual(result.carl.sections, ["settings", "devices"]);
      assert.equal(result.carl.configure, false, "a new person may change nothing");
      assert.match(result.text, /Anna.*User/);
      assert.equal(result.previewHidden, false, "the preview of a listed person shows their view");
      assert.equal(result.visibleBefore, 8, "all entities are listed before searching");
      assert.deepEqual(result.found.length, 1, "the search narrows the list");
      assert.match(result.found[0], /API signal strength/);
      assert.match(result.none, /No entity matches/);
      assert.ok(result.overflow[0] <= result.overflow[1] && result.overflow[2] <= result.overflow[3], `nothing is wider than the phone: ${result.overflow}`);
      assert.deepEqual(page.errors, []);
      await page.close();
      console.log("e2e: all checks passed");
    } finally {
      await browser.close();
    }
  })().catch((error) => { console.error(error); process.exit(1); });
}
