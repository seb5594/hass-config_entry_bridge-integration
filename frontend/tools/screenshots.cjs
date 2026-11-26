// Renders the README images: the built card in the stand-in Home Assistant of test/browser/fake-ha.cjs,
// with sample data. They show the card's look, they are not captures of a real installation.
//   npm run build && npm run screenshots        (needs Playwright with Chromium)
const path = require("node:path");
const { chromium } = require("playwright");
const { open, mount } = require("../test/browser/e2e.cjs");

const OUT = path.resolve(__dirname, "../../docs/images");

async function shoot(page, name, selector) {
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: path.join(OUT, name) });
  console.log("wrote", name);
}

(async () => {
  const browser = await chromium.launch();
  const scale = { width: 560, height: 900 };
  try {
    // The gear and the menu of a person who may configure and reload.
    let page = await open(browser, "dark", scale);
    await mount(page, "anna");
    await page.locator("#card-u-anna").locator("button[aria-haspopup=menu]").click();
    await page.waitForTimeout(150);
    await shoot(page, "card-dark.png", ".slot");

    // A person who only sees the devices, in the light theme.
    page = await open(browser, "light", scale);
    await mount(page, "ben");
    await shoot(page, "card-light.png", ".slot");

    // The options dialog (the gear), driven by the integration's real flow protocol.
    page = await open(browser, "dark", { width: 640, height: 560 });
    await mount(page, "anna");
    await page.locator("#card-u-anna").locator("button[aria-label='Configure']").click();
    await page.locator("#card-u-anna").locator("config-entry-panel-options").locator("dialog").waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    await shoot(page, "options-dialog.png");

    // Who sees what: administrator, a listed person, and somebody who is not listed.
    page = await open(browser, "dark", { width: 1640, height: 900 });
    await page.addStyleTag({ content: "#root{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:start}.slot{max-width:none;margin:0}.empty{height:120px;border:2px dashed var(--divider-color);border-radius:16px;display:grid;place-items:center;color:var(--secondary-text-color);text-align:center;padding:12px}" });
    for (const [user, label] of [["root", "Administrator: sees everything"], ["anna", "Anna: listed, may configure and reload"], ["carl", "Carl: not listed"]]) {
      await mount(page, user);
      await page.evaluate((text) => { const slots = document.querySelectorAll(".slot"); slots[slots.length - 1].querySelector("h4")?.remove(); const h = document.createElement("h4"); h.textContent = text; slots[slots.length - 1].prepend(h); }, label);
    }
    await page.evaluate(() => { const slot = [...document.querySelectorAll(".slot")].pop(); const note = document.createElement("div"); note.className = "empty"; note.textContent = "The card does not exist for this person. Nothing is shown, not even an empty frame."; slot.append(note); });
    await shoot(page, "who-sees-what.png", "#root");

    // The editor: people, rights, hiding and the preview.
    page = await open(browser, "dark", { width: 580, height: 1500 });
    await page.evaluate(async () => {
      const editor = document.createElement("config-entry-panel-editor");
      editor.setConfig({ type: "custom:config-entry-panel", entry_id: "e1" });
      editor.hass = window.fake.makeHass({ id: "u-root", name: "Root", is_admin: true });
      const slot = document.createElement("div"); slot.className = "slot"; slot.style.maxWidth = "520px"; slot.append(editor);
      document.getElementById("root").append(slot);
      await new Promise((r) => setTimeout(r, 600));
    });
    await shoot(page, "editor.png", ".slot");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
