import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/keyboard-focus-order";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";

const PAGE_ORDERS = Object.freeze({
  Overview: [
    { selector: '[data-admin-terminal-action="scan-attendance"]' },
    { selector: '[data-admin-terminal-action="add-contract"]' },
    { selector: '[data-admin-terminal-action="add-player"]' },
    { selector: '[data-admin-terminal-action="add-store-item"]' },
  ],
  Attendance: [
    { selector: '[data-admin-terminal-action="scan-attendance"]' },
    { selector: '[data-admin-terminal-action="attendance-open-export"]' },
  ],
  Players: [
    { selector: 'input[aria-label="Search roster by name, player ID, or country"]' },
    { selector: '[data-admin-terminal-action="filter-players-all"]' },
    { selector: '[data-admin-terminal-action="filter-players-online"]' },
    { selector: '[data-admin-terminal-action="filter-players-offline"]' },
    { selector: '[data-admin-terminal-action="filter-players-flagged"]' },
    { selector: '[data-admin-terminal-action="add-player"]' },
  ],
  Assignments: [
    { selector: '[data-admin-terminal-action="add-contract"]' },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^All\b/ },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^Active\b/ },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^Due\b/ },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^Review\b/ },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^Scheduled\b/ },
  ],
  Store: [
    { selector: '[data-admin-terminal-action="add-store-item"]' },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^All\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^System\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Custom\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Materials\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Equipment\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Consumables\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Review\b/ },
  ],
  Market: [
    { selector: '.admin-terminal-shell-main input' },
    { selector: 'select[aria-label="Asset class"]' },
    { selector: 'select[aria-label="Location"]' },
    { selector: 'select[aria-label="Sector"]' },
    { selector: 'select[aria-label="Price band"]' },
    { selector: 'select[aria-label="Sort securities"]' },
    { selector: '[data-admin-terminal-action="marketplace-clear-filters"]' },
  ],
  Settings: [
    { selector: '[data-settings-preset="easy"]' },
    { selector: '[data-settings-preset="moderate"]' },
    { selector: '[data-settings-preset="hard"]' },
    { selector: '[data-settings-preset="insane"]' },
  ],
  Logs: [
    { selector: '[data-admin-terminal-action="open-export-history"]' },
    { selector: '[data-admin-terminal-action="export-logs"]' },
  ],
});

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
  title: "Keyboard Focus Order Game",
  name: "Keyboard Focus Order Game",
  status: "active",
  gameCode: "KEYORD",
};

const createdPlayer = {
  id: "00000000-0000-4000-8000-000000000003",
  playerId: "00000000-0000-4000-8000-000000000003",
  displayName: "In Flight Keyboard Player",
  name: "In Flight Keyboard Player",
  rosterLabel: "KEY-ORDER",
  status: "active",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  currencyCode: "NRC",
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
  players: [], roster: [], attendance: [], attendanceRows: [], attendanceHistory: [], attendanceLedger: [],
  attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0, activePlayerCount: 0, rewardsIssuedCount: 0, rewardsIssuedTotal: 0 },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 },
  contracts: [], assignments: [], contractSubmissions: [], submissions: [],
  store: [], storeItems: [], assets: [], trades: [], events: [], logs: [],
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
  dashboard: {
    activePlayerCount: 0,
    totalPlayers: 0,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [], recentActivity: [], marketStatus: "open",
  },
};

const bootstrap = {
  data: {
    admin: {
      id: ADMIN_ID,
      accountId: ADMIN_ID,
      displayName: "Keyboard Focus Administrator",
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
    session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const writes = [];
const report = { pageOrders: [], inFlight: null };

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
    refreshToken: "keyboard-focus-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  window.__adminKeyboardPointerEvents = [];
  for (const type of ["pointerdown", "mousedown", "touchstart"]) {
    window.addEventListener(type, (event) => {
      window.__adminKeyboardPointerEvents.push({ type: event.type, target: event.target?.tagName || "" });
    }, true);
  }
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  const method = request.method();
  const pathname = new URL(request.url()).pathname;
  if (method === "OPTIONS") {
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

  if (!["GET", "HEAD"].includes(method)) {
    let body = null;
    try { body = request.postDataJSON(); } catch (_) { body = request.postData(); }
    writes.push({ method, pathname, body });
  }

  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({ data: { created: true, player: createdPlayer, accessCode: "FOCUS-ACCESS" } }),
    });
    return;
  }

  const body = pathname.endsWith("/session/bootstrap") ? bootstrap : { data: common };
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(body),
  });
});

async function keyboardActivate(locator, key = "Enter") {
  await locator.waitFor({ state: "visible", timeout: 8000 });
  await locator.focus();
  assert(await locator.evaluate((node) => document.activeElement === node), `Keyboard target did not receive focus: ${await locator.textContent()}`);
  await page.keyboard.press(key);
}

