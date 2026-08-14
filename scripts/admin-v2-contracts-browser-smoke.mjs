import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  ADMIN_V2_FIXTURE_ADMIN_ID,
  ADMIN_V2_FIXTURE_CSRF,
  ADMIN_V2_FIXTURE_GAME_ID,
  ADMIN_V2_FIXTURE_PERMISSIONS,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const EVIDENCE_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "docs",
  "operations",
  "evidence",
  "admin-ui-v2-contracts",
);
const RESULT_PATH = path.join(EVIDENCE_DIRECTORY, "admin-v2-contracts-browser-results.json");
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const CONTRACT_ID = "60000000-0000-4000-8000-000000000006";
const SECOND_CONTRACT_ID = "61000000-0000-4000-8000-000000000007";
const THIRD_CONTRACT_ID = "62000000-0000-4000-8000-000000000008";
const PROGRESS_ID = "63000000-0000-4000-8000-000000000009";
const PRIVATE_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const RAW_DIAGNOSTIC = "SELECT * FROM private.player_contract_progress using service_role";
const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 390, height: 844 }),
]);

mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });

const checks = [];
const screenshots = [];
const requestEvidence = [];

function contractRecord(overrides = {}) {
  return {
    id: CONTRACT_ID,
    contractId: CONTRACT_ID,
    contractKey: "supply-chain-resilience",
    title: "Regional Supply Chain Resilience Briefing",
    description: "Prepare an evidence-backed response to a multi-market logistics disruption.",
    instructions: "Use current classroom evidence to explain how the disruption affects production, prices, and household choices. Cite at least two linked observations and explain the mechanism clearly.",
    category: "World Economy",
    sourceType: "teacher",
    status: "active",
    visibility: "public",
    completionMode: "manual_review",
    targetingPayload: { allPlayers: true },
    requirementsPayload: { manualText: "Submit a written response with evidence." },
    rewardPayload: { cash: { amount: 150, currencyCode: "ECO" }, items: [{ itemId: "64000000-0000-4000-8000-000000000010", quantity: 2 }] },
    metadata: { difficulty: "Intermediate", materials: ["Market bulletin", "Production report"] },
    deadlineAt: "2026-08-14T15:00:00.000Z",
    expiresAt: "2026-08-15T15:00:00.000Z",
    progressCount: 2,
    submittedCount: 1,
    completedCount: 1,
    rewardIssuedCount: 0,
    ...overrides,
  };
}

function contractsFor(mode) {
  if (mode === "empty") return [];
  if (mode === "one") return [contractRecord()];
  return [
    contractRecord(),
    contractRecord({
      id: SECOND_CONTRACT_ID,
      contractId: SECOND_CONTRACT_ID,
      contractKey: "hanul-community-production",
      title: "한울 지역 공동체의 초소형 정밀 부품 생산·분배 분석 과제",
      description: "긴 한국어 설명과 비ASCII 문자가 모바일에서도 잘 줄바꿈되는지 검증합니다.",
      instructions: "생산량, 가격 신호, 가계 선택의 연결 관계를 설명하고 증거를 제출하세요.",
      category: "생산과 무역",
      status: "scheduled",
      visibility: "targeted",
      targetingPayload: { allPlayers: false, countryCodes: ["HANUL"] },
      deadlineAt: "2026-08-21T15:00:00.000Z",
      progressCount: 0,
      submittedCount: 0,
      completedCount: 0,
    }),
    contractRecord({
      id: THIRD_CONTRACT_ID,
      contractId: THIRD_CONTRACT_ID,
      contractKey: "completed-policy-review",
      title: "Completed Monetary Policy Reflection",
      category: "Macroeconomics",
      status: "completed",
      completionMode: "auto_check",
      deadlineAt: "2026-08-01T15:00:00.000Z",
      expiresAt: "",
      progressCount: 18,
      submittedCount: 0,
      completedCount: 18,
      rewardIssuedCount: 18,
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
        contractId: CONTRACT_ID,
        playerId: "65000000-0000-4000-8000-000000000011",
        status: "submitted",
        evidencePayload: { writtenResponse: "Demand shifted because the supply interruption reduced available output while household demand remained strong." },
        resultPayload: {},
        submittedAt: "2026-08-07T05:00:00.000Z",
        rewardIssuedAt: null,
      },
    ],
  };
}

