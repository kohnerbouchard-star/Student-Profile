import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const VIEWPORT_VALUE = process.env.ADMIN_SMOKE_VIEWPORT || "1440x1000";
const [viewportWidth, viewportHeight] = VIEWPORT_VALUE.split("x").map(Number);
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
mkdirSync(ARTIFACT_DIR, { recursive: true });

if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
  throw new Error(`Invalid ADMIN_SMOKE_VIEWPORT: ${VIEWPORT_VALUE}`);
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function slug(value) {
  return String(value || "page")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page";
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
  title: "Browser Smoke Game",
  name: "Browser Smoke Game",
  status: "active",
  gameCode: "SMOKE1",
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
  return { data: common };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: viewportWidth, height: viewportHeight },
});
const page = await context.newPage();
const errors = [];
const consoleMessages = [];
const pageSummaries = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => {
  const text = `${message.type()}: ${message.text()}`;
  consoleMessages.push(text);
  if (message.type() === "error") errors.push(text);
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
    refreshToken: "smoke-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    }, body: "" });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(responseFor(new URL(request.url()).pathname)),
  });
});

async function capture(name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/${name}.html`, await page.content());
}

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
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
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
    const playerOnlyMarkers = document.querySelectorAll([
      "[data-admin-player-profile-identity-editor]",
      "[data-admin-player-created-confirmation]",
      "[data-admin-terminal-player-drawer]",
      "[data-admin-player-create-credential-field]",
    ].join(",")).length;
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
  writeFileSync(`${ARTIFACT_DIR}/runtime-state.json`, JSON.stringify(diagnostic, null, 2));
  console.log("RUNTIME_STATE", JSON.stringify(diagnostic, null, 2));

  const nav = await page.locator("[data-admin-section]").evaluateAll((nodes) => nodes.map((node) => ({
    label: (node.textContent || "").trim().replace(/\s+/g, " "),
    section: node.getAttribute("data-admin-section"),
    disabled: "disabled" in node ? Boolean(node.disabled) : node.getAttribute("aria-disabled") === "true",
    title: node.getAttribute("title"),
    ariaCurrent: node.getAttribute("aria-current"),
  })));
  console.log("NAV_INITIAL", JSON.stringify(nav, null, 2));

  if (nav.length < 8) throw new Error(`Expected at least 8 navigation controls, received ${nav.length}.`);
  const disabled = nav.filter((item) => item.disabled);
  if (disabled.length) throw new Error(`Navigation controls are disabled: ${disabled.map((item) => item.section || item.label).join(", ")}`);

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
      throw new Error(`${item.section} contains ${summary.playerOnlyMarkers} player-only runtime marker(s).`);
    }
    if (!summary.headings.length) {
      throw new Error(`${item.section} rendered no visible page heading.`);
    }

    await capture(`page-${slug(item.section || item.label)}-${slug(VIEWPORT_VALUE)}`);
  }

  writeFileSync(
    `${ARTIFACT_DIR}/page-diff-summary.json`,
    JSON.stringify({ viewport: VIEWPORT_VALUE, pages: pageSummaries }, null, 2),
  );

  const actionCount = await page.locator(
    "button[data-admin-terminal-action]:not([disabled]), [role=button][data-admin-terminal-action]:not([aria-disabled=true])",
  ).count();
  if (actionCount === 0) throw new Error("No enabled delegated action controls were rendered.");

  await capture("admin-browser-smoke-pass");
  console.log(`Admin browser interaction and full-page drift smoke passed at ${VIEWPORT_VALUE}.`);
} catch (error) {
  writeFileSync(
    `${ARTIFACT_DIR}/page-diff-summary.json`,
    JSON.stringify({ viewport: VIEWPORT_VALUE, pages: pageSummaries, failure: error.message }, null, 2),
  );
  await capture("admin-browser-smoke-failure");
  console.error(error.stack || error.message || String(error));
  console.error("BROWSER_ERRORS", JSON.stringify(errors, null, 2));
  console.error("CONSOLE_MESSAGES", JSON.stringify(consoleMessages, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
