import { mkdirSync, writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
} from "./admin-quality-smoke-fixture.mjs";

const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/keyboard";
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "compact", width: 1024, height: 768 },
  { label: "narrow", width: 768, height: 900 },
];
const QUICK_ACTIONS = [
  { action: "add-player", key: "Enter", section: "Overview" },
  { action: "add-contract", key: "Space", section: "Overview" },
  { action: "scan-attendance", key: "Space", section: "Overview" },
  { action: "add-store-item", key: "Enter", section: "Overview" },
];
const EXCLUDED_SELECTOR = [
  "[hidden]",
  "[inert]",
  '[aria-hidden="true"]',
  '[data-admin-stale="true"]',
  "[data-admin-shape-skeleton-route]",
  "[data-admin-shape-skeleton-stage]",
  "[data-admin-shape-surface-overlay]",
  ".admin-qol-page-skeleton",
  ".admin-shape-skeleton-stage",
  ".admin-shape-surface-overlay",
].join(", ");

mkdirSync(ARTIFACT_DIR, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createPage(viewport, label) {
  const harness = await createQualityHarness(`mounted-keyboard-${label}`);
  harness.state.delayReads = false;
  harness.state.writeDelay = 0;
  await harness.page.setViewportSize(viewport);
  harness.page.on("console", (message) => {
    if (message.type() === "error") harness.errors.push(`console: ${message.text()}`);
  });
  return harness;
}

async function loadAdmin(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector("[data-admin-section]", { timeout: 15_000 });
  await page.waitForTimeout(750);
}

async function activeElementDetail(page) {
  return page.evaluate((excludedSelector) => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement)) return { eligible: false, label: "missing-active-element" };
    const disabled = ("disabled" in node && node.disabled === true) || node.getAttribute("aria-disabled") === "true";
    const excluded = Boolean(node.closest(excludedSelector));
    const focusable = node.matches("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])") && node.tabIndex >= 0;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    return {
      eligible: focusable && !disabled && !excluded && visible,
      focusable,
      disabled,
      excluded,
      visible,
      tag: node.tagName,
      id: node.id || "",
      section: node.getAttribute("data-admin-section") || "",
      action: node.getAttribute("data-admin-terminal-action") || "",
      role: node.getAttribute("role") || "",
      text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
    };
  }, EXCLUDED_SELECTOR);
}

async function tabRoundTrip(page, startControl, section) {
  await startControl.focus();
  assert(await startControl.evaluate((node) => document.activeElement === node), `${section} navigation control could not receive focus.`);

  const sequence = await page.evaluate(({ excludedSelector, section }) => {
    const selector = "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";
    const controls = [...document.querySelectorAll(selector)].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (("disabled" in node && node.disabled === true) || node.getAttribute("aria-disabled") === "true") return false;
      if (node.closest(excludedSelector)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return node.tabIndex >= 0 && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const startIndex = controls.findIndex((node) => node.getAttribute("data-admin-section") === section);
    return { count: controls.length, startIndex };
  }, { excludedSelector: EXCLUDED_SELECTOR, section });
  assert(sequence.startIndex >= 0, `${section} navigation control was absent from the sequential focus order.`);
  const remaining = Math.max(1, sequence.count - sequence.startIndex - 1);
  const steps = Math.max(1, Math.min(8, remaining));
  const forward = [];

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    const detail = await activeElementDetail(page);
    assert(detail.eligible, `${section} Tab entered an excluded or non-focusable control: ${JSON.stringify(detail)}.`);
    forward.push(detail);
  }

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Shift+Tab");
    const detail = await activeElementDetail(page);
    assert(detail.eligible, `${section} Shift+Tab entered an excluded or non-focusable control: ${JSON.stringify(detail)}.`);
  }

  let returned = await startControl.evaluate((node) => document.activeElement === node);
  for (let recovery = 0; !returned && recovery < 8; recovery += 1) {
    await page.keyboard.press("Shift+Tab");
    const detail = await activeElementDetail(page);
    assert(detail.eligible, `${section} Shift+Tab recovery entered an excluded or non-focusable control: ${JSON.stringify(detail)}.`);
    returned = await startControl.evaluate((node) => document.activeElement === node);
  }
  assert(returned, `${section} Shift+Tab could not return to the starting navigation control.`);

  return forward;
}

