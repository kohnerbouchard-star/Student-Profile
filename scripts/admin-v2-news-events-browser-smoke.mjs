import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  ADMIN_V2_FIXTURE_ADMIN_ID,
  ADMIN_V2_FIXTURE_CSRF,
  ADMIN_V2_FIXTURE_GAME_ID,
  ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const EVIDENCE_DIRECTORY = path.resolve(
  process.env.ADMIN_V2_EVIDENCE_DIR
    || path.join(REPOSITORY_ROOT, "docs", "operations", "evidence", "admin-ui-v2-news-events"),
);
const RESULT_PATH = path.join(EVIDENCE_DIRECTORY, "admin-v2-news-events-browser-results.json");
const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const FAILED_EFFECT_ID = "cec_0123456789abcdef0123456789abcdef";
const PRIVATE_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 1024, height: 768 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 320, height: 568 }),
]);
const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720 });

mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });

function envelope(data) {
  return { data, error: null, meta: { requestId: "news-events-browser-fixture" } };
}

function campaign(overrides = {}) {
  return {
    public_id: "cmp_0123456789abcdef0123456789abcdef",
    status: "active",
    current_phase: "shortage",
    revision: 9,
    event_sequence: 14,
    scheduled_at: "2099-08-08T03:00:00.000Z",
    updated_at: "2026-08-07T03:00:00.000Z",
    ...overrides,
  };
}

function historyEvent(index = 0, overrides = {}) {
  return {
    public_id: `evt_shortage_${String(index + 14).padStart(3, "0")}`,
    event_key: index === 0
      ? "shortage.logistics.disruption"
      : `shortage.regional.update.${String(index + 1).padStart(2, "0")}`,
    trigger_key: `scheduled.shortage.${String(index + 14).padStart(3, "0")}`,
    from_phase: index % 2 ? "shortage" : "rivalry",
    to_phase: "shortage",
    sequence: index + 14,
    actor_type: "system",
    reason: index === 0
      ? "항만 혼잡과 공급 제약으로 물류 비용이 증가했습니다. 매우 긴 한국어 사건 설명과 반응형 줄바꿈을 검증합니다."
      : `Regional event ${index + 1} records authoritative campaign history without exposing internal ownership identifiers.`,
    occurred_at: new Date(Date.UTC(2026, 7, 7, 2, 30 - Math.min(index, 29))).toISOString(),
    created_at: "2026-08-07T02:30:00.000Z",
    ...overrides,
  };
}

function newsEffect(status, id, index = 0, overrides = {}) {
  return {
    public_id: id,
    effect_kind: "publish_news",
    payload: {
      newsDefinitionId: status === "failed"
        ? "news.failed.regional_update"
        : `news.${status}.regional_update_${index + 1}`,
      audience: index % 2 ? "affected_locations" : "all_players",
    },
    status,
    attempt_count: status === "failed" ? 3 : 1,
    last_error_code: status === "failed" ? "campaign_news_delivery_failed" : null,
    claimed_at: status === "pending" ? null : "2026-08-07T02:40:00.000Z",
    completed_at: status === "completed" ? "2026-08-07T02:41:00.000Z" : null,
    created_at: "2026-08-07T02:00:00.000Z",
    updated_at: "2026-08-07T02:45:00.000Z",
    ...overrides,
  };
}

function dataForScenario(scenario) {
  if (scenario === "empty") {
    return { campaigns: [], history: [], effects: [] };
  }
  const history = scenario === "many"
    ? Array.from({ length: 28 }, (_, index) => historyEvent(index))
    : [historyEvent()];
  const effects = [
    newsEffect("pending", "cec_33333333333333333333333333333333", 0),
    newsEffect("processing", "cec_44444444444444444444444444444444", 1),
    newsEffect("completed", "cec_11111111111111111111111111111111", 2),
    newsEffect("failed", FAILED_EFFECT_ID, 3),
    {
      public_id: "cec_22222222222222222222222222222222",
      effect_kind: "apply_market_shock",
      payload: { marketShockDefinitionId: "market.shortage", magnitudeBasisPoints: -400 },
      status: "completed",
      attempt_count: 1,
    },
  ];
  if (scenario === "many") {
    for (let index = 0; index < 24; index += 1) {
      effects.push(newsEffect(index % 3 === 0 ? "pending" : "completed", `cec_${(index + 100).toString(16).padStart(32, "0")}`, index + 4));
    }
  }
  return { campaigns: [campaign()], history, effects };
}

function jsonRoute(route, status, body, headers = {}) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    headers,
    body: JSON.stringify(body),
  });
}

