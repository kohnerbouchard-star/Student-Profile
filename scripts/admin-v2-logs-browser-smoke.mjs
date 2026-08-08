import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  ADMIN_V2_FIXTURE_ADMIN_ID,
  ADMIN_V2_FIXTURE_GAME_ID,
  ADMIN_V2_FIXTURE_PERMISSIONS,
  ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_DIR = path.join(ROOT, "docs", "operations", "evidence", "admin-ui-v2-logs");
const RESULT_PATH = path.join(EVIDENCE_DIR, "admin-v2-logs-browser-results.json");
const DEVICE_ID = "d0000000-0000-4000-8000-00000000000d";
const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const LOG_PATH = `/games/${ADMIN_V2_FIXTURE_GAME_ID}/logs`;
const PRIVATE_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const INTERNAL_OPAQUE_PATTERN = /ownership-record-opaque-123456/i;
const SECRET_PATTERN = /service[_-]?role|supabase_service_role_key|access[_-]?token|refresh[_-]?token|bearer\s|authorization\s*:|select\s+\*\s+from|backend\/.*:\d+|\beyJ[A-Za-z0-9_-]{10,}\.|\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}|postgres(?:ql)?:\/\/|-----BEGIN .*PRIVATE KEY-----/i;

mkdirSync(EVIDENCE_DIR, { recursive: true });