function submissionsResponse() {
  return {
    data: {
      contractId: CONTRACT_ID,
      submissions: [
        {
          id: PROGRESS_ID,
          progressId: PROGRESS_ID,
          displayName: "김서연 — International Markets Research Fellowship",
          rosterLabel: "Research cohort A",
          country: "HANUL",
          status: "submitted",
          evidence: "가격과 생산량 변화를 근거로 공급 충격의 전달 경로를 설명했습니다.",
          submittedAt: "2026-08-07T05:00:00.000Z",
          resultPayload: {},
        },
      ],
    },
  };
}

function responseForMutation(pathname, body) {
  if (pathname.endsWith("/publish")) return { ok: true, contract: contractRecord({ status: "active" }) };
  if (pathname.endsWith("/archive")) return { data: { contract: contractRecord({ status: "archived" }) } };
  if (pathname.endsWith("/duplicate")) return { data: { contract: contractRecord({ id: SECOND_CONTRACT_ID, contractId: SECOND_CONTRACT_ID, status: "draft" }) } };
  if (pathname.endsWith("/review")) {
    return { ok: true, contract: contractRecord(), progress: { ...progressResponse().progress[0], status: body?.action === "approve" ? "completed" : "in_progress" } };
  }
  if (pathname.endsWith("/rewards/issue")) {
    return { ok: true, rewardIssued: true, alreadyIssued: false, contract: contractRecord(), progress: { ...progressResponse().progress[0], status: "completed", rewardIssuedAt: "2026-08-07T06:00:00.000Z" }, rewardResult: { cash: { amount: 150, currencyCode: "ECO" } } };
  }
  return { ok: true, contract: contractRecord({ title: body?.title || "Created Contract", status: body?.status || "draft" }) };
}

function contractPath(pathname) {
  return pathname.includes(`/games/${ADMIN_V2_FIXTURE_GAME_ID}/contracts`);
}

async function installContractRoutes(page, { mode = "many", failReads = false, permissionDenied = false } = {}) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (permissionDenied && pathname.endsWith("/functions/v1/web-session-api/proxy/session/bootstrap")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          data: {
            admin: { email: "contracts.admin@example.test", displayName: "Contracts Administrator" },
            activeGame: { id: ADMIN_V2_FIXTURE_GAME_ID, name: "Contracts Fixture", status: "active", gameCode: "CTRCT7" },
            games: [{ id: ADMIN_V2_FIXTURE_GAME_ID, name: "Contracts Fixture", status: "active", gameCode: "CTRCT7" }],
            permissions: ADMIN_V2_FIXTURE_PERMISSIONS.filter((permission) => permission !== "contracts.manage"),
            roles: ["game_admin"],
            adminRole: "game_admin",
          },
          error: null,
          meta: { requestId: "contracts-permission" },
        }),
      });
    }

    if (!contractPath(pathname)) return route.continue();

    let body = {};
    if (request.postData()) {
      try { body = JSON.parse(request.postData()); } catch { body = {}; }
    }
    requestEvidence.push({
      method: request.method(),
      pathname,
      authorization: request.headers()["authorization"] || "",
      csrf: request.headers()["x-econovaria-csrf-token"] || "",
      idempotencyKey: request.headers()["idempotency-key"] || "",
      gameId: request.headers()["x-econovaria-game-id"] || "",
      body,
    });

    if (failReads && request.method() === "GET") {
      return route.fulfill({
        status: 503,
        headers: { "x-request-id": "contracts-safe-failure" },
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ code: "UPSTREAM_UNAVAILABLE", message: RAW_DIAGNOSTIC, retryable: true }),
      });
    }

    if (request.method() === "GET" && pathname.endsWith("/contracts")) {
      return route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ data: { contracts: contractsFor(mode), assignments: contractsFor(mode) } }) });
    }
    if (request.method() === "GET" && pathname.endsWith(`/${CONTRACT_ID}/progress`)) {
      return route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(progressResponse()) });
    }
    if (request.method() === "GET" && pathname.endsWith(`/${CONTRACT_ID}/submissions`)) {
      return route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(submissionsResponse()) });
    }

    return route.fulfill({
      status: pathname.endsWith("/contracts") ? 201 : 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(responseForMutation(pathname, body)),
    });
  });
}

