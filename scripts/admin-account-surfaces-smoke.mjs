import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
} from "./admin-quality-smoke-fixture.mjs";

const surfaces = [
  ["open-admin-profile", "Profile", /profile/i],
  ["open-admin-settings", "Settings", /settings|preferences/i],
  ["open-admin-notifications", "Notifications", /notifications|alerts|inbox/i],
  ["open-admin-security", "Security", /security|sessions|access/i],
  ["open-admin-help", "Help", /help|support|guides/i],
  ["open-admin-games", "Games", /games|game sessions/i],
];

const harness = await createQualityHarness("account");
const { page, errors, dir } = harness;
const summaries = [];

await page.addInitScript(() => {
  window.__adminKeyboardPointerEvents = [];
  for (const type of ["pointerdown", "mousedown", "touchstart"]) {
    window.addEventListener(type, (event) => {
      window.__adminKeyboardPointerEvents.push({
        type: event.type,
        target: event.target?.tagName || "",
      });
    }, true);
  }
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function keyboardActivate(locator, key = "Enter") {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.focus();
  assert(
    await locator.evaluate((node) => document.activeElement === node),
    `Keyboard target did not receive focus: ${await locator.textContent()}`,
  );
  await page.keyboard.press(key);
}

async function inspect(action, label) {
  return page.evaluate(({ action, label }) => {
    const visible = (element) => {
      if (!(element instanceof Element) || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        rect.width > 0 && rect.height > 0;
    };
    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .filter(visible)
      .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const visibleFallbacks = [...document.querySelectorAll('img[src*="media-placeholder.svg"]')]
      .filter(visible)
      .filter((image) => image.closest(
        "button, nav, [role='tab'], .admin-terminal-topbar, .admin-terminal-account-page, .admin-terminal-user-menu",
      )).length;
    return {
      action,
      label,
      headings,
      text: (document.querySelector("#adminPreview")?.textContent || "")
        .trim().replace(/\s+/g, " ").slice(0, 1600),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      visibleModals: [...document.querySelectorAll("[data-admin-terminal-modal-backdrop]")]
        .filter(visible).length,
      visibleFallbacks,
      runtimeStyleIds: [...document.querySelectorAll("style[id]")]
        .map((style) => style.id)
        .filter(Boolean),
    };
  }, { action, label });
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector("[data-admin-terminal-user]", { timeout: 15_000 });
  await page.waitForTimeout(1200);

  for (const [actionName, label, expected] of surfaces) {
    const user = page.locator("[data-admin-terminal-user]").first();
    await keyboardActivate(user, "Enter");
    const menu = page.locator("[data-admin-terminal-user-menu]").first();
    await menu.waitFor({ state: "visible", timeout: 5000 });
    const action = menu.locator(`[data-admin-terminal-action="${actionName}"]`).first();
    await keyboardActivate(action, actionName === "open-admin-notifications" ? "Space" : "Enter");
    await page.waitForTimeout(700);

    assert(errors.length === 0, errors[0] || `${label} emitted a browser error.`);
    const summary = await inspect(actionName, label);
    summaries.push(summary);
    assert(summary.documentWidth <= summary.viewportWidth + 2, `${label} overflows horizontally.`);
    assert(summary.visibleModals === 0, `${label} left an unexpected modal open.`);
    assert(summary.visibleFallbacks === 0, `${label} rendered a visible generic fallback in UI chrome.`);
    assert(summary.runtimeStyleIds.length === 0, `${label} contains runtime style tags.`);
    assert(summary.headings.length > 0, `${label} rendered no visible heading.`);
    assert(
      expected.test(`${summary.headings.join(" ")} ${summary.text}`),
      `${label} did not render its expected surface.`,
    );
    await harness.capture(`account-${slug(label)}`);

    const overview = page.locator('[data-admin-section="Overview"]').first();
    await keyboardActivate(overview, "Enter");
    await page.waitForTimeout(350);
  }

  const keyboardEvidence = await page.evaluate(() => ({
    modality: document.documentElement.getAttribute("data-admin-input-modality"),
    pointerEvents: window.__adminKeyboardPointerEvents || [],
  }));
  assert(keyboardEvidence.modality === "keyboard", "Account surfaces lost keyboard modality.");
  assert(
    keyboardEvidence.pointerEvents.length === 0,
    `Account surfaces emitted pointer input: ${JSON.stringify(keyboardEvidence.pointerEvents)}.`,
  );
  writeFileSync(
    `${dir}/account-page-summary.json`,
    JSON.stringify({ summaries, keyboardEvidence }, null, 2),
  );
  await harness.finish({ summaries, keyboardEvidence });
  console.log("All six accepted v606 account surfaces passed by keyboard.");
} catch (error) {
  writeFileSync(
    `${dir}/account-page-summary.json`,
    JSON.stringify({ summaries, errors, failure: error.message }, null, 2),
  );
  await harness.capture("account-surface-failure").catch(() => {});
  await harness.finish({
    summaries,
    failure: error.stack || error.message || String(error),
  });
  throw error;
}
