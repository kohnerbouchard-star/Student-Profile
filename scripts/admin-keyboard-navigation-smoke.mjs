import { chromium } from "playwright";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

try {
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head><meta charset="utf-8"><title>Admin keyboard smoke</title></head>
      <body>
        <nav aria-label="Admin sections">
          <button data-admin-section="Overview">Overview</button>
          <button data-admin-section="Players">Players</button>
          <button data-admin-section="Contracts">Contracts</button>
          <button data-admin-section="Store">Store</button>
        </nav>
        <div role="tablist" aria-label="Player detail sections">
          <button role="tab" aria-selected="true">Overview</button>
          <button role="tab" aria-selected="false">Assets</button>
          <button role="tab" aria-selected="false">Inventory</button>
        </div>
        <div role="button" tabindex="0" data-admin-terminal-action="open-test">Open test action</div>
      </body>
    </html>`);

  await page.addStyleTag({ path: resolve("admin/css/keyboard-navigation.css") });
  await page.addScriptTag({ path: resolve("admin/keyboard-navigation.js") });
  await page.evaluate(() => {
    window.__adminKeyboardActivations = 0;
    document.querySelector('[data-admin-terminal-action="open-test"]')?.addEventListener("click", () => {
      window.__adminKeyboardActivations += 1;
    });
    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll('[role="tab"]').forEach((candidate) => {
          candidate.setAttribute("aria-selected", candidate === tab ? "true" : "false");
        });
      });
    });
  });

  const sections = page.locator("[data-admin-section]");
  await sections.nth(0).focus();
  await page.keyboard.press("ArrowDown");
  assert(await sections.nth(1).evaluate((node) => document.activeElement === node), "ArrowDown did not move to the next Admin section.");

  await page.keyboard.press("End");
  assert(await sections.nth(3).evaluate((node) => document.activeElement === node), "End did not move to the last Admin section.");

  await page.keyboard.press("ArrowRight");
  assert(await sections.nth(0).evaluate((node) => document.activeElement === node), "Arrow navigation did not wrap to the first Admin section.");

  await page.keyboard.press("Home");
  assert(await sections.nth(0).evaluate((node) => document.activeElement === node), "Home did not retain the first Admin section.");

  const tabs = page.locator('[role="tab"]');
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  assert(await tabs.nth(1).evaluate((node) => document.activeElement === node), "ArrowRight did not move to the next Admin tab.");
  assert(await tabs.nth(1).getAttribute("aria-selected") === "true", "ArrowRight did not activate the newly focused Admin tab.");

  await page.keyboard.press("ArrowLeft");
  assert(await tabs.nth(0).getAttribute("aria-selected") === "true", "ArrowLeft did not restore the previous Admin tab.");

  const action = page.locator('[data-admin-terminal-action="open-test"]');
  await action.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  assert(await page.evaluate(() => window.__adminKeyboardActivations) === 2, "Non-native Admin action did not support Enter and Space activation.");

  assert(
    await page.evaluate(() => document.documentElement.getAttribute("data-admin-input-modality")) === "keyboard",
    "Keyboard modality was not recorded.",
  );

  const outlineStyle = await action.evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  assert(outlineStyle.style !== "none" && outlineStyle.width !== "0px", "Keyboard focus is not visibly outlined.");

  await action.dispatchEvent("pointerdown");
  assert(
    await page.evaluate(() => document.documentElement.getAttribute("data-admin-input-modality")) === "pointer",
    "Pointer modality did not replace keyboard modality.",
  );

  console.log("Admin keyboard navigation browser smoke passed.");
} finally {
  await browser.close();
}