async function createRuntime(browser, fixture, {
  mode = "many",
  viewport = VIEWPORTS[0],
  failReads = false,
  permissionDenied = false,
} = {}) {
  const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
  const session = createAdminV2FixtureSession("ready");
  if (permissionDenied) {
    session.permissions = session.permissions.filter((permission) => permission !== "contracts.manage");
  }
  await context.addInitScript(({ sessionKey, deviceKey, seededSession, deviceId }) => {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(seededSession));
      localStorage.setItem(deviceKey, deviceId);
    } catch {}
  }, { sessionKey: SESSION_STORAGE_KEY, deviceKey: DEVICE_STORAGE_KEY, seededSession: session, deviceId: DEVICE_ID });
  const page = await context.newPage();
  await installContractRoutes(page, { mode, failReads, permissionDenied });
  await page.goto(`${fixture.origin}/admin/v2.html?game=${ADMIN_V2_FIXTURE_GAME_ID}#contracts`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  return { context, page, async close() { await context.close(); } };
}

async function waitForState(page, state) {
  await page.locator(`.admin-contracts-route[data-admin-v2-state="${state}"]`).waitFor({ state: "attached", timeout: 10_000 });
  const gate = page.locator("#adminSessionGate");
  if (await gate.count()) await gate.waitFor({ state: "detached", timeout: 10_000 });
}

async function noUuidLeak(page, label) {
  const exposure = await page.evaluate(() => {
    const attributes = [];
    for (const element of document.body.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        if (attribute.name === "title" || attribute.name.startsWith("aria-") || attribute.name.startsWith("data-")) {
          attributes.push(`${attribute.name}=${attribute.value}`);
        }
      }
    }
    return { text: document.body.innerText, attributes };
  });
  assert.doesNotMatch(exposure.text, PRIVATE_UUID_PATTERN, `${label} rendered a UUID`);
  assert.doesNotMatch(exposure.attributes.join("\n"), PRIVATE_UUID_PATTERN, `${label} exposed a UUID attribute`);
  assert.equal(exposure.text.includes(RAW_DIAGNOSTIC), false, `${label} rendered backend diagnostics`);
  assert.equal(exposure.text.includes(ADMIN_V2_FIXTURE_ADMIN_ID), false, `${label} rendered admin ownership identity`);
}

async function noOverflow(page, label) {
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(widths.document <= widths.viewport + 1, `${label} document overflow ${JSON.stringify(widths)}`);
  assert.ok(widths.body <= widths.viewport + 1, `${label} body overflow ${JSON.stringify(widths)}`);
}

