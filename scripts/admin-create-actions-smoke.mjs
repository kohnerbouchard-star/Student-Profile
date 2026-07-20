import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const base64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64")
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
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
const player = {
  id: "00000000-0000-4000-8000-000000000003",
  playerId: "00000000-0000-4000-8000-000000000003",
  displayName: "Browser Smoke Player",
  name: "Browser Smoke Player",
  rosterLabel: "SMOKE-CREATE",
  status: "active",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  cashBalance: 0,
  netWorth: 0,
  currencyCode: "NRC",
};
const contract = {
  id: "00000000-0000-4000-8000-000000000004",
  contractId: "00000000-0000-4000-8000-000000000004",
  title: "Browser Smoke Contract",
  description: "Browser smoke objective",
  instructions: "Complete the browser smoke assignment.",
  status: "active",
  visibility: "active",
};
const storeItem = {
  id: "00000000-0000-4000-8000-000000000005",
  storeItemId: "00000000-0000-4000-8000-000000000005",
  itemUuid: "00000000-0000-4000-8000-000000000005",
  name: "Browser Smoke Item",
  title: "Browser Smoke Item",
  description: "Browser smoke store item.",
  category: "material",
  price: 25,
  currencyCode: "XAL",
  stockQuantity: 10,
  stock: 10,
  status: "active",
  visibility: "visible",
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

function responseFor(pathname, method) {
  if (pathname.endsWith("/session/bootstrap")) {
    return { data: {
      admin: { id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Smoke Test Administrator", email: "admin@example.test", role: "game_admin", roles: ["game_admin"] },
      activeGame: game,
      games: [game],
      permissions: ["*"],
      roles: ["game_admin"],
      adminRole: "game_admin",
      csrfToken: "",
      session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
      capabilities: { notifications: false, securityHistory: "current_session_only", helpArticles: true, auditLogFlags: true, auditLogExport: true, overallScore: false, marketplaceAdminTrading: false },
    } };
  }
  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/players`)) return { data: { created: true, player, accessCode: "SMOKE-ACCESS" } };
  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/contracts`)) return { data: { created: true, contract } };
  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/store/items`)) return { data: { created: true, item: storeItem, storeItem } };
  if (pathname.includes("/players")) return { data: { ...common, players: [player] } };
  if (pathname.includes("/contracts")) return { data: { ...common, contracts: [contract] } };
  if (pathname.includes("/store")) return { data: { ...common, store: [storeItem], storeItems: [storeItem] } };
  return { data: common };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const consoleMessages = [];
const writeRequests = [];
const actionResults = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
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
  const method = request.method();
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
  const pathname = new URL(request.url()).pathname;
  if (!["GET", "HEAD"].includes(method)) {
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    writeRequests.push({ method, pathname, body });
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(responseFor(pathname, method)),
  });
});

async function capture(name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/${name}.html`, await page.content());
}

async function loadSection(sectionName) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  const section = page.locator(`[data-admin-section="${sectionName}"]`).first();
  await section.waitFor({ state: "visible", timeout: 15_000 });
  await section.click({ timeout: 5000 });
  await page.waitForTimeout(500);
}

async function openCreateAction(action, sectionName = "Overview") {
  await loadSection(sectionName);
  const control = page.locator(`[data-admin-terminal-action="${action}"]`).first();
  await control.waitFor({ state: "visible", timeout: 10_000 });
  const disabled = await control.evaluate((node) =>
    "disabled" in node ? Boolean(node.disabled) : node.getAttribute("aria-disabled") === "true"
  );
  if (disabled) throw new Error(`${action} is disabled.`);
  await control.click({ timeout: 5000 });
  await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5000 });
  await page.waitForTimeout(250);
}

async function assertOriginalModalVideo(selector, expectedPath) {
  if (await page.locator(`.admin-terminal-modal:visible img${selector}`).count()) {
    throw new Error(`${selector} was replaced with an image instead of the original video.`);
  }
  const video = page.locator(`.admin-terminal-modal:visible video${selector}`).first();
  await video.waitFor({ state: "visible", timeout: 5000 });
  const source = await video.locator("source").getAttribute("src");
  if (!String(source || "").endsWith(expectedPath)) throw new Error(`${selector} used ${source || "no source"} instead of ${expectedPath}.`);
  const state = await video.evaluate((node) => ({ autoplay: node.autoplay, muted: node.muted, loop: node.loop, playsInline: node.playsInline }));
  if (!state.autoplay || !state.muted || !state.loop || !state.playsInline) throw new Error(`${selector} lost required playback attributes: ${JSON.stringify(state)}.`);
}

