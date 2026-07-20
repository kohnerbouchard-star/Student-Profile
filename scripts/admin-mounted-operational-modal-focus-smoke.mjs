import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const OUT = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/mounted-modal-focus";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const SURFACES = [
  ["add-player", "Overview", "Enter"],
  ["add-contract", "Overview", "Space"],
  ["add-store-item", "Store", "Enter"],
  ["scan-attendance", "Overview", "Space"],
];
mkdirSync(OUT, { recursive: true });

function assert(value, message) { if (!value) throw new Error(message); }
function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
const now = Math.floor(Date.now() / 1000);
const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: ADMIN_ID, email: "admin@example.test", role: "authenticated", iat: now, exp: now + 3600 })}.signature`;
const game = { id: GAME_ID, gameSessionId: GAME_ID, title: "Modal Focus Game", name: "Modal Focus Game", status: "active", gameCode: "FOCUS1" };
const common = {
  gameId: GAME_ID, gameSessionId: GAME_ID, activeGameId: GAME_ID, selectedGameSessionId: GAME_ID,
  permissions: ["*"], roles: ["game_admin"], adminRole: "game_admin", game, activeGame: game,
  players: [], attendance: [], attendanceRows: [], attendanceHistory: [], attendanceLedger: [],
  attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0, activePlayerCount: 0, rewardsIssuedCount: 0, rewardsIssuedTotal: 0 },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 }, contracts: [], store: [], storeItems: [],
  assets: [], trades: [], events: [], market: { assets: [], trades: [], events: [] },
  settings: { difficultyPreset: "moderate", backendDifficultyPreset: "moderate", difficultyBasePreset: "moderate", priceMultiplier: 1, incomeMultiplier: 1, shockFrequency: 1, shockSeverity: 1, recoverySupport: 1, tradeMultiplier: 1, configSaveState: "saved" },
  logs: [], dashboard: { activePlayerCount: 0, totalPlayers: 0, onlinePlayerCount: 0, attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 }, leaderboard: [], recentActivity: [], marketStatus: "open" },
};
function response(path) {
  if (!path.endsWith("/session/bootstrap")) return { data: common };
  return { data: {
    admin: { id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Focus Administrator", email: "admin@example.test", role: "game_admin", roles: ["game_admin"] },
    activeGame: game, games: [game], permissions: ["*"], roles: ["game_admin"], adminRole: "game_admin", csrfToken: "",
    session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
    capabilities: { notifications: false, securityHistory: "current_session_only", helpArticles: true, auditLogFlags: true, auditLogExport: true, overallScore: false, marketplaceAdminTrading: false },
  }};
}

async function runtime(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => {
    const failure = request.failure()?.errorText || "";
    if (request.url().endsWith("/favicon.ico")) return;
    if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
    errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
  });
  await page.addInitScript(({ accessToken, gameId, adminId }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({ accessToken, refreshToken: "modal-focus-refresh", user: { id: adminId, email: "admin@example.test" } }));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
    window.__modalPointerEvents = [];
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, event => window.__modalPointerEvents.push({ type, target: event.target?.tagName || "" }), true);
    }
  }, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });
  await page.route("**/functions/v1/admin-api/**", async route => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      }, body: "" });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "cache-control": "no-store" }, body: JSON.stringify(response(new URL(request.url()).pathname)) });
  });
  return { context, page, errors };
}

async function selectSection(page, name) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  const control = page.locator(`[data-admin-section="${name}"]`).first();
  await control.waitFor({ state: "visible", timeout: 15_000 });
  await control.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(expected => [...document.querySelectorAll("[data-admin-section]")].some(node =>
    node.getAttribute("data-admin-section") === expected && (
      node.getAttribute("aria-current") === "page" || node.getAttribute("aria-selected") === "true" ||
      node.classList.contains("active") || node.classList.contains("is-active")
    )), name, { timeout: 5000 });
  return control;
}

async function visibleAction(page, action) {
  await page.waitForFunction(() => typeof window.EconovariaAdminOverviewQuickActions?.reconcile === "function", null, { timeout: 15_000 });
  await page.evaluate(() => window.EconovariaAdminOverviewQuickActions.reconcile());
  await page.waitForFunction(expected => [...document.querySelectorAll(`[data-admin-terminal-action="${CSS.escape(expected)}"]`)].some(node => {
    if (!(node instanceof HTMLElement) || node.hidden || node.closest("[data-admin-shape-skeleton-stage], .admin-shape-surface-overlay")) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
  }), action, { timeout: 15_000 });
  return page.locator(`[data-admin-terminal-action="${action}"]:visible`).first();
}

async function tabTo(page, start, target, label) {
  await start.focus();
  for (let count = 0; count <= 50; count += 1) {
    if (await target.evaluate(node => document.activeElement === node)) return count;
    await page.keyboard.press("Tab");
  }
  throw new Error(`${label} was not reachable through Tab navigation.`);
}

async function boundary(modal, focusLast = false) {
  return modal.evaluate((dialog, shouldFocusLast) => {
    const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
    if (shouldFocusLast) controls.at(-1)?.focus({ preventScroll: true });
    const describe = node => ({ action: node?.getAttribute?.("data-admin-terminal-action") || "", tag: node?.tagName || "", text: (node?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80) });
    return {
      count: controls.length,
      first: describe(controls[0]),
      last: describe(controls.at(-1)),
      activeIsFirst: document.activeElement === controls[0],
      activeIsLast: document.activeElement === controls.at(-1),
      forwardBoundaryReached: dialog.dataset.adminForwardBoundaryReached === "true",
      reverseBoundaryReached: dialog.dataset.adminReverseBoundaryReached === "true",
      active: describe(document.activeElement),
    };
  }, focusLast);
}

async function waitForBoundaryFocus(page, edge) {
  await page.waitForFunction(expectedEdge => {
    const dialog = document.querySelector(".admin-terminal-modal:not([hidden])");
    if (!(dialog instanceof HTMLElement)) return false;
    const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
    const expected = expectedEdge === "first" ? controls[0] : controls.at(-1);
    if (expectedEdge === "first" && dialog.dataset.adminForwardBoundaryReached === "true") return true;
    if (expectedEdge === "last" && dialog.dataset.adminReverseBoundaryReached === "true") return true;
    return Boolean(expected) && document.activeElement === expected;
  }, edge, { timeout: 2000 });
}

async function traceBoundary(modal, edge) {
  await modal.evaluate((dialog, expectedEdge) => {
    const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
    const target = expectedEdge === "first" ? controls[0] : controls.at(-1);
    const datasetKey = expectedEdge === "first" ? "adminForwardBoundaryReached" : "adminReverseBoundaryReached";
    dialog.dataset[datasetKey] = "false";
    const onFocus = event => {
      if (event.target !== target) return;
      dialog.dataset[datasetKey] = "true";
      dialog.removeEventListener("focusin", onFocus, true);
    };
    dialog.addEventListener("focusin", onFocus, true);
  }, edge);
}

async function exercise(browser, [action, section, key]) {
  const { context, page, errors } = await runtime(browser);
  try {
    const sectionControl = await selectSection(page, section);
    const opener = await visibleAction(page, action);
    const openerTabs = await tabTo(page, sectionControl, opener, action);
    await page.keyboard.press(key);
    const modal = page.locator(".admin-terminal-modal:visible").first();
    await modal.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(() => {
      const dialog = document.querySelector(".admin-terminal-modal:not([hidden])");
      return dialog instanceof HTMLElement && dialog.contains(document.activeElement);
    }, null, { timeout: 5000 });
    const initial = await page.evaluate(() => ({ tag: document.activeElement?.tagName || "", action: document.activeElement?.getAttribute?.("data-admin-terminal-action") || "", inside: Boolean(document.activeElement?.closest?.(".admin-terminal-modal")) }));
    const bounds = await boundary(modal, true);
    assert(bounds.count > 0, `${action} modal contains no focusable controls.`);
    await traceBoundary(modal, "first");
    await page.keyboard.press("Tab");
    await waitForBoundaryFocus(page, "first");
    const forward = await boundary(modal);
    assert(forward.activeIsFirst || forward.forwardBoundaryReached, `${action} forward wrap failed: ${JSON.stringify(forward)}.`);
    await traceBoundary(modal, "last");
    await page.keyboard.press("Shift+Tab");
    await waitForBoundaryFocus(page, "last");
    const reverse = await boundary(modal);
    assert(reverse.activeIsLast || reverse.reverseBoundaryReached, `${action} reverse wrap failed: ${JSON.stringify(reverse)}.`);
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForFunction(expected => document.activeElement?.getAttribute?.("data-admin-terminal-action") === expected, action, { timeout: 5000 });
    const keyboard = await page.evaluate(() => ({ modality: document.documentElement.getAttribute("data-admin-input-modality"), pointerEvents: window.__modalPointerEvents || [] }));
    assert(keyboard.modality === "keyboard", `${action} lost keyboard modality.`);
    assert(keyboard.pointerEvents.length === 0, `${action} emitted pointer input.`);
    assert(errors.length === 0, `${action} emitted browser errors: ${errors[0]}`);
    return { action, section, key, openerTabs, initial, bounds, forward, reverse, restored: true, keyboard };
  } catch (error) {
    await page.screenshot({ path: `${OUT}/${action}-failure.png`, fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
const report = { surfaces: [] };
try {
  for (const surface of SURFACES) report.surfaces.push(await exercise(browser, surface));
  writeFileSync(`${OUT}/mounted-modal-focus.json`, JSON.stringify(report, null, 2));
  console.log("Mounted Admin operational modal focus, Escape, and restoration smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(`${OUT}/mounted-modal-focus.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
}