function auditRows({ many = false, korean = true } = {}) {
  const base = [
    {
      id: "21000000-0000-4000-8000-000000000001",
      eventId: "21000000-0000-4000-8000-000000000001",
      actorType: "staff",
      actorId: ADMIN_V2_FIXTURE_ADMIN_ID,
      action: "store.item.updated",
      targetType: "store_item",
      targetId: "22000000-0000-4000-8000-000000000002",
      metadata: {
        category: "store",
        status: "completed",
        reason: korean ? "교실 상점 가격 정책 검토 완료" : "Store policy reviewed",
        count: 3,
        itemKey: "beta-nort-sensor-board",
        ownerId: "ownership-record-opaque-123456",
        correlation: "018f4d2a-7c9b-7abc-bdef-1234567890ab",
        access_token: "Bearer test-auth-material-not-for-display",
        service_role: "service_role",
        apiKey: "sk-proj-test-secret-material-123456789",
        diagnosticNote: "postgresql://audit:secret-password@example.invalid/private",
        raw_sql: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
        stack_trace: "Error: hidden\n    at handler (backend/index.ts:99:1)",
        malformed: { nested: true },
      },
      createdAt: "2026-08-07T05:12:00.000Z",
    },
    {
      id: "23000000-0000-4000-8000-000000000003",
      actorType: "player",
      actorId: "24000000-0000-4000-8000-000000000004",
      action: "attendance.scan.recorded",
      targetType: "attendance",
      targetId: "25000000-0000-4000-8000-000000000005",
      metadata: { success: true, source: "scanner", note: "정상 출석 처리" },
      createdAt: "2026-08-07T05:11:00.000Z",
    },
    {
      id: "26000000-0000-4000-8000-000000000006",
      actorType: "system",
      actorId: null,
      action: "progression.review.completed",
      targetType: "achievement",
      targetId: "27000000-0000-4000-8000-000000000007",
      metadata: { result: "approved", count: 1 },
      createdAt: "2026-08-07T05:10:00.000Z",
    },
  ];
  if (!many) return base;
  const rows = [...base];
  for (let index = rows.length; index < 200; index += 1) {
    rows.push({
      id: `28000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      actorType: index % 2 ? "staff" : "system",
      action: index % 3 ? `market.quote.observed.${index}` : `attendance.review.${index}`,
      targetType: index % 3 ? "market_asset" : "attendance",
      metadata: { status: index % 4 ? "completed" : "failed", count: index },
      createdAt: new Date(Date.UTC(2026, 7, 7, 4, 0, index % 60)).toISOString(),
    });
  }
  return rows;
}

function pagePayload(url, rows, { total = rows.length } = {}) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") || 50));
  const search = String(url.searchParams.get("search") || "").toLowerCase();
  const action = String(url.searchParams.get("action") || "");
  const actorType = String(url.searchParams.get("actorType") || "");
  const targetType = String(url.searchParams.get("targetType") || "");
  let filtered = rows;
  if (search) filtered = filtered.filter((row) => String(row.action || "").toLowerCase().includes(search));
  if (action) filtered = filtered.filter((row) => row.action === action);
  if (actorType) filtered = filtered.filter((row) => row.actorType === actorType);
  if (targetType) filtered = filtered.filter((row) => row.targetType === targetType);
  const filteredTotal = search || action || actorType || targetType ? filtered.length : total;
  const start = (page - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  return {
    data: {
      logs: visible,
      auditLogs: visible,
      total: filteredTotal,
      pagination: {
        page,
        pageSize,
        total: filteredTotal,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      reviewStaffId: ADMIN_V2_FIXTURE_ADMIN_ID,
    },
  };
}

async function installSession(context, permissions = ADMIN_V2_FIXTURE_PERMISSIONS) {
  const session = { ...createAdminV2FixtureSession("ready"), permissions: [...permissions] };
  await context.addInitScript(({ sessionKey, deviceKey, sessionValue, deviceId }) => {
    try {
      window.sessionStorage.setItem(sessionKey, JSON.stringify(sessionValue));
      window.localStorage.setItem(deviceKey, deviceId);
    } catch (_error) {}
  }, {
    sessionKey: SESSION_STORAGE_KEY,
    deviceKey: DEVICE_STORAGE_KEY,
    sessionValue: session,
    deviceId: DEVICE_ID,
  });
}

async function openLogs(browser, fixture, {
  viewport = { width: 1280, height: 720 },
  rows = auditRows(),
  permissions = ADMIN_V2_FIXTURE_PERMISSIONS,
  mode = "ready",
} = {}) {
  const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
  const runId = randomUUID();
  await context.addCookies([
    { name: "admin-v2-scenario", value: "ready", url: fixture.origin, sameSite: "Lax" },
    { name: "admin-v2-run", value: runId, url: fixture.origin, sameSite: "Lax" },
  ]);
  await installSession(context, permissions);
  const logRequests = [];
  let readCount = 0;

  if (!permissions.includes("audit.read")) {
    await context.route("**/functions/v1/web-session-api/proxy/session/bootstrap", async (route) => {
      const session = createAdminV2FixtureSession("ready");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: {
          admin: session.user,
          activeGame: session.activeGameSessions[0],
          games: session.activeGameSessions,
          permissions: permissions,
          roles: ["game_admin"],
          adminRole: "game_admin",
        } }),
      });
    });
  }

  await context.route(`**/functions/v1/web-session-api/proxy${LOG_PATH}**`, async (route) => {
    readCount += 1;
    const request = route.request();
    const url = new URL(request.url());
    logRequests.push({ method: request.method(), url: request.url(), headers: request.headers() });
    if (mode === "failed" || mode === "stale" && readCount > 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "x-request-id": `logs-${mode}`, "retry-after": "3" },
        body: JSON.stringify({
          error: { code: "UPSTREAM_UNAVAILABLE", message: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC, retryable: true },
          diagnostic: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(pagePayload(url, rows, { total: mode === "many" ? 200 : rows.length })),
    });
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.goto(`${fixture.origin}/admin/v2.html?game=${encodeURIComponent(ADMIN_V2_FIXTURE_GAME_ID)}#logs`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await page.locator("#adminSessionGate").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
  return { context, page, errors, logRequests, getReadCount: () => readCount };
}

async function waitForState(page, state) {
  await page.locator(`.admin-logs-route[data-admin-v2-state="${state}"]`).waitFor({ state: "attached", timeout: 10_000 });
}

async function exposure(page) {
  return page.evaluate(() => {
    const attrs = [];
    for (const element of document.body.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        if (attribute.name.startsWith("data-") || attribute.name.startsWith("aria-") || ["href", "title"].includes(attribute.name)) {
          attrs.push(`${attribute.name}=${attribute.value}`);
        }
      }
    }
    return { text: document.body.innerText, attrs: attrs.join("\n") };
  });
}

async function assertNoLeakage(page, label) {
  const rendered = await exposure(page);
  assert.doesNotMatch(rendered.text, PRIVATE_UUID_PATTERN, `${label} visible UUID leak`);
  assert.doesNotMatch(rendered.attrs, PRIVATE_UUID_PATTERN, `${label} attribute UUID leak`);
  assert.doesNotMatch(rendered.text, INTERNAL_OPAQUE_PATTERN, `${label} visible opaque ownership identifier leak`);
  assert.doesNotMatch(rendered.attrs, INTERNAL_OPAQUE_PATTERN, `${label} attribute opaque ownership identifier leak`);
  assert.doesNotMatch(rendered.text, SECRET_PATTERN, `${label} secret/diagnostic leak`);
  assert.doesNotMatch(rendered.attrs, SECRET_PATTERN, `${label} secret/diagnostic attribute leak`);
  assert.doesNotMatch(rendered.text, /\[object Object\]|\bNaN\b|\bInfinity\b/, `${label} malformed metadata rendering`);
}

async function assertNoDocumentOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(metrics.document <= metrics.viewport + 1, `${label} document overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.body <= metrics.viewport + 1, `${label} body overflow: ${JSON.stringify(metrics)}`);
}

const results = [];
const fixture = await startAdminV2FixtureServer({ repositoryRoot: ROOT });
const browser = await chromium.launch({ headless: true });
try {
  {
    const runtime = await openLogs(browser, fixture);
    await waitForState(runtime.page, "ready");
    await runtime.page.getByRole("heading", { level: 1, name: "Logs", exact: true }).waitFor({ state: "visible" });
    assert.equal(await runtime.page.locator(".admin-logs-route .admin-data-table__row").count(), 3);
    assert.match(await runtime.page.locator("body").innerText(), /교실 상점 가격 정책 검토 완료/);
    assert.match(await runtime.page.locator("body").innerText(), /Read-only operational record/);
    assert.equal(runtime.logRequests.every((request) => request.method === "GET"), true);
    assert.equal(runtime.logRequests.every((request) => !request.headers.authorization), true);
    assert.equal(runtime.logRequests.every((request) => !request.headers["idempotency-key"]), true);
    await assertNoLeakage(runtime.page, "ready");
    assert.deepEqual(runtime.errors, []);
    await runtime.page.screenshot({ path: path.join(EVIDENCE_DIR, "logs-ready-1280x720.png"), animations: "disabled" });
    results.push({ scenario: "ready", passed: true });
    await runtime.context.close();
  }

  {
    const runtime = await openLogs(browser, fixture, { rows: [] });
    await waitForState(runtime.page, "empty");
    assert.match(await runtime.page.locator("body").innerText(), /No audit events are available/);
    await assertNoLeakage(runtime.page, "empty");
    results.push({ scenario: "empty", passed: true });
    await runtime.context.close();
  }

  {
    const runtime = await openLogs(browser, fixture, { rows: auditRows({ many: true }), mode: "many" });
    await waitForState(runtime.page, "ready");
    assert.equal(await runtime.page.locator(".admin-logs-route .admin-data-table__row").count(), 50);
    await runtime.page.getByLabel("Search action text").fill("attendance");
    await runtime.page.getByRole("button", { name: "Apply filters" }).click();
    await waitForState(runtime.page, "ready");
    assert.ok(runtime.logRequests.some((request) => new URL(request.url).searchParams.get("search") === "attendance"));
    const count = await runtime.page.locator(".admin-logs-route .admin-data-table__row").count();
    assert.ok(count > 0 && count < 50);
    await assertNoLeakage(runtime.page, "filtering");
    results.push({ scenario: "filtering-large-volume", passed: true });
    await runtime.context.close();
  }

  {
    const runtime = await openLogs(browser, fixture, { mode: "stale" });
    await waitForState(runtime.page, "ready");
    await runtime.page.getByRole("button", { name: "Refresh" }).click();
    await waitForState(runtime.page, "stale");
    assert.match(await runtime.page.locator("body").innerText(), /Showing the last safe audit page/);
    assert.equal(await runtime.page.locator(".admin-logs-route .admin-data-table__row").count(), 3);
    await assertNoLeakage(runtime.page, "stale");
    results.push({ scenario: "stale-safe-error", passed: true });
    await runtime.context.close();
  }

  {
    const permissions = ADMIN_V2_FIXTURE_PERMISSIONS.filter((permission) => permission !== "audit.read");
    const runtime = await openLogs(browser, fixture, { permissions });
    await runtime.page.getByText("Logs access restricted", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(runtime.getReadCount(), 0);
    assert.equal(await runtime.page.locator(".admin-logs-route").count(), 0);
    results.push({ scenario: "permission-denied", passed: true });
    await runtime.context.close();
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const runtime = await openLogs(browser, fixture, { viewport, rows: auditRows({ many: true }), mode: "many" });
    await waitForState(runtime.page, "ready");
    await assertNoDocumentOverflow(runtime.page, `mobile-${viewport.width}`);
    const scroll = runtime.page.locator(".admin-logs-route .admin-data-table__scroll");
    assert.equal(await scroll.getAttribute("tabindex"), "0");
    await scroll.focus();
    assert.equal(await scroll.evaluate((element) => document.activeElement === element), true);
    await assertNoLeakage(runtime.page, `mobile-${viewport.width}`);
    await runtime.page.screenshot({
      path: path.join(EVIDENCE_DIR, `logs-mobile-${viewport.width}x${viewport.height}.png`),
      animations: "disabled",
    });
    results.push({ scenario: `mobile-${viewport.width}x${viewport.height}`, passed: true });
    await runtime.context.close();
  }
} finally {
  await browser.close();
  await fixture.close();
}

writeFileSync(RESULT_PATH, `${JSON.stringify({ passed: true, results }, null, 2)}\n`);
console.log(`Admin V2 Logs browser smoke passed (${results.length} scenarios).`);
