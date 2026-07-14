import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/contracts";
const GAME_ID = "00000000-0000-4000-8000-000000000801";
const ADMIN_ID = "00000000-0000-4000-8000-000000000802";
const STORE_ITEM_ID = "00000000-0000-4000-8000-000000000803";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const base64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64")
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const now = Math.floor(Date.now() / 1000);
const token = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
  sub: ADMIN_ID, email: "admin@example.test", role: "authenticated", iat: now, exp: now + 3600,
})}.signature`;
const game = { id: GAME_ID, gameSessionId: GAME_ID, title: "Contract Wiring Audit Game", name: "Contract Wiring Audit Game", status: "active", gameCode: "CNTR01" };
const storeItem = {
  id: STORE_ITEM_ID, storeItemId: STORE_ITEM_ID, itemUuid: STORE_ITEM_ID,
  name: "Contract Reward Tablet", title: "Contract Reward Tablet",
  description: "A contract reward item.", category: "material", price: 40,
  currencyCode: "NRC", stockQuantity: 25, stock: 25, status: "active", visibility: "visible",
};
const common = {
  gameId: GAME_ID, gameSessionId: GAME_ID, activeGameId: GAME_ID, selectedGameSessionId: GAME_ID,
  permissions: ["*"], roles: ["game_admin"], adminRole: "game_admin", game, activeGame: game, games: [game],
  players: [], roster: [], attendance: [], attendanceRows: [], attendanceHistory: [], attendanceLedger: [],
  contracts: [], contractSubmissions: [], store: [storeItem], storeItems: [storeItem], assets: [], trades: [], events: [],
  market: { assets: [], trades: [], events: [] }, logs: [],
  settings: { difficultyPreset: "moderate", backendDifficultyPreset: "moderate", difficultyBasePreset: "moderate", priceMultiplier: 1, incomeMultiplier: 1, shockFrequency: 1, shockSeverity: 1, recoverySupport: 1, tradeMultiplier: 1, configSaveState: "saved" },
  dashboard: { activePlayerCount: 0, totalPlayers: 0, onlinePlayerCount: 0, attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 }, leaderboard: [], recentActivity: [], marketStatus: "open" },
};
const bootstrap = {
  data: {
    admin: { id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Smoke Test Administrator", email: "admin@example.test", role: "game_admin", roles: ["game_admin"] },
    activeGame: game, games: [game], permissions: ["*"], roles: ["game_admin"], adminRole: "game_admin", csrfToken: "",
    session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
    capabilities: { notifications: false, securityHistory: "current_session_only", helpArticles: true, auditLogFlags: true, auditLogExport: true, overallScore: false, marketplaceAdminTrading: false },
  },
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const writes = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("requestfailed", (request) => {
  const url = request.url();
  const failure = request.failure()?.errorText || "";
  if (url.endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${url} ${failure}`);
});
await page.addInitScript(({ accessToken, gameId, adminId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({ accessToken, refreshToken: "contract-smoke-refresh-token", user: { id: adminId, email: "admin@example.test" } }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });
await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  const method = request.method();
  if (method === "OPTIONS") {
    await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" }, body: "" });
    return;
  }
  const pathname = new URL(request.url()).pathname;
  if (!["GET", "HEAD"].includes(method)) {
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    writes.push({ method, pathname, body });
  }
  const response = pathname.endsWith("/session/bootstrap") ? bootstrap : pathname.includes("/store")
    ? { data: { ...common, store: [storeItem], storeItems: [storeItem] } } : { data: common };
  await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "cache-control": "no-store" }, body: JSON.stringify(response) });
});

