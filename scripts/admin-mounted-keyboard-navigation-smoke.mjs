import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/keyboard";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "compact", width: 1024, height: 768 },
  { label: "narrow", width: 768, height: 900 },
];
const QUICK_ACTIONS = [
  { action: "add-player", key: "Enter", section: "Overview" },
  { action: "add-contract", key: "Space", section: "Overview" },
  { action: "scan-attendance", key: "Space", section: "Overview" },
  { action: "add-store-item", key: "Enter", section: "Store" },
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
  title: "Keyboard Smoke Game",
  name: "Keyboard Smoke Game",
  status: "active",
  gameCode: "KEYS01",
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
  attendanceSummary: {
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    activePlayerCount: 0,
    rewardsIssuedCount: 0,
    rewardsIssuedTotal: 0,
  },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 },
  contracts: [],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings: {
    difficultyPreset: "moderate",
    backendDifficultyPreset: "moderate",
    difficultyBasePreset: "moderate",
    priceMultiplier: 1,
    incomeMultiplier: 1,
    shockFrequency: 1,
    shockSeverity: 1,
    recoverySupport: 1,
    tradeMultiplier: 1,
    configSaveState: "saved",
  },
  logs: [],
  dashboard: {
    activePlayerCount: 0,
    totalPlayers: 0,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
  },
};

function responseFor(pathname) {
  if (pathname.endsWith("/session/bootstrap")) {
    return {
      data: {
        admin: {
          id: ADMIN_ID,
          accountId: ADMIN_ID,
          displayName: "Keyboard Smoke Administrator",
          email: "admin@example.test",
          role: "game_admin",
          roles: ["game_admin"],
        },
        activeGame: game,
        games: [game],
        permissions: ["*"],
        roles: ["game_admin"],
        adminRole: "game_admin",
        csrfToken: "",
        session: {
          id: ADMIN_ID,
          csrfToken: "",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        capabilities: {
          notifications: false,
          securityHistory: "current_session_only",
          helpArticles: true,
          auditLogFlags: true,
          auditLogExport: true,
          overallScore: false,
          marketplaceAdminTrading: false,
        },
      },
    };
  }
  return { data: common };
}

async function createPage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText || "";
    if (url.endsWith("/favicon.ico")) return;
    if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
    errors.push(`requestfailed: ${request.method()} ${url} ${failure}`);
  });

  await page.addInitScript(({ accessToken, gameId, adminId }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
      accessToken,
      refreshToken: "keyboard-smoke-refresh-token",
      user: { id: adminId, email: "admin@example.test" },
    }));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
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
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    return {
      eligible: !disabled && !excluded && visible,
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

  const eligibleCount = await page.evaluate((excludedSelector) => {
    const selector = "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";
    return [...document.querySelectorAll(selector)].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (("disabled" in node && node.disabled === true) || node.getAttribute("aria-disabled") === "true") return false;
      if (node.closest(excludedSelector)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }).length;
  }, EXCLUDED_SELECTOR);
  const steps = Math.max(3, Math.min(12, eligibleCount - 1));
  const forward = [];

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    const detail = await activeElementDetail(page);
    assert(detail.eligible, `${section} Tab entered an excluded control: ${JSON.stringify(detail)}.`);
    forward.push(detail);
  }

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Shift+Tab");
    const detail = await activeElementDetail(page);
    assert(detail.eligible, `${section} Shift+Tab entered an excluded control: ${JSON.stringify(detail)}.`);
  }

  assert(
    await startControl.evaluate((node) => document.activeElement === node),
    `${section} Shift+Tab did not reverse the sequential focus path back to its starting control.`,
  );

  return forward;
}

async function exerciseNavigation(browser, viewport) {
  const { context, page, errors } = await createPage(browser, viewport);
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
    await context.close();
  }
}

async function waitForAuthoritativeAction(page, item) {
  await page.evaluate(() => window.EconovariaAdminOverviewQuickActions?.reconcile?.());
  await page.waitForFunction(({ action, section }) => {
    const controls = [...document.querySelectorAll(`[data-admin-terminal-action="${CSS.escape(action)}"]`)];
    const control = controls.find((node) => {
      if (!(node instanceof HTMLElement) || node.hidden) return false;
      if (node.closest("[data-admin-shape-skeleton-stage], .admin-shape-surface-overlay")) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    });
    if (!(control instanceof HTMLElement)) return false;
    if (section === "Overview") {
      return Boolean(control.closest("[data-admin-overview-quick-actions]"));
    }
    if (action === "add-store-item" && section === "Store") {
      return !control.hasAttribute("data-admin-overview-hidden") &&
        !control.closest(".admin-overview-quick-actions-card");
    }
    return true;
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

async function exerciseQuickActions(browser) {
  const viewport = { width: 1440, height: 1000 };
  const results = [];

  for (const item of QUICK_ACTIONS) {
    const { context, page, errors } = await createPage(browser, viewport);
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
      await context.close();
    }
  }

  return { viewport, results };
}

const browser = await chromium.launch({ headless: true });
const report = { navigation: [], quickActions: null };

try {
  for (const viewport of VIEWPORTS) {
    report.navigation.push(await exerciseNavigation(browser, viewport));
  }
  report.quickActions = await exerciseQuickActions(browser);
  writeFileSync(`${ARTIFACT_DIR}/mounted-keyboard-navigation.json`, JSON.stringify(report, null, 2));
  console.log("Mounted Admin keyboard-only navigation and authoritative quick-action smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(`${ARTIFACT_DIR}/mounted-keyboard-navigation.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
}