async function exerciseNavigation(viewport) {
  const harness = await createPage(viewport, `navigation-${viewport.label}`);
  const { page, errors } = harness;
  const sections = [];

  try {
    await loadAdmin(page);
    const nav = await page.locator("[data-admin-section]").evaluateAll((nodes) => nodes.map((node) => ({
      section: node.getAttribute("data-admin-section") || "",
      label: (node.textContent || "").trim().replace(/\s+/g, " "),
      disabled: ("disabled" in node && node.disabled === true) || node.getAttribute("aria-disabled") === "true",
    })));
    assert(nav.length >= 8, `Expected at least eight Admin sections at ${viewport.width}x${viewport.height}; received ${nav.length}.`);
    assert(!nav.some((item) => item.disabled), `Admin navigation contains disabled controls: ${JSON.stringify(nav)}.`);

    const first = page.locator("[data-admin-section]").first();
    await first.focus();

    for (let index = 0; index < nav.length; index += 1) {
      const item = nav[index];
      if (index > 0) await page.keyboard.press("ArrowDown");
      const current = page.locator(`[data-admin-section="${item.section}"]`).first();
      assert(
        await current.evaluate((node) => document.activeElement === node),
        `ArrowDown did not focus ${item.section} at ${viewport.width}x${viewport.height}.`,
      );

      await page.keyboard.press("Enter");
      await page.waitForFunction((section) => {
        const active = [...document.querySelectorAll("[data-admin-section]")].find((node) =>
          node.getAttribute("aria-current") === "page" ||
          node.getAttribute("aria-selected") === "true" ||
          node.classList.contains("active") ||
          node.classList.contains("is-active")
        );
        return active?.getAttribute("data-admin-section") === section;
      }, item.section, { timeout: 5000 });
      await page.waitForTimeout(250);

      const tabSequence = await tabRoundTrip(page, current, item.section);
      sections.push({ section: item.section, tabSequence });
    }

    assert(errors.length === 0, `Mounted Admin navigation emitted browser errors: ${errors[0]}`);
    return { viewport, sections, errors };
  } finally {
    await harness.finish({ viewport, sections });
  }
}

async function waitForAuthoritativeAction(page, item) {
  await page.waitForFunction(({ action }) => {
    const controls = [...document.querySelectorAll(`[data-admin-terminal-action="${CSS.escape(action)}"]`)];
    const control = controls.find((node) => {
      if (!(node instanceof HTMLElement) || node.hidden) return false;
      if (node.closest("[data-admin-shape-skeleton-stage], .admin-shape-surface-overlay")) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    });
    return control instanceof HTMLElement &&
      !control.closest(".admin-overview-quick-actions-card, [data-admin-overview-quick-actions]") &&
      !control.hasAttribute("data-admin-overview-hidden");
  }, item, { timeout: 10_000 });
}

async function tabToControl(page, startControl, control, label) {
  await startControl.focus();
  assert(await startControl.evaluate((node) => document.activeElement === node), `${label} starting section did not regain focus.`);
  for (let tabs = 0; tabs <= 40; tabs += 1) {
    if (await control.evaluate((node) => document.activeElement === node)) return tabs;
    await page.keyboard.press("Tab");
  }
  throw new Error(`${label} was not reachable through sequential keyboard navigation.`);
}

async function exerciseQuickActions() {
  const viewport = { width: 1440, height: 1000 };
  const results = [];

  for (const item of QUICK_ACTIONS) {
    const harness = await createPage(viewport, `quick-action-${item.action}`);
    const { page, errors } = harness;
    try {
      await loadAdmin(page);
      const sectionControl = page.locator(`[data-admin-section="${item.section}"]`).first();
      await sectionControl.focus();
      assert(
        await sectionControl.evaluate((node) => document.activeElement === node),
        `${item.section} could not receive keyboard focus for ${item.action}.`,
      );
      await page.keyboard.press("Enter");
      await page.waitForFunction((section) => {
        const active = [...document.querySelectorAll("[data-admin-section]")].find((node) =>
          node.getAttribute("aria-current") === "page" ||
          node.getAttribute("aria-selected") === "true" ||
          node.classList.contains("active") ||
          node.classList.contains("is-active")
        );
        return active?.getAttribute("data-admin-section") === section;
      }, item.section, { timeout: 5000 });
      await waitForAuthoritativeAction(page, item);

      assert(await page.locator(".admin-overview-quick-actions-card").count() === 0, "Loader work created a Quick Actions relocation card.");
      const control = page.locator(`[data-admin-terminal-action="${item.action}"]:visible`).first();
      await control.waitFor({ state: "visible", timeout: 10_000 });
      const disabled = await control.evaluate((node) =>
        ("disabled" in node && node.disabled === true) || node.getAttribute("aria-disabled") === "true"
      );
      assert(!disabled, `${item.action} is disabled.`);
      const tabs = await tabToControl(page, sectionControl, control, item.action);
      await page.keyboard.press(item.key);
      await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5000 });
      const modality = await page.evaluate(() => document.documentElement.getAttribute("data-admin-input-modality"));
      assert(modality === "keyboard", `${item.action} did not retain keyboard input modality.`);
      assert(errors.length === 0, `${item.action} emitted browser errors: ${errors[0]}`);
      results.push({ ...item, tabs, modalOpened: true });
    } finally {
      await harness.finish({ viewport, item, results });
    }
  }

  return { viewport, results };
}

const report = { navigation: [], quickActions: null };

try {
  for (const viewport of VIEWPORTS) {
    report.navigation.push(await exerciseNavigation(viewport));
  }
  report.quickActions = await exerciseQuickActions();
  writeFileSync(`${ARTIFACT_DIR}/mounted-keyboard-navigation.json`, JSON.stringify(report, null, 2));
  console.log("Mounted Admin keyboard-only navigation and original header-action smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(`${ARTIFACT_DIR}/mounted-keyboard-navigation.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
}
