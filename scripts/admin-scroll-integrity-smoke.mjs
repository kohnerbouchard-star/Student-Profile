import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE_URL = process.env.ADMIN_SCROLL_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SCROLL_ARTIFACT_DIR || "admin-scroll-integrity-artifacts";
const BROWSER_ORIGIN = "http://127.0.0.1:4173";
const GAME_ID = "10000000-0000-4000-8000-000000000001";
const ADMIN_ID = "10000000-0000-4000-8000-000000000002";
const PLAYER_ID = "10000000-0000-4000-8000-000000000003";
const CSRF_TOKEN = "S".repeat(43);
const PERMISSIONS = Object.freeze([
  "account.read",
  "audit.read",
  "attendance.manage",
  "business.manage",
  "contracts.manage",
  "economy.adjust",
  "game.create",
  "game.read",
  "game.switch",
  "game.update",
  "inventory.redeem",
  "market.manage",
  "marketplace.moderate",
  "messaging.moderate",
  "players.manage",
  "progression.review",
  "settings.manage",
  "store.manage",
  "world.manage",
]);

mkdirSync(ARTIFACT_DIR, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Scroll Integrity Game",
  name: "Scroll Integrity Game",
  status: "active",
  gameCode: "ECO-SCROLL-ROOM-101",
  joinCode: "ECO-SCROLL-ROOM-101",
};

const user = {
  id: ADMIN_ID,
  email: "scroll.audit@example.test",
  displayName: "Scroll Audit Administrator",
  role: "game_admin",
  permissionVersion: 1,
  securityVersion: 1,
};

const player = {
  id: PLAYER_ID,
  playerId: PLAYER_ID,
  displayName: "Scroll Integrity Player",
  name: "Scroll Integrity Player",
  rosterLabel: "SCROLL-01",
  playerIdentifier: "SCROLL-PLAYER-01",
  status: "active",
  sessionStatus: "offline",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  location: "Northreach",
  currencyCode: "NRC",
  cashBalance: 1250,
  balance: 1250,
  netWorth: 1980,
  balances: [
    { accountType: "checking", balance: 1250, currencyCode: "NRC" },
    { accountType: "savings", balance: 300, currencyCode: "NRC" },
  ],
  stockMarketValue: 400,
  stockPositions: [],
  inventoryMarketValue: 30,
  inventoryPositions: [],
  overallScore: null,
};

const common = {
  gameId: GAME_ID,
  gameSessionId: GAME_ID,
  activeGameId: GAME_ID,
  selectedGameSessionId: GAME_ID,
  permissions: [...PERMISSIONS],
  roles: ["game_admin"],
  adminRole: "game_admin",
  game,
  activeGame: game,
  games: [game],
  players: [player],
  roster: [player],
  leaderboard: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary: {
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    activePlayerCount: 1,
    totalPlayers: 1,
    presentRate: 0,
    rewardsIssuedCount: 0,
    rewardsIssuedTotal: 0,
  },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 1 },
  contracts: [],
  assignments: [],
  contractSubmissions: [],
  submissions: [],
  store: [],
  storeItems: [],
  items: [],
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
  pagination: {
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
  },
  dashboard: {
    activePlayerCount: 1,
    totalPlayers: 1,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
  },
  recentActivity: [],
};

function sessionTimes() {
  return {
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };
}

function safeSession() {
  return {
    authenticated: true,
    ...sessionTimes(),
    assuranceLevel: "aal2",
    mfaRequired: true,
    user,
    csrfToken: CSRF_TOKEN,
    activeGameSessions: [game],
    permissions: [...PERMISSIONS],
    roles: ["game_admin"],
    adminRole: "game_admin",
    storedAt: new Date().toISOString(),
  };
}

