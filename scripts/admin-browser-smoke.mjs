import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
} from "./admin-quality-smoke-fixture.mjs";

const VIEWPORT_VALUE = process.env.ADMIN_SMOKE_VIEWPORT || "1440x1000";
const [viewportWidth, viewportHeight] = VIEWPORT_VALUE.split("x").map(Number);

if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
  throw new Error(`Invalid ADMIN_SMOKE_VIEWPORT: ${VIEWPORT_VALUE}`);
}

function slug(value) {
  return String(value || "page")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page";
}

const harness = await createQualityHarness("admin-browser-smoke");
const { page, errors, dir } = harness;
const consoleMessages = [];
const pageSummaries = [];

await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
page.on("console", (message) => {
  const entry = `${message.type()}: ${message.text()}`;
  consoleMessages.push(entry);
  if (message.type() === "error") errors.push(entry);
});

async function assertNoHorizontalOverflow(section) {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  if (overflow.documentWidth > overflow.viewportWidth + 2) {
    throw new Error(
      `${section} overflows horizontally at ${VIEWPORT_VALUE}: ` +
      `${overflow.documentWidth}px document / ${overflow.viewportWidth}px viewport`,
    );
  }
}

async function inspectCurrentPage(item) {
  return page.evaluate(({ section, label, viewport }) => {
    function visible(element) {
      if (!(element instanceof Element) || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        rect.width > 0 && rect.height > 0;
    }

    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .filter(visible)
      .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const visibleModals = [...document.querySelectorAll("[data-admin-terminal-modal-backdrop]")]
      .filter(visible).length;
    const uiFallbacks = [...document.querySelectorAll('img[src*="media-placeholder.svg"]')]
      .filter((image) => image.closest(
        "button, nav, [role='tab'], .admin-terminal-topbar, .admin-terminal-player-row, .admin-terminal-side-nav",
      )).length;
    const playerOnlyMarkers = [...document.querySelectorAll([
      "[data-admin-player-profile-identity-editor]",
      "[data-admin-player-created-confirmation]",
      "[data-admin-terminal-player-drawer]",
      "[data-admin-player-create-credential-field]",
    ].join(","))].filter(visible).length;
    const styleIds = [...document.querySelectorAll("style[id]")]
      .map((style) => style.id)
      .filter(Boolean)
      .sort();
    const activeNav = [...document.querySelectorAll("[data-admin-section]")].find((node) =>
      node.getAttribute("aria-current") === "page" ||
      node.getAttribute("aria-selected") === "true" ||
      node.classList.contains("active") ||
      node.classList.contains("is-active")
    );

    return {
      section,
      label,
      viewport,
      headings,
      visibleModals,
      uiFallbacks,
      playerOnlyMarkers,
      styleIds,
      activeSection: activeNav?.getAttribute("data-admin-section") || "",
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  }, {
    section: item.section,
    label: item.label,
    viewport: VIEWPORT_VALUE,
  });
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector("[data-admin-section]", { timeout: 15_000 });
  await page.waitForTimeout(1500);

  const diagnostic = await page.evaluate(() => {
    const feature = window.Econovaria?.features?.adminOverviewTerminal;
    return {
      authState: feature?.authState || null,
      model: feature?.currentModel || null,
      currentSession: window.currentSession || null,
    };
  });
  writeFileSync(`${dir}/runtime-state.json`, JSON.stringify(diagnostic, null, 2));

  const nav = await page.locator("[data-admin-section]").evaluateAll((nodes) => nodes.map((node) => ({
    label: (node.textContent || "").trim().replace(/\s+/g, " "),
    section: node.getAttribute("data-admin-section"),
    disabled: "disabled" in node ? Boolean(node.disabled) : node.getAttribute("aria-disabled") === "true",
    title: node.getAttribute("title"),
    ariaCurrent: node.getAttribute("aria-current"),
  })));

  if (nav.length < 8) {
    throw new Error(`Expected at least 8 navigation controls, received ${nav.length}.`);
  }
  const disabled = nav.filter((item) => item.disabled);
  if (disabled.length) {
    throw new Error(
      `Navigation controls are disabled: ${disabled.map((item) => item.section || item.label).join(", ")}`,
    );
  }

  await assertNoHorizontalOverflow("initial shell");

  for (const item of nav) {
    const locator = page.locator(`[data-admin-section="${item.section}"]`).first();
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(300);
    if (errors.length) throw new Error(`Runtime error after clicking ${item.section}: ${errors[0]}`);
    await assertNoHorizontalOverflow(item.section || item.label);

    const summary = await inspectCurrentPage(item);
    pageSummaries.push(summary);
    if (summary.visibleModals !== 0) {
      throw new Error(`${item.section} left ${summary.visibleModals} unexpected modal(s) open.`);
    }
    if (summary.uiFallbacks !== 0) {
      throw new Error(`${item.section} rendered ${summary.uiFallbacks} generic fallback image(s) in UI chrome.`);
    }
    if (item.section !== "Players" && summary.playerOnlyMarkers !== 0) {
      throw new Error(`${item.section} contains ${summary.playerOnlyMarkers} visible player-only runtime marker(s).`);
    }
    if (!summary.headings.length) {
      throw new Error(`${item.section} rendered no visible page heading.`);
    }

    await harness.capture(`page-${slug(item.section || item.label)}-${slug(VIEWPORT_VALUE)}`);
  }

  writeFileSync(
    `${dir}/page-diff-summary.json`,
    JSON.stringify({ viewport: VIEWPORT_VALUE, pages: pageSummaries }, null, 2),
  );

  const actionCount = await page.locator(
    "button[data-admin-terminal-action]:not([disabled]), [role=button][data-admin-terminal-action]:not([aria-disabled=true])",
  ).count();
  if (actionCount === 0) throw new Error("No enabled delegated action controls were rendered.");
  if (errors.length) throw new Error(errors[0]);

  await harness.capture("admin-browser-smoke-pass");
  await harness.finish({
    viewport: VIEWPORT_VALUE,
    pages: pageSummaries,
    consoleMessages,
  });
  console.log(`Admin browser interaction and full-page drift smoke passed at ${VIEWPORT_VALUE}.`);
} catch (error) {
  writeFileSync(
    `${dir}/page-diff-summary.json`,
    JSON.stringify({ viewport: VIEWPORT_VALUE, pages: pageSummaries, failure: error.message }, null, 2),
  );
  await harness.capture("admin-browser-smoke-failure").catch(() => {});
  await harness.finish({
    viewport: VIEWPORT_VALUE,
    pages: pageSummaries,
    consoleMessages,
    failure: error.stack || error.message || String(error),
  });
  throw error;
}
