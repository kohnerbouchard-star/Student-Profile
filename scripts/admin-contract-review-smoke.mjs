import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/contract-review";
const GAME_ID = "00000000-0000-4000-8000-000000001001";
const ADMIN_ID = "00000000-0000-4000-8000-000000001002";
const CONTRACT_ID = "00000000-0000-4000-8000-000000001003";
const PROGRESS_ID = "00000000-0000-4000-8000-000000001004";
const PLAYER_ID = "00000000-0000-4000-8000-000000001005";
const CONTRACT_TITLE = "Market Evidence Review";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const base64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64")
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const token = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
  sub: ADMIN_ID, email: "admin@example.test", role: "authenticated", iat: now, exp: now + 3600,
})}.signature`;

const game = { id: GAME_ID, gameSessionId: GAME_ID, title: "Review Audit Game", name: "Review Audit Game", status: "active", gameCode: "REVIEW" };
const contract = {
  id: CONTRACT_ID,
  contractId: CONTRACT_ID,
  title: CONTRACT_TITLE,
  description: "Review the submitted market analysis.",
  instructions: "Submit evidence and complete the quiz.",
  category: "analysis",
  status: "active",
  visibility: "public",
  meta: "Advanced · Teacher review",
  reward: "NRC 75 + 2 items",
  rewardPayload: { cash: { amount: 75, currencyCode: "NRC" }, items: [{ storeItemId: "00000000-0000-4000-8000-000000001006", quantity: 2, name: "Research Pass" }] },
  deadlineAt: "2026-07-20T17:00:00.000Z",
  submittedCount: 1,
  submissionCount: 1,
  completedCount: 0,
  rewardIssuedCount: 0,
  progressCount: 1,
};
const submissionEvidence = "The evidence supports the recommendation. · Name the source.: Market evidence guide · Explain the conclusion.: Costs and incentives support it.";
const submission = {
  id: PROGRESS_ID,
  progressId: PROGRESS_ID,
  submissionId: PROGRESS_ID,
  contractId: CONTRACT_ID,
  contract_id: CONTRACT_ID,
  playerId: PLAYER_ID,
  player_id: PLAYER_ID,
  playerName: "Review Smoke Player",
  displayName: "Review Smoke Player",
  rosterLabel: "G10-REVIEW",
  countryCode: "NORTHREACH",
  country: "Northreach",
  status: "submitted",
  summary: submissionEvidence,
  evidence: submissionEvidence,
  before: "—",
  after: "submitted",
  evidencePayload: {
    writtenResponse: "The evidence supports the recommendation.",
    answers: [
      { prompt: "Name the source.", answer: "Market evidence guide" },
      { prompt: "Explain the conclusion.", answer: "Costs and incentives support it." },
    ],
  },
  evidence_payload: {
    writtenResponse: "The evidence supports the recommendation.",
  },
  resultPayload: {},
  result_payload: {},
  submittedAt: "2026-07-15T09:00:00.000Z",
  submitted_at: "2026-07-15T09:00:00.000Z",
  rewardIssuedAt: null,
  reward_issued_at: null,
};

const common = {
  gameId: GAME_ID, gameSessionId: GAME_ID, activeGameId: GAME_ID, selectedGameSessionId: GAME_ID,
  permissions: ["*"], roles: ["game_admin"], adminRole: "game_admin", game, activeGame: game, games: [game],
  players: [{ id: PLAYER_ID, playerId: PLAYER_ID, displayName: "Review Smoke Player", rosterLabel: "G10-REVIEW", countryCode: "NORTHREACH", status: "active" }],
  roster: [], attendance: [], attendanceRows: [], attendanceHistory: [], attendanceLedger: [],
  contracts: [contract], assignments: [contract], contractSubmissions: [submission], submissions: [submission],
  store: [], storeItems: [], assets: [], trades: [], events: [], market: { assets: [], trades: [], events: [] }, logs: [],
  settings: { difficultyPreset: "moderate", backendDifficultyPreset: "moderate", difficultyBasePreset: "moderate", priceMultiplier: 1, incomeMultiplier: 1, shockFrequency: 1, shockSeverity: 1, recoverySupport: 1, tradeMultiplier: 1, configSaveState: "saved" },
  dashboard: { activePlayerCount: 1, totalPlayers: 1, onlinePlayerCount: 1, attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 }, leaderboard: [], recentActivity: [], marketStatus: "open", contracts: [contract] },
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
  const failure = request.failure()?.errorText || "";
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
});

await page.addInitScript(({ accessToken, gameId, adminId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({ accessToken, refreshToken: "review-smoke-refresh", user: { id: adminId, email: "admin@example.test" } }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  const method = request.method();
  const pathname = new URL(request.url()).pathname;
  if (method === "OPTIONS") {
    await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS" }, body: "" });
    return;
  }
  if (!["GET", "HEAD"].includes(method)) {
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    writes.push({ method, pathname, body, headers: request.headers() });
  }

  let body = { data: common };
  if (pathname.endsWith("/session/bootstrap")) body = bootstrap;
  else if (pathname.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/submissions`)) body = { data: { contractId: CONTRACT_ID, contractSubmissions: [submission], submissions: [submission] } };
  else if (pathname.endsWith(`/games/${GAME_ID}/contract-submissions`)) body = { data: { contractSubmissions: [submission], submissions: [submission] } };
  else if (pathname.endsWith(`/games/${GAME_ID}/contract-submissions/${PROGRESS_ID}/decision`)) body = {
    data: {
      reviewed: true,
      rewardIssued: true,
      alreadyIssued: false,
      progress: { ...submission, status: "completed", after: "completed", completedAt: "2026-07-15T10:00:00.000Z", rewardIssuedAt: "2026-07-15T10:00:00.000Z" },
      rewardResult: { status: "applied" },
    },
  };

  await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "cache-control": "no-store" }, body: JSON.stringify(body) });
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.locator('[data-admin-section="Assignments"]').first().click();
  await page.waitForTimeout(800);

  const focus = page.locator(
    `[data-admin-terminal-action="focus-contract"][data-contract-title="${CONTRACT_TITLE}"]`,
  ).first();
  await focus.waitFor({ state: "visible", timeout: 8000 });
  await focus.click();
  await page.waitForTimeout(300);

  const review = page.locator(
    `[data-admin-terminal-action="review-contract-submissions"][data-contract-id="${CONTRACT_ID}"]:visible`,
  ).first();
  await review.waitFor({ state: "visible", timeout: 8000 });
  await review.click();
  const modal = page.locator(".admin-terminal-contract-submissions-modal-v470").first();
  await modal.waitFor({ state: "visible", timeout: 8000 });
  const modalText = await modal.innerText();
  if (!modalText.includes("Review Smoke Player") || !modalText.includes("The evidence supports")) {
    throw new Error(`Submission modal omitted player evidence: ${modalText}`);
  }

  await modal.locator('[data-admin-terminal-action="contract-submission-accept"]').first().click();
  const decision = modal.locator('[data-admin-terminal-action="contract-submission-confirm-decision"]').first();
  await decision.waitFor({ state: "visible", timeout: 5000 });
  await decision.click();
  await page.waitForTimeout(900);

  const decisionWrites = writes.filter((write) => write.pathname.endsWith(`/games/${GAME_ID}/contract-submissions/${PROGRESS_ID}/decision`));
  if (decisionWrites.length !== 1) throw new Error(`Expected one decision write, received ${decisionWrites.length}. Writes: ${JSON.stringify(writes)}`);
  const write = decisionWrites[0];
  const rawDecision = String(write.body?.decision || write.body?.action || write.body?.status || "").toLowerCase();
  if (!["accept", "accepted", "approve", "approved"].includes(rawDecision)) {
    throw new Error(`Accept action sent unexpected body: ${JSON.stringify(write.body)}`);
  }
  if ("staffId" in (write.body || {}) || "playerId" in (write.body || {})) {
    throw new Error("Decision body contains client-supplied authority fields.");
  }
  if (!write.headers.authorization || !write.headers["x-econovaria-game-id"]) {
    throw new Error("Decision request omitted authenticated admin headers.");
  }

  writeFileSync(`${ARTIFACT_DIR}/admin-contract-review-runtime.json`, JSON.stringify({ writes, errors, modalText }, null, 2));
  writeFileSync(`${ARTIFACT_DIR}/admin-contract-review.html`, await page.content());
  await page.screenshot({ path: `${ARTIFACT_DIR}/admin-contract-review.png`, fullPage: true });
  if (errors.length) throw new Error(errors[0]);
  console.log("Accepted admin contract review flow passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/admin-contract-review-runtime.json`, JSON.stringify({ writes, errors, failure: error.message }, null, 2));
  writeFileSync(`${ARTIFACT_DIR}/admin-contract-review-failure.html`, await page.content());
  await page.screenshot({ path: `${ARTIFACT_DIR}/admin-contract-review-failure.png`, fullPage: true });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