const capture = async (name) => {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/${name}.html`, await page.content());
};
const waitForWrite = async (start, timeout = 8000) => {
  const began = Date.now();
  while (Date.now() - began < timeout) {
    if (writes.length > start) return writes.at(-1);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
};
const setCheckbox = async (form, value, checked) => {
  await form.locator(`input[type="checkbox"][value="${value}"]`).evaluate((node, nextChecked) => {
    node.checked = nextChecked;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
};

async function attachLink(form) {
  await form.locator('[data-admin-terminal-action="open-contract-material-builder"][data-contract-material-type="link"]').click();
  const builder = form.locator("[data-admin-terminal-contract-material-builder]");
  await builder.waitFor({ state: "visible" });
  await builder.locator('[name="materialTitle"]').fill("Market evidence guide");
  await builder.locator('[name="materialUrl"]').fill("https://example.test/market-evidence");
  await builder.locator('[data-admin-terminal-action="save-contract-material-builder"]').click();
  await builder.waitFor({ state: "hidden" });
}

async function attachQuiz(form) {
  await form.locator('[data-admin-terminal-action="open-contract-material-builder"][data-contract-material-type="quiz"]').click();
  const builder = form.locator("[data-admin-terminal-contract-material-builder]");
  await builder.waitFor({ state: "visible" });
  await builder.locator('[name="materialTitle"]').fill("Evidence check quiz");
  await builder.locator("[data-admin-terminal-contract-quiz-template]").selectOption("evidence_check");
  await builder.locator("[data-admin-terminal-contract-quiz-grading-mode]").selectOption("graded");
  await builder.locator('[data-admin-terminal-action="apply-contract-quiz-template"]').click();
  assert(await builder.locator("[data-admin-terminal-contract-quiz-question-list] > *").count() > 0, "Quiz template created no questions.");
  await builder.locator('[data-admin-terminal-action="save-contract-material-builder"]').click();
  await builder.waitFor({ state: "hidden" });
}

async function addRewards(form) {
  const cash = form.locator("[data-admin-terminal-reward-stage-cash]");
  await cash.locator("[data-admin-terminal-stage-cash]").fill("75");
  await cash.locator('[data-admin-terminal-action="confirm-staged-reward"]').click();
  await form.locator('[data-admin-terminal-action="stage-item-reward"]').click();
  const item = form.locator("[data-admin-terminal-reward-stage-item]");
  await item.locator("[data-admin-terminal-stage-item]").selectOption(STORE_ITEM_ID);
  await item.locator("[data-admin-terminal-stage-item-quantity]").fill("2");
  await item.locator('[data-admin-terminal-action="confirm-staged-reward"]').click();
}

async function schedule(form) {
  await form.locator('[data-admin-terminal-action="toggle-contract-post-menu"]').click();
  await form.locator('[data-admin-terminal-action="schedule-contract-later"]').click();
  const picker = form.locator("[data-admin-terminal-contract-schedule-picker]");
  await picker.waitFor({ state: "visible" });
  await picker.locator("[data-admin-terminal-schedule-date]").fill("2027-01-15");
  await picker.locator("[data-admin-terminal-schedule-time]").fill("10:30");
  await picker.locator('[data-admin-terminal-action="confirm-contract-schedule"]').click();
  await picker.waitFor({ state: "hidden" });
}

const rewardItems = (payload) => array(payload.itemRewards).length ? array(payload.itemRewards)
  : array(object(payload.rewards).items).length ? array(object(payload.rewards).items)
  : array(object(payload.rewardPayload).items);
const cashReward = (payload) => object(object(payload.rewardPayload).cash).amount ? object(object(payload.rewardPayload).cash)
  : object(object(payload.rewards).cash).amount ? object(object(payload.rewards).cash)
  : { amount: payload.cashRewardAmount || payload.rewardCash || payload.cashAmount };

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.locator('[data-admin-terminal-action="add-contract"]').first().click();
  const form = page.locator("[data-admin-terminal-contract-form]");
  await form.waitFor({ state: "visible" });
  await form.locator('[name="title"]').fill("Contract Wiring Audit");
  await form.locator('[name="objective"]').fill("Verify complete contract persistence.");
  await form.locator('[name="instructions"]').fill("Complete all attached work.");
  await form.locator('[name="evidence"]').fill("Submit the attached quiz and written response.");
  await form.locator('[name="deadline"]').fill("2027-01-20T17:00");
  await form.locator('[name="quantity"]').fill("5");
  await form.locator('[name="quantityScope"]').selectOption("per_location");
  await form.locator('[name="reviewType"]').selectOption("teacher");
  await form.locator("details.admin-terminal-contract-advanced-v495").evaluate((node) => { node.open = true; });
  await form.locator('[name="difficulty"]').selectOption("Advanced");
  await form.locator('[name="reviewNote"]').fill("Use the rubric and verify the attached quiz.");
  await setCheckbox(form, "all", false);
  await setCheckbox(form, "NORTHREACH", true);
  await setCheckbox(form, "YRETHIA", true);
  await attachLink(form);
  await attachQuiz(form);
  await addRewards(form);
  await schedule(form);
  await capture("contract-before-submit");

  const start = writes.length;
  await form.locator('[data-admin-terminal-action="create-contract"]').click();
  const write = await waitForWrite(start);
  assert(write, "Contract editor sent no create request.");
  const requestBody = object(write.body);
  const payload = object(requestBody.payload || requestBody.contract || requestBody);
  const materials = array(payload.materials);
  const requirements = array(payload.submissionRequirements);
  const items = rewardItems(payload);
  const cash = cashReward(payload);
  const targeting = object(payload.targeting || payload.targetingPayload);

  assert(write.method === "POST" && write.pathname.endsWith(`/games/${GAME_ID}/contracts`), `Unexpected write ${write.method} ${write.pathname}.`);
  assert(payload.title === "Contract Wiring Audit", "Title was not preserved.");
  assert(payload.instructions === "Complete all attached work.", "Instructions were not preserved.");
  assert(materials.length === 2, `Expected 2 materials, received ${materials.length}.`);
  assert(materials.some((item) => String(item?.type || item?.kind).toLowerCase() === "link"), "Link material was not serialized.");
  assert(materials.some((item) => String(item?.type || item?.kind).toLowerCase() === "quiz"), "Quiz material was not serialized.");
  assert(requirements.length > 0 || object(payload.submissionRequirement).required === true, "Submission requirement was not serialized.");
  assert(Number(cash.amount) === 75, `Expected cash 75, received ${cash.amount ?? "none"}.`);
  assert(items.length === 1, `Expected one item reward, received ${items.length}.`);
  assert(String(items[0]?.storeItemId || items[0]?.itemUuid || items[0]?.id) === STORE_ITEM_ID && Number(items[0]?.quantity) === 2, "Store-item UUID or quantity was lost.");
  assert(array(targeting.countryCodes).includes("NORTHREACH") && array(targeting.countryCodes).includes("YRETHIA"), "Country targeting was lost.");
  assert(payload.status === "scheduled" && Boolean(payload.scheduledAt || payload.postAt || payload.publishedAt), "Scheduled posting was lost.");
  assert(payload.reviewType === "teacher" || payload.completionMode === "manual_review", "Review mode was lost.");
  assert(String(payload.difficulty || object(payload.metadata).difficulty).toLowerCase() === "advanced", "Difficulty was lost.");

  writeFileSync(`${ARTIFACT_DIR}/contract-create-request.json`, JSON.stringify(write, null, 2));
  await capture("contract-after-submit");
  assert(errors.length === 0, errors[0] || "Contract workflow emitted a browser error.");
  console.log("Full admin contract creation payload smoke passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/contract-create-request.json`, JSON.stringify({ writes, errors, failure: error.message }, null, 2));
  await capture("contract-end-to-end-failure");
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
