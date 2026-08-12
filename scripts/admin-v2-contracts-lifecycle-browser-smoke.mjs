import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import {
  ADMIN_V2_FIXTURE_CSRF,
  ADMIN_V2_FIXTURE_GAME_ID,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const ACTIVE_CONTRACT_ID = "60000000-0000-4000-8000-000000000006";
const SCHEDULED_CONTRACT_ID = "61000000-0000-4000-8000-000000000007";
const PROGRESS_ID = "63000000-0000-4000-8000-000000000009";

function contractRecord(overrides = {}) {
  return {
    id: ACTIVE_CONTRACT_ID,
    contractId: ACTIVE_CONTRACT_ID,
    contractKey: "supply-chain-resilience",
    title: "Regional Supply Chain Resilience Briefing",
    description: "Explain the production and price effects of a logistics disruption.",
    instructions: "Use current game evidence and explain the mechanism.",
    category: "World Economy",
    sourceType: "teacher",
    status: "active",
    visibility: "public",
    completionMode: "manual_review",
    targetingPayload: { allPlayers: true },
    requirementsPayload: { manualText: "Submit an evidence-backed response." },
    rewardPayload: { cash: { amount: 150, currencyCode: "ECO" } },
    metadata: { difficulty: "Intermediate", materials: ["Market bulletin"] },
    deadlineAt: "2026-08-14T15:00:00.000Z",
    expiresAt: "2026-08-15T15:00:00.000Z",
    progressCount: 1,
    submittedCount: 0,
    completedCount: 1,
    rewardIssuedCount: 0,
    ...overrides,
  };
}

function contracts() {
  return [
    contractRecord(),
    contractRecord({
      id: SCHEDULED_CONTRACT_ID,
      contractId: SCHEDULED_CONTRACT_ID,
      contractKey: "scheduled-supply-briefing",
      title: "Scheduled Supply Briefing",
      status: "scheduled",
      progressCount: 0,
      completedCount: 0,
    }),
  ];
}

function progressResponse() {
  return {
    ok: true,
    contract: contractRecord(),
    progress: [
      {
        id: PROGRESS_ID,
        progressId: PROGRESS_ID,
        contractId: ACTIVE_CONTRACT_ID,
        playerId: "65000000-0000-4000-8000-000000000011",
        status: "completed",
        evidencePayload: { writtenResponse: "Supply fell while demand remained strong." },
        resultPayload: { feedback: "Approved" },
        submittedAt: "2026-08-07T05:00:00.000Z",
        rewardIssuedAt: null,
      },
    ],
  };
}

function submissionsResponse() {
  return {
    data: {
      contractId: ACTIVE_CONTRACT_ID,
      submissions: [
        {
          id: PROGRESS_ID,
          progressId: PROGRESS_ID,
          displayName: "김서연 — International Markets Research Fellowship",
          rosterLabel: "Research cohort A",
          country: "HANUL",
          status: "completed",
          evidence: "Supply fell while demand remained strong.",
          submittedAt: "2026-08-07T05:00:00.000Z",
          resultPayload: { feedback: "Approved" },
        },
      ],
    },
  };
}

function mutationResponse(pathname) {
  if (pathname.endsWith("/publish")) return { ok: true, contract: contractRecord({ id: SCHEDULED_CONTRACT_ID, contractId: SCHEDULED_CONTRACT_ID, status: "active" }) };
  if (pathname.endsWith("/archive")) return { data: { contract: contractRecord({ status: "archived" }) } };
  if (pathname.endsWith("/duplicate")) return { data: { contract: contractRecord({ id: SCHEDULED_CONTRACT_ID, contractId: SCHEDULED_CONTRACT_ID, status: "draft" }) } };
  if (pathname.endsWith("/rewards/issue")) {
    return {
      ok: true,
      rewardIssued: true,
      alreadyIssued: false,
      contract: contractRecord(),
      progress: { ...progressResponse().progress[0], rewardIssuedAt: "2026-08-07T06:00:00.000Z" },
      rewardResult: { cash: { amount: 150, currencyCode: "ECO" } },
    };
  }
  return { ok: true };
}

async function createRuntime(browser, fixture) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const session = createAdminV2FixtureSession("ready");
  await context.addCookies([
    { name: "admin-v2-scenario", value: "ready", url: fixture.origin, sameSite: "Lax" },
    { name: "admin-v2-run", value: randomUUID(), url: fixture.origin, sameSite: "Lax" },
  ]);
  await context.addInitScript(({ sessionKey, deviceKey, seededSession, deviceId }) => {
    window.sessionStorage.setItem(sessionKey, JSON.stringify(seededSession));
    window.localStorage.setItem(deviceKey, deviceId);
  }, {
    sessionKey: SESSION_STORAGE_KEY,
    deviceKey: DEVICE_STORAGE_KEY,
    seededSession: session,
    deviceId: DEVICE_ID,
  });

  const page = await context.newPage();
  const mutations = [];
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (!pathname.includes(`/games/${ADMIN_V2_FIXTURE_GAME_ID}/contracts`)) {
      await route.continue();
      return;
    }

    if (request.method() === "GET" && pathname.endsWith("/contracts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { contracts: contracts(), assignments: contracts() } }),
      });
      return;
    }
    if (request.method() === "GET" && pathname.endsWith(`/${ACTIVE_CONTRACT_ID}/progress`)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(progressResponse()) });
      return;
    }
    if (request.method() === "GET" && pathname.endsWith(`/${ACTIVE_CONTRACT_ID}/submissions`)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(submissionsResponse()) });
      return;
    }

    if (request.method() === "POST") {
      let body = {};
      try { body = request.postDataJSON(); } catch {}
      mutations.push({
        pathname,
        headers: await request.allHeaders(),
        body,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mutationResponse(pathname)),
      });
      return;
    }

    await route.abort();
  });

  await page.goto(
    `${fixture.origin}/admin/v2.html?game=${ADMIN_V2_FIXTURE_GAME_ID}#contracts`,
    { waitUntil: "domcontentloaded", timeout: 15_000 },
  );
  await page.getByRole("heading", { level: 1, name: "Contracts Management" })
    .waitFor({ state: "visible", timeout: 10_000 });
  return { context, page, mutations, browserErrors };
}