async function installWorldContract(page, scenario, mutationCalls) {
  const counts = new Map();
  const prefix = `/functions/v1/web-session-api/proxy/games/${ADMIN_V2_FIXTURE_GAME_ID}/world/campaign`;
  await page.route(`**${prefix}**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const count = (counts.get(pathname) || 0) + 1;
    counts.set(pathname, count);

    if (scenario === "failed" || scenario === "stale" && count > 1) {
      return route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
      });
    }

    const recoveryMatch = pathname.match(/\/world\/campaign\/effects\/(cec_[0-9a-f]{32})\/recover$/i);
    if (recoveryMatch) {
      assert.equal(request.method(), "POST");
      const headers = await request.allHeaders();
      assert.equal(headers["x-econovaria-csrf-token"], ADMIN_V2_FIXTURE_CSRF);
      assert.match(String(headers["idempotency-key"] || ""), /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/);
      const body = JSON.parse(request.postData() || "{}");
      assert.deepEqual(Object.keys(body).sort(), ["reason", "requestId"]);
      assert.equal(body.requestId, headers["idempotency-key"]);
      assert.match(body.reason, /reviewed/i);
      mutationCalls.push({ effectId: recoveryMatch[1], body, headers });
      return jsonRoute(route, 200, envelope({ outcome: [{ status: "pending" }], operation: "campaign effect recovery" }));
    }

    assert.equal(request.method(), "GET");
    const data = dataForScenario(scenario);
    if (pathname === prefix) {
      return jsonRoute(route, 200, envelope({ campaigns: data.campaigns, scheduler: {} }));
    }
    if (pathname === `${prefix}/history`) {
      assert.equal(url.searchParams.get("limit"), "250");
      return jsonRoute(route, 200, envelope({ history: data.history }));
    }
    if (pathname === `${prefix}/effects`) {
      assert.equal(url.searchParams.get("status"), "all");
      assert.equal(url.searchParams.get("limit"), "250");
      return jsonRoute(route, 200, envelope({
        effects: data.effects,
        summary: { pending: 1, processing: 1, completed: 1, failed: 1 },
      }));
    }
    return route.abort("failed");
  });
}

async function createRuntime(browser, fixture, scenario, viewport = DEFAULT_VIEWPORT) {
  const runId = randomUUID();
  const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
  await context.addCookies([
    { name: "admin-v2-scenario", value: "ready", url: fixture.origin, sameSite: "Lax" },
    { name: "admin-v2-run", value: runId, url: fixture.origin, sameSite: "Lax" },
  ]);
  const session = createAdminV2FixtureSession("ready");
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
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  const mutationCalls = [];
  await installWorldContract(page, scenario, mutationCalls);
  await page.goto(`${fixture.origin}/admin/v2.html?game=${encodeURIComponent(ADMIN_V2_FIXTURE_GAME_ID)}#news-events`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  return { context, page, runId, browserErrors, mutationCalls };
}

async function waitForState(page, state) {
  await page.locator(`.admin-news-events[data-news-events-state="${state}"]`).waitFor({ state: "attached", timeout: 10_000 });
  await page.getByRole("heading", { level: 1, name: "News & Event Monitor", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(metrics.document <= metrics.viewport + 1, `${label} document overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.body <= metrics.viewport + 1, `${label} body overflow: ${JSON.stringify(metrics)}`);
}

async function assertNoPrivateIds(page, label) {
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
  assert.doesNotMatch(exposure.text, PRIVATE_UUID_PATTERN, `${label} rendered a private UUID`);
  assert.doesNotMatch(exposure.attributes.join("\n"), PRIVATE_UUID_PATTERN, `${label} exposed a private UUID attribute`);
  assert.equal(exposure.text.includes(ADMIN_V2_FIXTURE_GAME_ID), false);
  assert.equal(exposure.text.includes(ADMIN_V2_FIXTURE_ADMIN_ID), false);
  assert.equal(exposure.text.includes(FAILED_EFFECT_ID), false);
  assert.equal(exposure.text.includes(ADMIN_V2_RAW_BACKEND_DIAGNOSTIC), false);
}

async function responsiveScenario(browser, fixture, viewport) {
  const runtime = await createRuntime(browser, fixture, "many", viewport);
  try {
    await waitForState(runtime.page, "ready");
    await assertNoHorizontalOverflow(runtime.page, `responsive ${viewport.width}x${viewport.height}`);
    await assertNoPrivateIds(runtime.page, `responsive ${viewport.width}x${viewport.height}`);
    const body = await runtime.page.locator("body").innerText();
    assert.match(body, /항만 혼잡과 공급 제약/);
    assert.match(body, /Read-only publication monitor/);
    assert.doesNotMatch(body, /Create news|Create event|Schedule event|Edit news/i);
    assert.deepEqual(runtime.browserErrors, [], `responsive ${viewport.width}x${viewport.height} emitted browser errors`);
  } finally {
    await runtime.context.close();
  }
}

async function filtersAndRecoveryScenario(browser, fixture) {
  const runtime = await createRuntime(browser, fixture, "ready");
  try {
    await waitForState(runtime.page, "ready");
    const search = runtime.page.getByLabel("Search News & Events");
    await search.fill("공급 제약");
    await runtime.page.waitForTimeout(50);
    assert.equal(await runtime.page.locator(".admin-news-events .admin-data-table__row").count(), 1);
    await search.fill("");
    await runtime.page.getByLabel("Lifecycle", { exact: true }).selectOption("failed");
    await runtime.page.waitForTimeout(50);
    const rows = runtime.page.locator(".admin-news-events .admin-data-table__row");
    assert.equal(await rows.count(), 1);
    const failedRow = rows.first();
    assert.match(await failedRow.innerText(), /news\.failed\.regional_update/);
    await failedRow.getByRole("button", { name: "View details" }).click();
    await runtime.page.getByRole("heading", { name: "News publication detail" }).waitFor({ state: "visible" });
    await runtime.page.getByLabel("Recovery reason").fill("Reviewed after authoritative worker delivery recovered.");
    await runtime.page.getByRole("button", { name: "Recover failed publication" }).click();
    await runtime.page.waitForFunction(() => document.body.innerText.includes("Recovery queued"));
    assert.equal(runtime.mutationCalls.length, 1);
    assert.equal(runtime.mutationCalls[0].effectId, FAILED_EFFECT_ID);
    await assertNoPrivateIds(runtime.page, "recovery");
    assert.deepEqual(runtime.browserErrors, [], "recovery emitted browser errors");
  } finally {
    await runtime.context.close();
  }
}

async function emptyScenario(browser, fixture) {
  const runtime = await createRuntime(browser, fixture, "empty");
  try {
    await waitForState(runtime.page, "empty");
    const body = await runtime.page.locator("body").innerText();
    assert.match(body, /No authoritative news or events yet/);
    await assertNoHorizontalOverflow(runtime.page, "empty");
    await assertNoPrivateIds(runtime.page, "empty");
    assert.deepEqual(runtime.browserErrors, [], "empty emitted browser errors");
  } finally {
    await runtime.context.close();
  }
}

async function staleScenario(browser, fixture) {
  const runtime = await createRuntime(browser, fixture, "stale");
  try {
    await waitForState(runtime.page, "ready");
    await runtime.page.getByRole("button", { name: "Refresh", exact: true }).first().click();
    await waitForState(runtime.page, "stale");
    assert.match(await runtime.page.locator("body").innerText(), /most recently resolved News & Events data/i);
    await assertNoPrivateIds(runtime.page, "stale");
    assert.deepEqual(runtime.browserErrors, [], "stale emitted browser errors");
  } finally {
    await runtime.context.close();
  }
}

async function failedScenario(browser, fixture) {
  const runtime = await createRuntime(browser, fixture, "failed");
  try {
    await waitForState(runtime.page, "failed");
    const body = await runtime.page.locator("body").innerText();
    assert.match(body, /News & Event Monitor could not be loaded/);
    assert.equal(body.includes(ADMIN_V2_RAW_BACKEND_DIAGNOSTIC), false);
    await assertNoHorizontalOverflow(runtime.page, "failed");
    await assertNoPrivateIds(runtime.page, "failed");
    assert.deepEqual(runtime.browserErrors, [], "failed emitted browser errors");
  } finally {
    await runtime.context.close();
  }
}

const fixture = await startAdminV2FixtureServer();
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const viewport of VIEWPORTS) {
    await responsiveScenario(browser, fixture, viewport);
    checks.push(`responsive-${viewport.width}x${viewport.height}`);
  }
  await filtersAndRecoveryScenario(browser, fixture);
  checks.push("filters-detail-recovery");
  await emptyScenario(browser, fixture);
  checks.push("empty");
  await staleScenario(browser, fixture);
  checks.push("stale");
  await failedScenario(browser, fixture);
  checks.push("failed-safe-errors");
} finally {
  await browser.close();
  await fixture.close();
}

const result = {
  generatedAt: new Date().toISOString(),
  route: "#news-events",
  viewports: VIEWPORTS,
  checks,
  mutationBoundary: "failed publish_news recovery only",
  rawBackendDetailExposed: false,
  privateUuidExposed: false,
};
writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
