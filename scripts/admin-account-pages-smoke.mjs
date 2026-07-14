import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/account";
const GAME_ID = "00000000-0000-4000-8000-000000000701";
const ADMIN_ID = "00000000-0000-4000-8000-000000000702";
mkdirSync(ARTIFACT_DIR, { recursive: true });

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function slug(value) {
  return String(value || "account")
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
  title: "Account Surface Audit Game",
  name: "Account Surface Audit Game",
  status: "active",
  gameCode: "ACCT01",
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
  games: [game],
  players: [],
  roster: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  contracts: [],
  contractSubmissions: [],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  logs: [],
  notifications: [],
  adminNotifications: [],
  adminProfile: {
    id: ADMIN_ID,
    displayName: "Smoke Test Administrator",
    email: "admin@example.test",
    role: "game_admin",
    avatarUrl: "",
  },
  adminSettings: {},
  adminSecurity: {
    sessions: [],
    currentSession: null,
  },
  adminHelp: { articles: [] },
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

function bootstrapResponse() {
  return {
    data: {
      admin: {
        id: ADMIN_ID,
        accountId: ADMIN_ID,
        displayName: "Smoke Test Administrator",
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

const accountSurfaces = [
  { action: "open-admin-profile", label: "Profile", expected: /profile/i },
  { action: "open-admin-settings", label: "Settings", expected: /settings|preferences/i },
  { action: "open-admin-notifications", label: "Notifications", expected: /notifications|alerts|inbox/i },
  { action: "open-admin-security", label: "Security", expected: /security|sessions|access/i },
  { action: "open-admin-help", label: "Help", expected: /help|support|guides/i },
  { action: "open-admin-games", label: "Games", expected: /games|game sessions/i },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const summaries = [];

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
    refreshToken: "account-smoke-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
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
    body: JSON.stringify(pathname.endsWith("/session/bootstrap") ? bootstrapResponse() : { data: common }),
  });
});

async function capture(name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/${name}.html`, await page.content());
}

async function openUserMenu() {
  const button = page.locator("[data-admin-terminal-user]").first();
  await button.waitFor({ state: "visible", timeout: 8000 });
  await button.click();
  const menu = page.locator("[data-admin-terminal-user-menu]").first();
  await menu.waitFor({ state: "visible", timeout: 5000 });
  return menu;
}

async function inspectSurface(surface) {
  return page.evaluate(({ action, label }) => {
    function visible(element) {
      if (!(element instanceof Element) || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }
    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .filter(visible)
      .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const uiFallbacks = [...document.querySelectorAll('img[src*="media-placeholder.svg"]')]
      .filter((image) => image.closest(
        "button, nav, [role='tab'], .admin-terminal-topbar, .admin-terminal-account-page, .admin-terminal-user-menu",
      )).length;
    return {
      action,
      label,
      headings,
      text: (document.querySelector("#adminPreview")?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 1200),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      visibleModals: [...document.querySelectorAll("[data-admin-terminal-modal-backdrop]")].filter(visible).length,
      uiFallbacks,
      inlineStyleIds: [...document.querySelectorAll("style[id]")].map((style) => style.id).filter(Boolean),
    };
  }, { action: surface.action, label: surface.label });
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector("[data-admin-terminal-user]", { timeout: 15_000 });
  await page.waitForTimeout(1200);

  for (const surface of accountSurfaces) {
    const menu = await openUserMenu();
    const action = menu.locator(`[data-admin-terminal-action="${surface.action}"]`).first();
    await action.waitFor({ state: "visible", timeout: 5000 });
    await action.click();
    await page.waitForTimeout(700);

    assert(errors.length === 0, errors[0] || `${surface.label} emitted a browser error.`);
    const summary = await inspectSurface(surface);
    summaries.push(summary);

    assert(
      summary.documentWidth <= summary.viewportWidth + 2,
      `${surface.label} overflows horizontally: ${summary.documentWidth}px / ${summary.viewportWidth}px.`,
    );
    assert(summary.visibleModals === 0, `${surface.label} left an unexpected modal open.`);
    assert(summary.uiFallbacks === 0, `${surface.label} rendered a generic fallback image in UI chrome.`);
    assert(summary.inlineStyleIds.length === 0, `${surface.label} contains runtime style tags: ${summary.inlineStyleIds.join(", ")}.`);
    assert(summary.headings.length > 0, `${surface.label} rendered no visible heading.`);
    assert(
      surface.expected.test(`${summary.headings.join(" ")} ${summary.text}`),
      `${surface.label} did not render its expected account surface. Headings: ${summary.headings.join(" | ")}.`,
    );

    await capture(`account-${slug(surface.label)}`);

    const overview = page.locator('[data-admin-section="Overview"]').first();
    await overview.waitFor({ state: "visible", timeout: 5000 });
    await overview.click();
    await page.waitForTimeout(350);
  }

  writeFileSync(`${ARTIFACT_DIR}/account-page-summary.json`, JSON.stringify(summaries, null, 2));
  console.log("All six accepted v606 account surfaces passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/account-page-summary.json`, JSON.stringify({ summaries, errors, failure: error.message }, null, 2));
  await capture("account-surface-failure");
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
