import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.PLAYER_CONTRACTS_SMOKE_BASE_URL || "http://127.0.0.1:4173/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/player-contracts";
const GAME_ID = "00000000-0000-4000-8000-000000000901";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000902";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000903";
const PLAYER_IDENTIFIER = "RFID:CONTRACT-01";
const SESSION_TOKEN = "ps_contract_workspace_session_token";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const submissions = [];
const contractLoads = [];
let submittedProgress = null;

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("requestfailed", (request) => {
  if (request.url().includes("cdn.jsdelivr.net")) return;
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
});
await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({
  status: 200,
  contentType: "application/javascript",
  body: "window.supabase = window.supabase || {};",
}));

function contractDto() {
  return {
    contractId: CONTRACT_ID,
    gameSessionId: GAME_ID,
    contractKey: "market-evidence-contract",
    sourceType: "teacher",
    sourceId: null,
    title: "Market Evidence Contract",
    description: "Analyze a market decision using evidence.",
    instructions: "Read the guide, answer the quiz, and explain your conclusion.",
    category: "analysis",
    status: "active",
    visibility: "public",
    targetingPayload: { allPlayers: true },
    requirementsPayload: { manualText: "Submit the quiz and a written explanation." },
    rewardPayload: {
      cash: { amount: 75, accountType: "cash", currencyCode: "NRC" },
      items: [{ storeItemId: "00000000-0000-4000-8000-000000000904", quantity: 2, name: "Research Pass" }],
    },
    completionMode: "manual_review",
    publishedAt: "2026-07-15T08:00:00.000Z",
    deadlineAt: "2026-07-20T17:00:00.000Z",
    expiresAt: null,
    metadata: {
      difficulty: "Advanced",
      materials: [
        { type: "link", typeLabel: "External link", title: "Market evidence guide", url: "https://example.test/market-evidence", questions: [] },
        {
          type: "quiz",
          typeLabel: "Quiz",
          title: "Evidence check",
          questions: [
            { prompt: "Name the first source you used.", questionType: "short_answer", required: true },
            { prompt: "Explain how the evidence supports your conclusion.", questionType: "paragraph", required: true },
          ],
        },
      ],
      submissionRequirement: { type: "attached_quiz", required: true },
    },
    createdAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z",
  };
}

function dashboardResponse() {
  return {
    ok: true,
    gameSession: { id: GAME_ID, name: "Contract Workspace Game", status: "active", marketStatus: "open", currentTick: 1, updatedAt: "2026-07-15T08:00:00.000Z" },
    me: {
      playerId: PLAYER_UUID,
      displayName: "Contract Smoke Player",
      rosterLabel: "GRADE-10-01",
      countryCode: "NORTHREACH",
      netWorth: 1000,
      cash: { balances: [{ accountType: "cash", currencyCode: "NRC", balance: 1000 }], primaryCurrencyCode: "NRC", totalBalance: 1000 },
      stocks: { portfolio: { marketValue: 0, costBasis: 0, unrealizedGainLoss: 0 }, holdings: [], orders: [], trades: [] },
      store: { currencyCode: "NRC", listings: [], inventory: [], recentPurchases: [] },
      contracts: { available: [], progress: [] },
    },
    public: { leaderboard: [], players: [], market: { stocks: [], news: [] }, contracts: [], storeListings: [] },
    unseenCutscenes: [],
    realtime: { publicChannel: `game:${GAME_ID}:public`, lastSequence: null, events: [] },
  };
}

