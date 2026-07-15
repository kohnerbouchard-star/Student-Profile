import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/contract-review";
const GAME_ID = "00000000-0000-4000-8000-000000000a01";
const ADMIN_ID = "00000000-0000-4000-8000-000000000a02";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000a03";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000a04";
const PLAYER_ID = "00000000-0000-4000-8000-000000000a05";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64")
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({
  sub: ADMIN_ID,
  email: "admin@example.test",
  role: "authenticated",
  iat: now,
  exp: now + 3600,
})}.signature`;

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Contract Review Audit Game",
  name: "Contract Review Audit Game",
  status: "active",
  gameCode: "REVIEW",
};
const contract = {
  id: CONTRACT_ID,
  contractId: CONTRACT_ID,
  gameSessionId: GAME_ID,
  contractKey: "review-audit-contract",
  title: "Market Evidence Review",
  description: "Review a submitted market analysis.",
  instructions: "Check the written response and quiz answers.",
  category: "analysis",
  status: "active",
  visibility: "public",
  targetingPayload: { allPlayers: true },
  requirementsPayload: { manualText: "Submit a written analysis." },
  rewardPayload: {
    cash: { amount: 75, currencyCode: "NRC", accountType: "cash" },
    items: [{ storeItemId: "00000000-0000-4000-8000-000000000a06", quantity: 1, name: "Research Pass" }],
  },
  completionMode: "manual_review",
  publishedAt: "2026-07-15T08:00:00.000Z",
  deadlineAt: "2026-07-20T17:00:00.000Z",
  metadata: {
    difficulty: "Advanced",
    materials: [{
      type: "quiz",
      title: "Evidence check",
      questions: [{ prompt: "Explain the evidence.", questionType: "paragraph", required: true }],
    }],
  },
  createdAt: "2026-07-15T08:00:00.000Z",
  updatedAt: "2026-07-15T08:00:00.000Z",
};
const submission = {
  id: PROGRESS_ID,
  progressId: PROGRESS_ID,
  gameSessionId: GAME_ID,
  contractId: CONTRACT_ID,
  playerId: PLAYER_ID,
  displayName: "Review Smoke Player",
  rosterLabel: "GRADE-10-01",
  status: "submitted",
  evidencePayload: {
    writtenResponse: "The evidence supports the conclusion because incentives changed demand.",
    answers: [{
      materialIndex: 0,
      questionIndex: 0,
      prompt: "Explain the evidence.",
      questionType: "paragraph",
      answer: "The evidence compares incentives and demand changes.",
    }],
  },
  resultPayload: {},
  submittedAt: "2026-07-15T09:00:00.000Z",
  completedAt: null,
  rewardIssuedAt: null,
  createdAt: "2026-07-15T09:00:00.000Z",
  updatedAt: "2026-07-15T09:00:00.000Z",
};
const player = {
  id: PLAYER_ID,
  playerId: PLAYER_ID,
  displayName: "Review Smoke Player",
  rosterLabel: "GRADE-10-01",
  status: "active",
  playerIdentifier: "RFID:REVIEW-01",
};
const model = {
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
  players: [player],
  roster: [player],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  contracts: [contract],
  assignments: [contract],
  contractSubmissions: [submission],
  submissions: [submission],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  logs: [],
  market: { assets: [], trades: [], events: [] },
  notifications: [],
  adminNotifications: [],
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
    activePlayerCount: 1,
    totalPlayers: 1,
    onlinePlayerCount: 1,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 1 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
  },
};
const bootstrap = {
  data: {
    admin: { id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Smoke Test Administrator", email: "admin@example.test", role: "game_admin", roles: ["game_admin"] },
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("requestfailed", (request) => {
  const failure = request.failure()?.errorText || "";
  if (request.url().endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
});
await page.addInitScript(({ accessToken, gameId, adminId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken,
    refreshToken: "contract-review-smoke-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  requests.push({ method: request.method(), pathname });
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

  let payload = { data: model };
  if (pathname.endsWith("/session/bootstrap")) payload = bootstrap;
  else if (pathname.endsWith(`/games/${GAME_ID}/contracts`)) payload = { data: { ...model, contracts: [contract], assignments: [contract] } };
  else if (pathname.endsWith(`/games/${GAME_ID}/contract-submissions`)) payload = { data: { contractSubmissions: [submission], submissions: [submission] } };
  else if (pathname.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/submissions`)) payload = { data: { contractId: CONTRACT_ID, contractSubmissions: [submission], submissions: [submission] } };
  else if (pathname.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/progress`)) payload = { ok: true, contract, progress: [submission] };

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(payload),
  });
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  const contractsNav = page.locator('[data-admin-section="Assignments"]').first();
  await contractsNav.waitFor({ state: "visible", timeout: 8000 });
  await contractsNav.click();
  await page.waitForTimeout(1500);

  const summary = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof Element) || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const nodes = [...document.querySelectorAll("button, a, input, select, textarea, [data-admin-terminal-action], [data-admin-section]")]
      .filter(visible)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        text: (node.textContent || node.getAttribute("aria-label") || node.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 180),
        id: node.id || "",
        name: node.getAttribute("name") || "",
        action: node.getAttribute("data-admin-terminal-action") || "",
        section: node.getAttribute("data-admin-section") || "",
        contractId: node.getAttribute("data-contract-id") || node.getAttribute("data-admin-contract-id") || "",
        progressId: node.getAttribute("data-progress-id") || node.getAttribute("data-submission-id") || "",
        classes: node.className || "",
      }));
    const headings = [...document.querySelectorAll("h1, h2, h3, h4")]
      .filter(visible)
      .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const feature = window.Econovaria?.features?.adminOverviewTerminal || {};
    const currentModel = feature.currentModel || {};
    return {
      headings,
      nodes,
      text: (document.querySelector("#adminPreview")?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 6000),
      modelKeys: Object.keys(currentModel).sort(),
      contractCount: Array.isArray(currentModel.contracts) ? currentModel.contracts.length : null,
      submissionCount: Array.isArray(currentModel.contractSubmissions) ? currentModel.contractSubmissions.length : null,
      activeSection: document.querySelector('[data-admin-section][aria-current="page"]')?.getAttribute("data-admin-section") || "",
    };
  });

  writeFileSync(`${ARTIFACT_DIR}/contract-review-surface.json`, JSON.stringify({ summary, requests, errors }, null, 2));
  writeFileSync(`${ARTIFACT_DIR}/contract-review-surface.html`, await page.content());
  await page.screenshot({ path: `${ARTIFACT_DIR}/contract-review-surface.png`, fullPage: true });
  if (errors.length) throw new Error(errors[0]);
  if (!summary.text.includes("Market Evidence Review")) throw new Error("Contracts page did not render the seeded contract.");
  console.log("Admin Contracts review surface diagnostic passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/contract-review-surface.json`, JSON.stringify({ requests, errors, failure: error.message }, null, 2));
  writeFileSync(`${ARTIFACT_DIR}/contract-review-surface.html`, await page.content());
  await page.screenshot({ path: `${ARTIFACT_DIR}/contract-review-surface-failure.png`, fullPage: true });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