async function waitForWrite(startIndex, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (writeRequests.length > startIndex) return writeRequests.at(-1);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

async function submitPlayer() {
  await openCreateAction("add-player", "Overview");
  await assertOriginalModalVideo(".admin-terminal-player-video", "/assets/videos/player-background.mp4");
  const form = page.locator("[data-admin-terminal-player-form]");
  await form.locator('[name="displayName"]').fill("Browser Smoke Player");
  await form.locator('[name="rosterLabel"]').fill("SMOKE-CREATE");
  await form.locator('[name="status"]').selectOption("active");
  await form.locator('[name="startingLocation"]').selectOption("NORTHREACH");
  await form.locator('[name="notes"]').fill("Browser create workflow smoke.");
  const startIndex = writeRequests.length;
  await form.locator('[data-admin-terminal-action="create-player"]').click();
  const write = await waitForWrite(startIndex);
  await capture("submit-create-player");
  return { action: "create-player", write };
}

async function submitContract() {
  await openCreateAction("add-contract", "Overview");
  await assertOriginalModalVideo(".admin-terminal-contract-video", "/assets/videos/contract-background.mp4");
  const form = page.locator("[data-admin-terminal-contract-form]");
  await form.locator('[name="title"]').fill("Browser Smoke Contract");
  await form.locator('[name="objective"]').fill("Verify the contract create workflow.");
  await form.locator('[name="instructions"]').fill("Complete the browser smoke assignment.");
  await form.locator('[name="evidence"]').fill("Submit a short response.");
  const startIndex = writeRequests.length;
  await form.locator('[data-admin-terminal-action="create-contract"]').click();
  const write = await waitForWrite(startIndex);
  await capture("submit-create-contract");
  return { action: "create-contract", write };
}

async function submitStoreItem() {
  await openCreateAction("add-store-item", "Store");
  await assertOriginalModalVideo(".admin-terminal-store-video", "/assets/videos/store-background.mp4");
  const form = page.locator("[data-admin-terminal-store-form]");
  await form.locator('[name="itemName"]').fill("Browser Smoke Item");
  await form.locator('[name="description"]').fill("Browser smoke store item.");
  await form.locator('[name="category"]').selectOption("Material");
  await form.locator('[name="itemType"]').selectOption("One-time use");
  await form.locator('[name="status"]').selectOption("Active");
  await form.locator('[name="price"]').fill("25");
  await form.locator('[name="stockMode"]').selectOption("Limited");
  await form.locator('[name="stockQuantity"]').waitFor({ state: "visible", timeout: 5000 });
  await form.locator('[name="stockQuantity"]').fill("10");
  await form.locator('[name="visibility"]').selectOption("All players");
  const startIndex = writeRequests.length;
  await form.locator('[data-admin-terminal-action="save-store-item"]').click();
  const write = await waitForWrite(startIndex);
  await capture("submit-create-store-item");
  return { action: "save-store-item", write };
}

function assertWrite(result, expectedPathSuffix, expectedAction) {
  if (!result.write) throw new Error(`${result.action} sent no API request.`);
  if (result.write.method !== "POST") throw new Error(`${result.action} used ${result.write.method} instead of POST.`);
  if (!result.write.pathname.endsWith(expectedPathSuffix)) throw new Error(`${result.action} used unexpected path ${result.write.pathname}.`);
  if (result.write.body?.action !== expectedAction) throw new Error(`${result.action} sent action ${result.write.body?.action || "missing"}.`);
  return result.write.body?.payload || {};
}

try {
  const playerResult = await submitPlayer();
  const contractResult = await submitContract();
  const storeResult = await submitStoreItem();
  actionResults.push(playerResult, contractResult, storeResult);

  const playerPayload = assertWrite(playerResult, `/games/${GAME_ID}/players`, "create-player");
  if (playerPayload.displayName !== "Browser Smoke Player" || playerPayload.startingLocation !== "NORTHREACH") throw new Error(`Player create payload was not normalized correctly: ${JSON.stringify(playerPayload)}`);

  const contractPayload = assertWrite(contractResult, `/games/${GAME_ID}/contracts`, "create-contract");
  if (contractPayload.title !== "Browser Smoke Contract" || contractPayload.publishNow !== true) throw new Error(`Contract create payload was not normalized correctly: ${JSON.stringify(contractPayload)}`);

  const storePayload = assertWrite(storeResult, `/games/${GAME_ID}/store/items`, "save-store-item");
  if (storePayload.name !== "Browser Smoke Item" || storePayload.category !== "material" || storePayload.status !== "active" || storePayload.price !== 25 || storePayload.stockQuantity !== 10 || storePayload.visibility !== "visible") {
    throw new Error(`Store create payload was not normalized correctly: ${JSON.stringify(storePayload)}`);
  }

  if (errors.length) throw new Error(`Create workflows emitted browser errors: ${errors[0]}`);
  writeFileSync(`${ARTIFACT_DIR}/create-actions-runtime.json`, JSON.stringify({ actionResults, writeRequests, errors, consoleMessages }, null, 2));
  console.log("Admin create submissions, Store-only item creation, and original modal videos smoke passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/create-actions-runtime.json`, JSON.stringify({ actionResults, writeRequests, errors, consoleMessages }, null, 2));
  await capture("admin-create-actions-failure").catch(() => {});
  console.error(error.stack || error.message || String(error));
  console.error("CREATE_RESULTS", JSON.stringify(actionResults, null, 2));
  console.error("WRITE_REQUESTS", JSON.stringify(writeRequests, null, 2));
  console.error("BROWSER_ERRORS", JSON.stringify(errors, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