function legacySessionBridge(session) {
  const staffSession = {
    staffId: session.user.id,
    staffEmail: session.user.email,
    staffDisplayName: session.user.displayName,
    staffRole: "game_admin",
    roles: ["game_admin"],
    permissions: [...PERMISSIONS],
    activeGameSessions: [game],
    selectedGameSessionId: GAME_ID,
  };
  return {
    currentSession: {
      role: "ADMIN",
      authSource: "http-only-bff",
      permissions: [...PERMISSIONS],
      roles: ["game_admin"],
      adminRole: "game_admin",
      user: session.user,
      assuranceLevel: session.assuranceLevel,
      mfaRequired: true,
      staffSession,
    },
    staffSession,
  };
}

function statusPayload() {
  return {
    ok: true,
    session: {
      authenticated: true,
      ...sessionTimes(),
      assuranceLevel: "aal2",
      mfaRequired: true,
    },
    user,
    activeGameSessions: [game],
    csrfToken: CSRF_TOKEN,
  };
}

function bootstrapResponse() {
  return {
    data: {
      admin: {
        id: ADMIN_ID,
        accountId: ADMIN_ID,
        displayName: user.displayName,
        email: user.email,
        role: "game_admin",
        roles: ["game_admin"],
      },
      activeGame: game,
      games: [game],
      permissions: [...PERMISSIONS],
      roles: ["game_admin"],
      adminRole: "game_admin",
      csrfToken: "",
      session: {
        id: ADMIN_ID,
        csrfToken: "",
        assuranceLevel: "aal2",
        expiresAt: sessionTimes().expiresAt,
      },
      capabilities: {},
    },
  };
}