function assertMutation(mutation, { pathSuffix, action }) {
  assert.ok(mutation, `${action} mutation was not captured.`);
  assert.ok(mutation.pathname.endsWith(pathSuffix), `${action} used unexpected path ${mutation.pathname}.`);
  assert.equal(mutation.headers["x-econovaria-csrf-token"], ADMIN_V2_FIXTURE_CSRF);
  assert.match(
    String(mutation.headers["idempotency-key"] || ""),
    new RegExp(`^admin\\.contracts\\.${action.replaceAll("-", "-")}\\.[0-9a-f-]{36}\\.\\d+$`, "i"),
  );
}

async function runPublish(browser, fixture) {
  const runtime = await createRuntime(browser, fixture);
  try {
    const row = runtime.page.locator("tr").filter({ hasText: "Scheduled Supply Briefing" });
    await row.getByRole("button", { name: "Publish" }).click();
    const dialog = runtime.page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Publish contract" }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(runtime.mutations.length, 1);
    assertMutation(runtime.mutations[0], { pathSuffix: `/${SCHEDULED_CONTRACT_ID}/publish`, action: "publish" });
    assert.deepEqual(runtime.browserErrors, []);
  } finally {
    await runtime.context.close();
  }
}

async function runArchive(browser, fixture) {
  const runtime = await createRuntime(browser, fixture);
  try {
    const row = runtime.page.locator("tr").filter({ hasText: "Regional Supply Chain Resilience Briefing" }).first();
    await row.getByRole("button", { name: "Archive" }).click();
    const dialog = runtime.page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Archive contract" }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(runtime.mutations.length, 1);
    assertMutation(runtime.mutations[0], { pathSuffix: `/${ACTIVE_CONTRACT_ID}/archive`, action: "archive" });
    assert.deepEqual(runtime.browserErrors, []);
  } finally {
    await runtime.context.close();
  }
}

async function runDuplicate(browser, fixture) {
  const runtime = await createRuntime(browser, fixture);
  try {
    const row = runtime.page.locator("tr").filter({ hasText: "Regional Supply Chain Resilience Briefing" }).first();
    await row.getByRole("button", { name: "Duplicate" }).click();
    await runtime.page.waitForFunction(() => true);
    await runtime.page.waitForTimeout(50);
    assert.equal(runtime.mutations.length, 1);
    assertMutation(runtime.mutations[0], { pathSuffix: `/${ACTIVE_CONTRACT_ID}/duplicate`, action: "duplicate" });
    assert.deepEqual(runtime.browserErrors, []);
  } finally {
    await runtime.context.close();
  }
}

async function runRewards(browser, fixture) {
  const runtime = await createRuntime(browser, fixture);
  try {
    const row = runtime.page.locator("tr").filter({ hasText: "Regional Supply Chain Resilience Briefing" }).first();
    await row.getByRole("button", { name: "Details" }).click();
    await runtime.page.getByRole("button", { name: "Issue rewards" }).waitFor({ state: "visible", timeout: 10_000 });
    await runtime.page.getByRole("button", { name: "Issue rewards" }).click();
    const dialog = runtime.page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Issue rewards" }).click();
    await dialog.waitFor({ state: "detached" });
    const mutation = runtime.mutations.find(({ pathname }) => pathname.endsWith("/rewards/issue"));
    assertMutation(mutation, { pathSuffix: `/${ACTIVE_CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`, action: "issue-rewards" });
    assert.deepEqual(runtime.browserErrors, []);
  } finally {
    await runtime.context.close();
  }
}

const fixture = await startAdminV2FixtureServer();
const browser = await chromium.launch({ headless: true });
try {
  await runPublish(browser, fixture);
  await runArchive(browser, fixture);
  await runDuplicate(browser, fixture);
  await runRewards(browser, fixture);
  process.stdout.write("Admin V2 Contracts lifecycle browser mutation smoke passed.\n");
} finally {
  await browser.close();
  await fixture.close();
}