function targetLocator(definition) {
  let locator = page.locator(`${definition.selector}:visible`);
  if (definition.text) locator = locator.filter({ hasText: definition.text });
  return locator.first();
}

async function describe(locator) {
  return locator.evaluate((node) => ({
    tag: node.tagName,
    action: node.getAttribute("data-admin-terminal-action") || "",
    name: node.getAttribute("name") || "",
    ariaLabel: node.getAttribute("aria-label") || "",
    text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
  }));
}

async function proveOrder(section, definitions) {
  await keyboardActivate(page.locator(`[data-admin-section="${section}"]`).first(), "Enter");
  await page.waitForTimeout(450);
  const targets = definitions.map(targetLocator);
  for (const target of targets) await target.waitFor({ state: "visible", timeout: 8000 });

  const transitions = [];
  await targets[0].focus();
  assert(await targets[0].evaluate((node) => document.activeElement === node), `${section} first focus target did not receive focus.`);

  for (let index = 1; index < targets.length; index += 1) {
    const target = targets[index];
    let tabs = 0;
    while (!(await target.evaluate((node) => document.activeElement === node)) && tabs < 12) {
      await page.keyboard.press("Tab");
      tabs += 1;
    }
    assert(await target.evaluate((node) => document.activeElement === node), `${section} focus order did not reach target ${index + 1}.`);
    transitions.push({ tabs, target: await describe(target) });
  }

  return {
    section,
    first: await describe(targets[0]),
    transitions,
  };
}

async function proveInFlightExclusion() {
  await keyboardActivate(page.locator('[data-admin-section="Overview"]').first(), "Enter");
  await page.waitForTimeout(300);
  await keyboardActivate(page.locator('[data-admin-terminal-action="add-player"]').first(), "Enter");
  const form = page.locator("[data-admin-terminal-player-form]");
  const displayName = form.locator('[name="displayName"]');
  await displayName.waitFor({ state: "visible", timeout: 5000 });
  await displayName.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("In Flight Keyboard Player");

  const submit = form.locator('[data-admin-terminal-action="create-player"]');
  const startWrites = writes.length;
  await keyboardActivate(submit, "Enter");
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-admin-terminal-player-form] [data-admin-terminal-action="create-player"]');
    return button instanceof HTMLButtonElement && button.disabled && button.dataset.adminQolState === "loading";
  }, null, { timeout: 3000 });

  const loadingState = await submit.evaluate((button) => ({
    disabled: button.disabled,
    ariaBusy: button.getAttribute("aria-busy"),
    state: button.dataset.adminQolState || "",
  }));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const writesDuringLoading = writes.slice(startWrites)
    .filter((write) => write.pathname.endsWith(`/games/${GAME_ID}/players`)).length;
  assert(writesDuringLoading === 1, `Disabled in-flight action replayed: ${JSON.stringify(writes.slice(startWrites))}.`);

  await page.waitForFunction(() => {
    const button = document.querySelector('[data-admin-terminal-player-form] [data-admin-terminal-action="create-player"]');
    return !(button instanceof HTMLButtonElement) || button.dataset.adminQolState !== "loading";
  }, null, { timeout: 5000 });

  const finalWrites = writes.slice(startWrites)
    .filter((write) => write.pathname.endsWith(`/games/${GAME_ID}/players`));
  assert(finalWrites.length === 1, `Player create produced ${finalWrites.length} writes instead of one.`);
  return { loadingState, writesDuringLoading, finalWrite: finalWrites[0] };
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector("[data-admin-section]", { timeout: 15_000 });
  await page.waitForTimeout(900);

  for (const [section, definitions] of Object.entries(PAGE_ORDERS)) {
    report.pageOrders.push(await proveOrder(section, definitions));
  }
  report.inFlight = await proveInFlightExclusion();

  const keyboardEvidence = await page.evaluate(() => ({
    modality: document.documentElement.getAttribute("data-admin-input-modality"),
    pointerEvents: window.__adminKeyboardPointerEvents || [],
  }));
  assert(keyboardEvidence.modality === "keyboard", "Focus-order evidence lost keyboard modality.");
  assert(keyboardEvidence.pointerEvents.length === 0, `Focus-order evidence emitted pointer input: ${JSON.stringify(keyboardEvidence.pointerEvents)}.`);
  assert(errors.length === 0, errors[0] || "Keyboard focus-order evidence emitted a browser error.");
  report.keyboardEvidence = keyboardEvidence;
  writeFileSync(`${ARTIFACT_DIR}/keyboard-focus-order.json`, JSON.stringify(report, null, 2));
  console.log("Admin page-specific focus order and in-flight keyboard exclusion smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  report.errors = errors;
  writeFileSync(`${ARTIFACT_DIR}/keyboard-focus-order.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${ARTIFACT_DIR}/keyboard-focus-order-failure.html`, await page.content());
  await page.screenshot({ path: `${ARTIFACT_DIR}/keyboard-focus-order-failure.png`, fullPage: true });
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