async function capture(page, name, viewport) {
  const destination = path.join(EVIDENCE_DIRECTORY, `contracts-${name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: destination, fullPage: false, animations: "disabled" });
  screenshots.push(path.relative(REPOSITORY_ROOT, destination));
}

async function runCheck(name, callback) {
  try {
    const details = await callback();
    checks.push({ name, status: "passed", ...details });
  } catch (error) {
    checks.push({ name, status: "failed", failure: error?.stack || String(error) });
  }
}

const fixture = await startAdminV2FixtureServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    await runCheck(`ready-many-${viewport.width}x${viewport.height}`, async () => {
      const runtime = await createRuntime(browser, fixture, { mode: "many", viewport });
      try {
        await waitForState(runtime.page, "ready");
        await runtime.page.getByRole("heading", { level: 1, name: "Contracts Management" }).waitFor({ state: "visible" });
        assert.equal(await runtime.page.locator(".admin-contracts-route__catalog .admin-data-table__row").count(), 3);
        const text = await runtime.page.locator("body").innerText();
        assert.match(text, /한울 지역 공동체/);
        assert.match(text, /Completed Monetary Policy Reflection/);
        await noUuidLeak(runtime.page, `Contracts ${viewport.width}x${viewport.height}`);
        await noOverflow(runtime.page, `Contracts ${viewport.width}x${viewport.height}`);
        await capture(runtime.page, "many", viewport);
        return { viewport: `${viewport.width}x${viewport.height}`, rows: 3 };
      } finally { await runtime.close(); }
    });
  }

  await runCheck("zero-one-search-filter", async () => {
    const empty = await createRuntime(browser, fixture, { mode: "empty" });
    try {
      await waitForState(empty.page, "empty");
      assert.match(await empty.page.locator("body").innerText(), /No contracts yet/i);
      await noUuidLeak(empty.page, "Contracts empty");
    } finally { await empty.close(); }

    const one = await createRuntime(browser, fixture, { mode: "one" });
    try {
      await waitForState(one.page, "ready");
      assert.equal(await one.page.locator(".admin-contracts-route__catalog .admin-data-table__row").count(), 1);
    } finally { await one.close(); }

    const many = await createRuntime(browser, fixture, { mode: "many" });
    try {
      await waitForState(many.page, "ready");
      await many.page.getByLabel("Search contracts").fill("한울");
      assert.equal(await many.page.locator(".admin-contracts-route__catalog .admin-data-table__row").count(), 1);
      await many.page.getByLabel("Search contracts").fill("");
      await many.page.getByLabel("Lifecycle status").selectOption("completed");
      assert.equal(await many.page.locator(".admin-contracts-route__catalog .admin-data-table__row").count(), 1);
      assert.match(await many.page.locator(".admin-contracts-route__catalog").innerText(), /Completed Monetary Policy Reflection/);
    } finally { await many.close(); }
    return { empty: true, one: true, searchFilter: true };
  });

  await runCheck("detail-review-and-mutation-boundary", async () => {
    const runtime = await createRuntime(browser, fixture, { mode: "many" });
    try {
      await waitForState(runtime.page, "ready");
      await runtime.page.locator('.admin-contracts-route__row-actions [data-contracts-action="details"]').first().click();
      const drawer = runtime.page.locator(".admin-contracts-detail-drawer");
      await drawer.getByText("김서연 — International Markets Research Fellowship", { exact: true }).waitFor({ state: "visible" });
      assert.match(await drawer.innerText(), /가격과 생산량 변화를 근거로/);
      await noUuidLeak(runtime.page, "Contracts detail");

      await drawer.getByRole("button", { name: "Approve" }).click();
      await runtime.page.getByRole("button", { name: "Approve submission" }).click();
      await runtime.page.waitForTimeout(75);

      const write = requestEvidence.find((entry) => entry.pathname.endsWith("/review") && entry.method === "POST");
      assert.ok(write, "Review mutation did not reach the BFF transport");
      assert.equal(write.authorization, "");
      assert.equal(write.csrf, ADMIN_V2_FIXTURE_CSRF);
      assert.equal(write.gameId, ADMIN_V2_FIXTURE_GAME_ID);
      assert.match(write.idempotencyKey, /^admin\.contracts\.review-approve\./);
      assert.deepEqual(Object.keys(write.body).sort(), ["action", "resultPayload"]);
      assert.equal(write.body.action, "approve");
      assert.equal("staffUserId" in write.body, false);
      assert.equal("playerId" in write.body, false);
      await noOverflow(runtime.page, "Contracts detail review");
      return { reviewMutation: true, csrf: true, idempotency: true, noAuthorityFields: true };
    } finally { await runtime.close(); }
  });

  await runCheck("create-validation", async () => {
    const runtime = await createRuntime(browser, fixture, { mode: "many" });
    try {
      await waitForState(runtime.page, "ready");
      await runtime.page.getByRole("button", { name: "Create Contract" }).first().click();
      await runtime.page.getByRole("button", { name: "Create Contract" }).last().click();
      await runtime.page.locator(".admin-field__error").filter({ hasText: "Contract title is required." }).first().waitFor({ state: "visible" });
      assert.equal(requestEvidence.filter((entry) => entry.method === "POST" && entry.pathname.endsWith("/contracts")).length, 0);
      await runtime.page.getByLabel("Title").fill("New Evidence Contract");
      await runtime.page.getByLabel("Objective").fill("Explain the causal mechanism.");
      await runtime.page.getByLabel("Instructions").fill("Submit a concise evidence-based response.");
      await runtime.page.getByLabel("Evidence / submission requirements").fill("Use at least two classroom observations.");
      await runtime.page.getByRole("button", { name: "Create Contract" }).last().click();
      await runtime.page.waitForTimeout(75);
      const create = requestEvidence.find((entry) => entry.method === "POST" && entry.pathname.endsWith("/contracts"));
      assert.ok(create);
      assert.equal(create.csrf, ADMIN_V2_FIXTURE_CSRF);
      assert.match(create.idempotencyKey, /^admin\.contracts\.create\./);
      assert.equal(create.body.title, "New Evidence Contract");
      return { localValidation: true, createMutation: true };
    } finally { await runtime.close(); }
  });

  await runCheck("safe-read-failure", async () => {
    const runtime = await createRuntime(browser, fixture, { failReads: true });
    try {
      await waitForState(runtime.page, "failed");
      const text = await runtime.page.locator("body").innerText();
      assert.match(text, /temporarily unavailable/i);
      assert.equal(text.includes(RAW_DIAGNOSTIC), false);
      await noUuidLeak(runtime.page, "Contracts failed");
      return { safeError: true };
    } finally { await runtime.close(); }
  });

  await runCheck("permission-denial", async () => {
    const requestStart = requestEvidence.length;
    const runtime = await createRuntime(browser, fixture, { permissionDenied: true });
    try {
      const denied = runtime.page.getByText("Contracts access restricted", { exact: true });
      await denied.waitFor({ state: "visible", timeout: 10_000 });
      assert.equal(requestEvidence.slice(requestStart).filter((entry) => entry.pathname.endsWith("/contracts") && entry.method === "GET").length, 0);
      await noUuidLeak(runtime.page, "Contracts permission denial");
      return { deniedBeforeDomainRead: true };
    } finally { await runtime.close(); }
  });
} finally {
  await browser?.close();
  await fixture.close();
}

const failed = checks.filter((check) => check.status === "failed");
const result = {
  route: "contracts",
  baseSha: "b7827211f0ff15b8a963219a63738180b33a1b3d",
  generatedAt: new Date().toISOString(),
  viewports: VIEWPORTS.map(({ width, height }) => `${width}x${height}`),
  checks,
  screenshots,
  requestEvidence: requestEvidence.map((entry) => ({
    method: entry.method,
    pathname: entry.pathname.replace(PRIVATE_UUID_PATTERN, ":resource"),
    hasAuthorization: Boolean(entry.authorization),
    hasCsrf: Boolean(entry.csrf),
    hasIdempotencyKey: Boolean(entry.idempotencyKey),
    gameScoped: entry.gameId === ADMIN_V2_FIXTURE_GAME_ID,
  })),
  status: failed.length === 0 ? "passed" : "failed",
};
writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);

if (failed.length) {
  throw new Error(`Admin v2 Contracts browser smoke failed:\n${failed.map((entry) => `${entry.name}: ${entry.failure}`).join("\n\n")}`);
}

process.stdout.write(`Admin v2 Contracts browser smoke passed: ${checks.length} checks, ${screenshots.length} screenshots.\n`);