function corsHeaders() {
  return {
    "access-control-allow-origin": BROWSER_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "apikey,content-type,x-econovaria-csrf-token,x-econovaria-device-id,x-econovaria-game-id,x-idempotency-key,x-request-id",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    "cache-control": "private, no-store",
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 720 } });
const page = await context.newPage();
const errors = [];
const report = {
  desktopShell: null,
  playerDrawer: null,
  playerModal: null,
};

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  const url = request.url();
  const failure = request.failure()?.errorText || "";
  if (url.endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  if (/\/admin\/assets\/icons\/media-placeholder\.svg$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${new URL(url).pathname} ${failure}`);
});

const session = safeSession();
const bridge = legacySessionBridge(session);
await page.addInitScript(({ sessionValue, gameId, bridgeValue }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(sessionValue));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  window.currentSession = bridgeValue.currentSession;
  window.state = window.state || {};
  window.state.staffSession = bridgeValue.staffSession;
}, {
  sessionValue: session,
  gameId: GAME_ID,
  bridgeValue: bridge,
});

await page.route("**/functions/v1/web-session-api/status", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: corsHeaders(),
    body: JSON.stringify(statusPayload()),
  });
});

await page.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
    return;
  }
  const pathname = new URL(request.url()).pathname;
  const marker = "/functions/v1/web-session-api/proxy";
  const path = pathname.startsWith(marker) ? pathname.slice(marker.length) || "/" : pathname;
  const body = path.endsWith("/session/bootstrap")
    ? bootstrapResponse()
    : { data: common };
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: corsHeaders(),
    body: JSON.stringify(body),
  });
});

for (const prohibited of [
  "**/functions/v1/admin-api/**",
  "**/functions/v1/classroom-api/**",
]) {
  await page.route(prohibited, async (route) => {
    errors.push(`Prohibited browser authority reached: ${route.request().url()}`);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Prohibited browser authority" }),
    });
  });
}

async function navigate(section) {
  const control = page.locator(`[data-admin-section="${section}"]:visible`).first();
  await control.waitFor({ state: "visible", timeout: 10_000 });
  await control.click();
  await page.waitForTimeout(350);
}

async function shellGeometry() {
  return page.evaluate(() => {
    const left = document.querySelector(".admin-terminal-left-menu");
    const main = document.querySelector(".admin-terminal-shell-main");
    const card = document.querySelector(".econovaria-admin-game-session-card") ||
      document.querySelector(".admin-terminal-side-code");
    const leftRect = left?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    return {
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      leftOverflowY: left ? getComputedStyle(left).overflowY : "missing",
      mainOverflowY: main ? getComputedStyle(main).overflowY : "missing",
      windowScrollY: window.scrollY,
      leftTop: leftRect?.top ?? -1,
      leftBottom: leftRect?.bottom ?? -1,
      mainTop: mainRect?.top ?? -1,
      mainBottom: mainRect?.bottom ?? -1,
      cardBottom: cardRect?.bottom ?? -1,
      mainClientHeight: main?.clientHeight ?? -1,
      mainScrollHeight: main?.scrollHeight ?? -1,
      mainScrollTop: main?.scrollTop ?? -1,
    };
  });
}

async function injectScrollableFiller(locator, height = 900) {
  await locator.evaluate((root, fillerHeight) => {
    root.querySelector("[data-admin-scroll-test-filler]")?.remove();
    const filler = document.createElement("div");
    filler.dataset.adminScrollTestFiller = "true";
    filler.setAttribute("aria-hidden", "true");
    filler.style.height = `${fillerHeight}px`;
    filler.style.minHeight = `${fillerHeight}px`;
    filler.style.pointerEvents = "none";
    root.append(filler);
  }, height);
}

let failure;
try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector(".admin-terminal-shell-main", { timeout: 15_000 });
  await page.waitForSelector(".econovaria-admin-game-session-card, .admin-terminal-side-code", { timeout: 15_000 });
  await page.waitForTimeout(800);

  const before = await shellGeometry();
  assert(["hidden", "clip"].includes(before.bodyOverflowY), `Desktop body owns scrolling: ${before.bodyOverflowY}`);
  assert(before.leftOverflowY === "hidden", `Left rail overflow is ${before.leftOverflowY}`);
  assert(["auto", "scroll"].includes(before.mainOverflowY), `Right content overflow is ${before.mainOverflowY}`);
  assert(Math.abs(before.cardBottom - before.leftBottom) <= 14, `Game Code is ${Math.round(before.leftBottom - before.cardBottom)}px above the rail bottom.`);

  await page.locator(".admin-terminal-shell-main").evaluate((node) => {
    const filler = document.createElement("div");
    filler.dataset.adminScrollTestFiller = "page";
    filler.style.height = "1000px";
    filler.style.minHeight = "1000px";
    node.append(filler);
  });
  const scrollableBefore = await shellGeometry();
  assert(scrollableBefore.mainScrollHeight > scrollableBefore.mainClientHeight, "Right content did not become the desktop page scroller.");

  await page.evaluate(() => {
    window.scrollTo(0, 500);
    const main = document.querySelector(".admin-terminal-shell-main");
    if (main) main.scrollTop = Math.min(180, main.scrollHeight - main.clientHeight);
  });
  await page.waitForTimeout(100);
  const after = await shellGeometry();
  assert(after.windowScrollY === 0, `Document moved to ${after.windowScrollY}px.`);
  assert(after.mainScrollTop > 0, "Right content scrollTop did not advance.");
  assert(Math.abs(after.leftTop - before.leftTop) <= 1, "Left rail top moved with right content.");
  assert(Math.abs(after.leftBottom - before.leftBottom) <= 1, "Left rail bottom moved with right content.");
  report.desktopShell = {
    documentFrozen: true,
    leftRailFrozen: true,
    gameCodeBottomAligned: true,
    rightContentScrollable: true,
  };

  await navigate("Players");
  const playerToggle = page.locator(`[data-admin-terminal-action="select-player-panel"][data-player-id="${PLAYER_ID}"]:visible`).first();
  await playerToggle.waitFor({ state: "visible", timeout: 10_000 });
  await playerToggle.click();
  const drawer = page.locator("[data-admin-terminal-player-drawer]:visible").first();
  await drawer.waitFor({ state: "visible", timeout: 10_000 });
  const panels = drawer.locator(".admin-terminal-player-tab-panels-v301").first();
  await panels.waitFor({ state: "visible", timeout: 10_000 });
  const activePanel = drawer.locator("[data-player-drawer-panel]:visible").first();
  await injectScrollableFiller(activePanel, 900);
  const mainScrollBeforeDrawer = await page.locator(".admin-terminal-shell-main").evaluate((node) => node.scrollTop);
  const drawerBefore = await panels.evaluate((node) => ({
    overflowY: getComputedStyle(node).overflowY,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));
  assert(["auto", "scroll"].includes(drawerBefore.overflowY), `Player panel overflow is ${drawerBefore.overflowY}`);
  assert(drawerBefore.scrollHeight > drawerBefore.clientHeight, "Player panel did not contain overflow.");
  await panels.evaluate((node) => { node.scrollTop = 220; });
  await page.waitForTimeout(100);
  const drawerScrollTop = await panels.evaluate((node) => node.scrollTop);
  const mainScrollAfterDrawer = await page.locator(".admin-terminal-shell-main").evaluate((node) => node.scrollTop);
  assert(drawerScrollTop > 0, "Player panel scrollTop did not advance.");
  assert(mainScrollAfterDrawer === mainScrollBeforeDrawer, "Player panel scrolling chained into right-page scrolling.");
  report.playerDrawer = {
    bounded: true,
    panelScrollable: true,
    scrollContained: true,
  };

  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden", timeout: 5000 }).catch(async () => {
    await drawer.waitFor({ state: "detached", timeout: 5000 });
  });

  await navigate("Overview");
  const addPlayer = page.locator('[data-admin-terminal-action="add-player"]:visible').first();
  await addPlayer.waitFor({ state: "visible", timeout: 10_000 });
  await addPlayer.click();
  const modal = page.locator(".admin-terminal-modal.is-player-modal:visible").last();
  await modal.waitFor({ state: "visible", timeout: 10_000 });
  const playerMain = modal.locator(".admin-terminal-player-main").first();
  await playerMain.waitFor({ state: "visible", timeout: 10_000 });
  await injectScrollableFiller(playerMain, 900);
  const modalBefore = await playerMain.evaluate((node) => ({
    overflowY: getComputedStyle(node).overflowY,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));
  assert(["auto", "scroll"].includes(modalBefore.overflowY), `Add Player pane overflow is ${modalBefore.overflowY}`);
  assert(modalBefore.scrollHeight > modalBefore.clientHeight, "Add Player pane did not contain overflow.");
  await playerMain.evaluate((node) => { node.scrollTop = 220; });
  await page.waitForTimeout(100);
  const modalScrollTop = await playerMain.evaluate((node) => node.scrollTop);
  assert(modalScrollTop > 0, "Add Player pane scrollTop did not advance.");
  assert((await shellGeometry()).windowScrollY === 0, "Modal pane scrolling moved the document.");
  report.playerModal = {
    paneScrollable: true,
    documentStayedFrozen: true,
  };

  assert(errors.length === 0, errors[0] || "Unexpected browser error.");
  await page.screenshot({
    path: `${ARTIFACT_DIR}/admin-scroll-integrity.png`,
    fullPage: false,
    mask: [page.locator(".econovaria-admin-game-session-card, .admin-terminal-side-code")],
  });
} catch (error) {
  failure = error;
  report.failure = String(error?.stack || error);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/admin-scroll-integrity-failure.png`,
    fullPage: false,
    mask: [page.locator(".econovaria-admin-game-session-card, .admin-terminal-side-code")],
  }).catch(() => {});
} finally {
  report.errors = errors;
  writeFileSync(`${ARTIFACT_DIR}/admin-scroll-integrity.json`, `${JSON.stringify(report, null, 2)}\n`);
  await context.close();
  await browser.close();
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, ...report }, null, 2));