await page.route("**/functions/v1/classroom-api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };

  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "authorization, apikey, content-type, x-player-session-token", "access-control-allow-methods": "GET,POST,OPTIONS" }, body: "" });
    return;
  }

  if (request.method() === "POST" && pathname.endsWith("/players/login")) {
    await route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({
      ok: true,
      gameSession: { id: GAME_ID, name: "Contract Workspace Game", status: "active" },
      player: { id: PLAYER_UUID, displayName: "Contract Smoke Player", rosterLabel: "GRADE-10-01", playerIdentifier: PLAYER_IDENTIFIER, status: "active" },
      session: { token: SESSION_TOKEN, status: "active", expiresAt: new Date(Date.now() + 43_200_000).toISOString() },
    }) });
    return;
  }

  if (request.method() === "GET" && pathname.endsWith("/players/me")) {
    await route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({
      ok: true,
      gameSession: { id: GAME_ID, name: "Contract Workspace Game", status: "active" },
      player: { id: PLAYER_UUID, displayName: "Contract Smoke Player", rosterLabel: "GRADE-10-01", playerIdentifier: PLAYER_IDENTIFIER, status: "active" },
      availableActions: [],
      balances: [{ accountType: "cash", currencyCode: "NRC", balance: 1000 }],
      inventory: [],
      holdings: [],
    }) });
    return;
  }

  if (request.method() === "GET" && pathname.endsWith("/players/me/game/dashboard")) {
    await route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify(dashboardResponse()) });
    return;
  }

  if (request.method() === "GET" && pathname.endsWith("/players/me/contracts")) {
    contractLoads.push({
      gameSessionId: url.searchParams.get("gameSessionId"),
      playerSessionToken: request.headers()["x-player-session-token"] || "",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        ok: true,
        contracts: [contractDto()],
        progress: submittedProgress ? [submittedProgress] : [],
      }),
    });
    return;
  }

  if (request.method() === "POST" && pathname.endsWith(`/players/me/contracts/${CONTRACT_ID}/submit`)) {
    const body = request.postDataJSON();
    submissions.push({ body, playerSessionToken: request.headers()["x-player-session-token"] || "" });
    submittedProgress = {
      progressId: "00000000-0000-4000-8000-000000000905",
      gameSessionId: GAME_ID,
      contractId: CONTRACT_ID,
      playerId: PLAYER_UUID,
      status: "submitted",
      evidencePayload: body.evidencePayload,
      resultPayload: {},
      submittedAt: "2026-07-15T09:00:00.000Z",
      completedAt: null,
      rewardIssuedAt: null,
      createdAt: "2026-07-15T09:00:00.000Z",
      updatedAt: "2026-07-15T09:00:00.000Z",
    };
    await route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, contract: contractDto(), progress: submittedProgress }) });
    return;
  }

  await route.fulfill({ status: 404, contentType: "application/json", headers, body: JSON.stringify({ ok: false, error: { code: "route_not_found", message: pathname } }) });
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#playerForm", { timeout: 15_000 });
  await page.locator("#gameCode").fill("WORK01");
  await page.locator("#playerId").fill(PLAYER_IDENTIFIER);
  await page.locator("#playerAccessCode").fill("WORK-4826");
  await page.locator("#playerForm button[type='submit']").click();
  await page.waitForFunction(() => document.getElementById("appShell")?.classList.contains("hidden") === false, null, { timeout: 10_000 });

  const contractsNav = page.locator('[data-view="contracts"]');
  await contractsNav.waitFor({ state: "visible", timeout: 8000 });
  await contractsNav.click();
  const card = page.locator(`article.contract-card[data-contract-id="${CONTRACT_ID}"]`);
  await card.waitFor({ state: "visible", timeout: 8000 });

  if (!contractLoads.length) throw new Error("Contracts workspace did not call the authoritative player contracts route.");
  if (contractLoads.some((load) => load.gameSessionId !== GAME_ID || load.playerSessionToken !== SESSION_TOKEN)) {
    throw new Error(`Authoritative contract load used the wrong scope or session: ${JSON.stringify(contractLoads)}.`);
  }

  const cardText = await card.innerText();
  if (!cardText.includes("Market Evidence Contract") || !cardText.includes("NRC 75") || !cardText.includes("2× Research Pass")) {
    throw new Error(`Contract card omitted core details: ${cardText}`);
  }
  if (/correct answer|limited resources/i.test(cardText)) throw new Error("Player contract UI exposed an answer key.");

  const form = card.locator("[data-contract-submit-form]");
  await form.locator('[name="writtenResponse"]').fill("The evidence indicates the market decision is justified.");
  await form.locator('[name="answer-1-0"]').fill("Market evidence guide");
  await form.locator('[name="answer-1-1"]').fill("The guide supports the conclusion by comparing costs and incentives.");
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction((contractId) => document.querySelector(`article.contract-card[data-contract-id="${contractId}"]`)?.textContent?.includes("Submitted"), CONTRACT_ID, { timeout: 10_000 });

  if (submissions.length !== 1) throw new Error(`Expected one contract submission, received ${submissions.length}.`);
  const submission = submissions[0];
  if (submission.playerSessionToken !== SESSION_TOKEN) throw new Error("Contract submission omitted the authenticated player session token.");
  if (submission.body.gameSessionId !== GAME_ID || !submission.body.evidencePayload) throw new Error(`Wrong submission body: ${JSON.stringify(submission.body)}.`);
  for (const forbidden of ["playerId", "playerIds", "playerSessionId", "sessionId"]) {
    if (forbidden in submission.body || forbidden in submission.body.evidencePayload) throw new Error(`Client-supplied identity field ${forbidden} was sent.`);
  }
  if (submission.body.evidencePayload.answers.length !== 2) throw new Error("Quiz answers were not serialized.");

  writeFileSync(`${ARTIFACT_DIR}/player-contracts-runtime.json`, JSON.stringify({ submissions, contractLoads, errors }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/player-contracts-workspace.png`, fullPage: true });
  if (errors.length) throw new Error(errors[0]);
  console.log("Student Contracts workspace and authenticated submission smoke passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/player-contracts-runtime.json`, JSON.stringify({ submissions, contractLoads, errors, failure: error.message }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/player-contracts-workspace-failure.png`, fullPage: true });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
