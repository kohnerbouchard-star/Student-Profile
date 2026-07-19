import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/mounted-modal-focus";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const SURFACES = [
  { action: "add-player", section: "Overview", key: "Enter" },
  { action: "add-contract", section: "Overview", key: "Space" },
  { action: "add-store-item", section: "Store", key: "Enter" },
  { action: "scan-attendance", section: "Overview", key: "Space" },
];

mkdirSync(ARTIFACT_DIR, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

const now = Math.floor(Date.now() / 1000);
const token = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
  sub: ADMIN_ID,
  email: "admin@example.test",
  role: "authenticated",
  iat: now,
  exp: now + 3600,
})}.signature`;

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Mounted Modal Focus Game",
  name: "Mounted Modal Focus Game",
  status: "active",
  gameCode: "FOCUS1",
};

const common = {
  gameId: GAME_ID,
  gameSessionId: GAME_ID,
  activeGameId: GAME_ID,
  selectedGameSessionId: GAME_ID,
  permissions: ["*"],
  roles: ["game_admin"],
  adminRole: "game_admin",
  game,
  activeGame: game,
  players: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0, activePlayerCount: 0, rewardsIssuedCount: 0, rewardsIssuedTotal: 0 },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 },
  contracts: [],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings: { difficultyPreset: "moderate", backendDifficultyPreset: "moderate", difficultyBasePreset: "moderate", priceMultiplier: 1, incomeMultiplier: 1, shockFrequency: 1, shockSeverity: 1, recoverySupport: 1, tradeMultiplier: 1, configSaveState: "saved" },
  logs: [],
  dashboard: { activePlayerCount: 0, totalPlayers: 0, onlinePlayerCount: 0, attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 }, leaderboard: [], recentActivity: [], marketStatus: "open" },
};

function responseFor(pathname) {
  if (pathname.endsWith("/session/bootstrap")) {
    return {
      data: {
        admin: { id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Focus Administrator", email: "admin@example.test", role: "game_admin", roles: ["game_admin"] },
        activeGame: game,
        games: [game],
        permissions: ["*"],
        roles: ["game_admin"],
        adminRole: "game_admin",
        csrfToken: "",
        session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
        capabilities: { notifications: false, securityHistory: "current_session_only", helpArticles: true, auditLogFlags: true, auditLogExport: true, overallScore: false, marketplaceAdminTrading: false },
      },
    };
  }
  return { data: common };
}

async function createPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (request.url().endsWith("/favicon.ico")) return;
    if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
    errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
  });

  await page.addInitScript(({ accessToken, gameId, adminId }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
      accessToken,
      refreshToken: "mounted-modal-focus-refresh-token",
      user: { id: adminId, email: "admin@example.test" },
    }));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
    window.__adminModalPointerEvents = [];
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, (event) => {
        window.__adminModalPointerEvents.push({ type: event.type, target: event.target?.tagName || "" });
      }, true);
    }
  }, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

  await page.route("**/functions/v1/admin-api/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf",
          "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        },
        body: "",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify(responseFor(new URL(request.url()).pathname)),
    });
  });

  return { context, page, errors };
}

async function loadSection(page, section) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  const sectionControl = page.locator(`[data-admin-section="${section}"]`).first();
  await sectionControl.waitFor({ state: "visible", timeout: 15_000 });
  await sectionControl.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction((expectedSection) => {
    const active = [...document.querySelectorAll("[data-admin-section]")].find((node) =>
      node.getAttribute("aria-current") === "page" ||
      node.getAttribute("aria-selected") === "true" ||
      node.classList.contains("active") ||
      node.classList.contains("is-active")
    );
    return active?.getAttribute("data-admin-section") === expectedSection;
  }, section, { timeout: 5000 });
  return sectionControl;
}

async function waitForAction(page, action, section) {
  await page.evaluate(() => window.EconovariaAdminOverviewQuickActions?.reconcile?.());
  await page.waitForFunction(({ action, section }) => {
    const control = [...document.querySelectorAll(`[data-admin-terminal-action="${CSS.escape(action)}"]`)].find((node) => {
      if (!(node instanceof HTMLElement) || node.hidden) return false;
      if (node.closest("[data-admin-shape-skeleton-stage], .admin-shape-surface-overlay")) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    });
    if (!(control instanceof HTMLElement)) return false;
    if (section === "Overview") return Boolean(control.closest("[data-admin-overview-quick-actions]"));
    if (action === "add-store-item" && section === "Store") {
      return !control.hasAttribute("data-admin-overview-hidden") && !control.closest(".admin-overview-quick-actions-card");
    }
    return true;
  }, { action, section }, { timeout: 10_000 });
}

async function tabTo(page, sectionControl, target, label) {
  await sectionControl.focus();
  for (let tabs = 0; tabs <= 50; tabs += 1) {
    if (await target.evaluate((node) => document.activeElement === node)) return tabs;
    await page.keyboard.press("Tab");
  }
  throw new Error(`${label} was not reachable through sequential Tab navigation.`);
}

async function liveFocusBoundary(modal, mode = "read") {
  return modal.evaluate((dialog, requestedMode) => {
    const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
    const describe = (node) => ({
      action: node?.getAttribute?.("data-admin-terminal-action") || "",
      ariaLabel: node?.getAttribute?.("aria-label") || "",
      tag: node?.tagName || "",
      text: (node?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
    });
    if (requestedMode === "focus-last") controls.at(-1)?.focus({ preventScroll: true });
    return {
      count: controls.length,
      first: describe(controls[0]),
      last: describe(controls.at(-1)),
      activeIsFirst: document.activeElement === controls[0],
      activeIsLast: document.activeElement === controls.at(-1),
      active: describe(document.activeElement),
    };
  }, mode);
}

async function exerciseSurface(browser, surface) {
  const { context, page, errors } = await createPage(browser);
  try {
    const sectionControl = await loadSection(page, surface.section);
    await waitForAction(page, surface.action, surface.section);
    const opener = page.locator(`[data-admin-terminal-action="${surface.action}"]:visible`).first();
    await opener.waitFor({ state: "visible", timeout: 10_000 });
    const openerTabs = await tabTo(page, sectionControl, opener, surface.action);
    await page.keyboard.press(surface.key);

    const modal = page.locator(".admin-terminal-modal:visible").first();
    await modal.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(() => {
      const dialog = document.querySelector(".admin-terminal-modal:not([hidden])");
      return dialog instanceof HTMLElement && dialog.contains(document.activeElement);
    }, null, { timeout: 5000 });

    const initial = await page.evaluate(() => ({
      tag: document.activeElement?.tagName || "",
      action: document.activeElement?.getAttribute?.("data-admin-terminal-action") || "",
      inside: Boolean(document.activeElement?.closest?.(".admin-terminal-modal")),
    }));

    const bounds = await liveFocusBoundary(modal, "focus-last");
    assert(bounds.count > 0, `${surface.action} modal contains no focusable controls.`);
    await page.keyboard.press("Tab");
    const forward = await liveFocusBoundary(modal);
    assert(forward.activeIsFirst, `${surface.action} forward Tab did not wrap to live first control: ${JSON.stringify(forward)}.`);
    await page.keyboard.press("Shift+Tab");
    const reverse = await liveFocusBoundary(modal);
    assert(reverse.activeIsLast, `${surface.action} reverse Tab did not wrap to live last control: ${JSON.stringify(reverse)}.`);

    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForFunction((action) => {
      const active = document.activeElement;
      return active instanceof HTMLElement && active.getAttribute("data-admin-terminal-action") === action;
    }, surface.action, { timeout: 5000 });

    const keyboard = await page.evaluate(() => ({
      modality: document.documentElement.getAttribute("data-admin-input-modality"),
      pointerEvents: window.__adminModalPointerEvents || [],
    }));
    assert(keyboard.modality === "keyboard", `${surface.action} lost keyboard modality.`);
    assert(keyboard.pointerEvents.length === 0, `${surface.action} emitted pointer input: ${JSON.stringify(keyboard.pointerEvents)}.`);
    assert(errors.length === 0, `${surface.action} emitted browser errors: ${errors[0]}`);

    return { ...surface, openerTabs, initial, bounds, forward, reverse, restored: true, keyboard };
  } catch (error) {
    await page.screenshot({ path: `${ARTIFACT_DIR}/${surface.action}-failure.png`, fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
const report = { surfaces: [] };

try {
  for (const surface of SURFACES) report.surfaces.push(await exerciseSurface(browser, surface));
  writeFileSync(`${ARTIFACT_DIR}/mounted-modal-focus.json`, JSON.stringify(report, null, 2));
  console.log("Mounted Admin operational modal focus, Escape, and restoration smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(`${ARTIFACT_DIR}/mounted-modal-focus.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
}
