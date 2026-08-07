import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  ADMIN_V2_FIXTURE_ADMIN_ID,
  ADMIN_V2_FIXTURE_GAME_ID,
  ADMIN_V2_FIXTURE_MARKET_ASSET_ID,
  ADMIN_V2_FIXTURE_MARKET_NO_HISTORY_ASSET_ID,
  ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const STATIC_ROOT = path.resolve(
  REPOSITORY_ROOT,
  String(process.env.ADMIN_V2_STATIC_ROOT || ".").trim() || ".",
);
const EVIDENCE_DIRECTORY = path.resolve(
  process.env.ADMIN_V2_EVIDENCE_DIR
    || path.join(REPOSITORY_ROOT, "docs", "operations", "evidence", "admin-ui-v2-market"),
);
const RESULT_PATH = path.join(EVIDENCE_DIRECTORY, "admin-v2-market-browser-results.json");
const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 1280, height: 720 }),
  Object.freeze({ width: 1024, height: 768 }),
  Object.freeze({ width: 768, height: 1024 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 320, height: 568 }),
  Object.freeze({ width: 1024, height: 540 }),
]);
const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const MARKET_BASE_PATH = `/games/${ADMIN_V2_FIXTURE_GAME_ID}/market`;
const MARKET_ASSETS_PATH = `${MARKET_BASE_PATH}/assets`;
const MARKET_TRADES_PATH = `${MARKET_BASE_PATH}/trades/recent`;
const MARKET_EVENTS_PATH = `${MARKET_BASE_PATH}/events`;
const PRIVATE_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const SECURITY_WARNING_PATTERN = /content security policy|trusted\s*types?|trustedtype|refused to (?:execute|load|apply|connect)/i;
const RAW_DETAIL_FRAGMENTS = Object.freeze([
  ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
  "SELECT * FROM",
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "backend/supabase",
  "UPSTREAM_UNAVAILABLE",
  "MFA_REQUIRED",
]);

mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });

const checks = [];
const evidence = [];
const diagnostics = [];
const resourceManifest = new Map();

function screenshotName(state, viewport = DEFAULT_VIEWPORT) {
  return `market-${state}-${viewport.width}x${viewport.height}.png`;
}

function relativeEvidence(destination) {
  return path.relative(REPOSITORY_ROOT, destination);
}

async function capture(page, state, viewport = DEFAULT_VIEWPORT) {
  const destination = path.join(EVIDENCE_DIRECTORY, screenshotName(state, viewport));
  await page.screenshot({ path: destination, fullPage: false, animations: "disabled" });
  evidence.push(relativeEvidence(destination));
  return destination;
}

async function waitUntil(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function runtimeRecorder(page) {
  const errors = [];
  const securityWarnings = [];
  const failedRequests = [];
  const httpFailures = [];
  const resources = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
    if (SECURITY_WARNING_PATTERN.test(message.text())) {
      securityWarnings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "request failed"}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    const pathname = new URL(url).pathname;
    const contentType = response.headers()["content-type"] || "";
    const extension = path.extname(pathname).toLowerCase();
    const kind = [".js", ".mjs"].includes(extension)
      ? "javascript"
      : extension === ".css"
        ? "css"
        : [".svg", ".webp", ".png", ".jpg", ".jpeg", ".gif"].includes(extension)
          ? "image"
          : "other";
    resources.push({ url, pathname, status: response.status(), contentType, kind });
    if (response.status() >= 400) {
      httpFailures.push({
        method: response.request().method(),
        url,
        status: response.status(),
        fixtureErrorCode: response.headers()["x-fixture-error-code"] || "",
        retryAfter: response.headers()["retry-after"] || "",
      });
    }
  });
  return { errors, securityWarnings, failedRequests, httpFailures, resources };
}

async function createRuntime(browser, fixture, scenario, viewport = DEFAULT_VIEWPORT, {
  seedSession = true,
  includeGame = true,
  hash = "market",
} = {}) {
  const runId = randomUUID();
  const context = await browser.newContext({
    viewport,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  await context.addCookies([
    { name: "admin-v2-scenario", value: scenario, url: fixture.origin, sameSite: "Lax" },
    { name: "admin-v2-run", value: runId, url: fixture.origin, sameSite: "Lax" },
  ]);
  await context.addInitScript(({ sessionKey, deviceKey, session, deviceId }) => {
    try {
      if (session) window.sessionStorage.setItem(sessionKey, JSON.stringify(session));
      else window.sessionStorage.removeItem(sessionKey);
      window.localStorage.setItem(deviceKey, deviceId);
    } catch (_error) {
      // Originless init-script executions cannot access storage. The fixture
      // document receives the state before application scripts execute.
    }
  }, {
    sessionKey: SESSION_STORAGE_KEY,
    deviceKey: DEVICE_STORAGE_KEY,
    session: seedSession ? createAdminV2FixtureSession(scenario) : null,
    deviceId: DEVICE_ID,
  });

  const page = await context.newPage();
  const recorded = runtimeRecorder(page);
  const query = includeGame ? `?game=${encodeURIComponent(ADMIN_V2_FIXTURE_GAME_ID)}` : "";
  const fragment = hash ? `#${hash}` : "";
  await page.goto(`${fixture.origin}/admin/v2.html${query}${fragment}`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  return {
    context,
    page,
    runId,
    scenario,
    ...recorded,
    async close() {
      const resources = [...new Map(
        recorded.resources.map((entry) => [
          `${entry.pathname}|${entry.status}|${entry.contentType}|${entry.kind}`,
          {
            pathname: entry.pathname,
            status: entry.status,
            contentType: entry.contentType,
            kind: entry.kind,
          },
        ]),
      ).entries()];
      resources.forEach(([key, entry]) => resourceManifest.set(key, entry));
      diagnostics.push({
        scenario,
        errors: [...recorded.errors],
        securityWarnings: [...recorded.securityWarnings],
        failedRequests: [...recorded.failedRequests],
        httpFailures: [...recorded.httpFailures],
        resourceCount: resources.length,
      });
      await context.close();
    },
  };
}

async function waitForSessionGateRelease(page) {
  const gate = page.locator("#adminSessionGate");
  if (await gate.count()) await gate.waitFor({ state: "detached", timeout: 10_000 });
}

async function waitForMarketState(page, state, timeout = 10_000) {
  await page.locator(`.admin-market-route[data-admin-v2-state="${state}"]`)
    .waitFor({ state: "attached", timeout });
}

async function waitForReady(page, timeout = 10_000) {
  await waitForMarketState(page, "ready", timeout);
  await waitForSessionGateRelease(page);
  await page.getByRole("heading", { level: 1, name: "Market Management", exact: true })
    .waitFor({ state: "visible", timeout });
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

async function assertNoPrivateIdsOrRawDetails(page, label) {
  const exposure = await page.evaluate(() => {
    const attributes = [];
    for (const element of document.body.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        if (
          attribute.name === "title"
          || attribute.name.startsWith("aria-")
          || attribute.name.startsWith("data-")
          || ["href", "src", "action"].includes(attribute.name)
        ) {
          attributes.push(`${attribute.name}=${attribute.value}`);
        }
      }
    }
    return { text: document.body.innerText, attributes };
  });
  assert.doesNotMatch(exposure.text, PRIVATE_UUID_PATTERN, `${label} rendered a private UUID in visible text`);
  assert.doesNotMatch(exposure.attributes.join("\n"), PRIVATE_UUID_PATTERN, `${label} rendered a private UUID in an exposed attribute`);
  assert.equal(exposure.text.includes(ADMIN_V2_FIXTURE_GAME_ID), false, `${label} rendered the game UUID`);
  assert.equal(exposure.text.includes(ADMIN_V2_FIXTURE_ADMIN_ID), false, `${label} rendered the administrator UUID`);
  assert.doesNotMatch(exposure.text, /\[object Object\]|\bNaN\b|\bInfinity\b/, `${label} rendered malformed optional metadata`);
  for (const fragment of RAW_DETAIL_FRAGMENTS) {
    assert.equal(
      exposure.text.toLowerCase().includes(fragment.toLowerCase()),
      false,
      `${label} rendered raw backend detail: ${fragment}`,
    );
  }
}

function expectedResourceConsoleError(entry) {
  return /^console: Failed to load resource: the server responded with a status of \d+ \(.+\)$/i.test(entry);
}

async function assertCleanRuntime(runtime, label, {
  expectedHttpStatuses = [],
  allowRedirectAbort = false,
} = {}) {
  const allowedStatuses = new Set(expectedHttpStatuses);
  const unexpectedHttp = runtime.httpFailures.filter((failure) => !allowedStatuses.has(failure.status));
  assert.deepEqual(unexpectedHttp, [], `${label} had unexpected HTTP failures`);
  const unexpectedConsole = runtime.errors.filter((entry) => {
    return !(allowedStatuses.size > 0 && expectedResourceConsoleError(entry));
  });
  assert.deepEqual(unexpectedConsole, [], `${label} emitted browser errors:\n${unexpectedConsole.join("\n")}`);
  const unexpectedFailed = allowRedirectAbort
    ? runtime.failedRequests.filter((entry) => !/net::ERR_ABORTED$/i.test(entry))
    : runtime.failedRequests;
  assert.deepEqual(unexpectedFailed, [], `${label} emitted failed requests:\n${unexpectedFailed.join("\n")}`);
  assert.deepEqual(
    runtime.securityWarnings,
    [],
    `${label} emitted CSP or Trusted Types warnings:\n${runtime.securityWarnings.join("\n")}`,
  );

  const typedResources = runtime.resources.filter(({ kind }) => kind !== "other");
  assert.ok(typedResources.some(({ kind }) => kind === "javascript"), `${label} loaded no JavaScript modules`);
  assert.ok(typedResources.some(({ kind }) => kind === "css"), `${label} loaded no CSS`);
  for (const resource of typedResources) {
    if (resource.status >= 400 && allowedStatuses.has(resource.status)) continue;
    assert.ok(resource.status >= 200 && resource.status < 400, `${label} failed to load ${resource.url}`);
    if (resource.kind === "javascript") {
      assert.match(resource.contentType, /^(?:application|text)\/javascript\b/i, `${label} invalid JavaScript MIME: ${resource.url}`);
    } else if (resource.kind === "css") {
      assert.match(resource.contentType, /^text\/css\b/i, `${label} invalid CSS MIME: ${resource.url}`);
    } else if (resource.kind === "image") {
      assert.match(resource.contentType, /^image\//i, `${label} invalid image MIME: ${resource.url}`);
    }
  }
}

function marketRequests(fixture, runId) {
  return fixture.requestsFor(runId).filter((request) => request.pathname.startsWith(`${MARKET_BASE_PATH}/`));
}

function assertSameOriginBffRequests(fixture, runId, label) {
  const requests = marketRequests(fixture, runId);
  assert.ok(requests.length > 0, `${label} did not reach the Market BFF`);
  for (const request of requests) {
    assert.equal(request.method, "GET", `${label} issued a non-read-only Market request`);
    assert.equal(request.authorization, "", `${label} sent a browser-readable bearer token`);
    assert.match(request.apikey, /^sb_publishable_/, `${label} omitted the publishable key`);
    assert.equal(request.deviceId, DEVICE_ID, `${label} omitted the device binding`);
    assert.equal(request.gameId, ADMIN_V2_FIXTURE_GAME_ID, `${label} omitted the selected game scope`);
    assert.equal(request.csrfToken, "", `${label} sent a mutation CSRF token on a read-only route`);
    assert.equal(request.idempotencyKey, "", `${label} sent a mutation idempotency key on a read-only route`);
  }
}

function assertInitialMarketRequests(fixture, runId, label) {
  const paths = marketRequests(fixture, runId)
    .map(({ pathname, search }) => `${pathname}${search || ""}`)
    .sort();
  assert.deepEqual(paths, [
    `${MARKET_ASSETS_PATH}?include=quotes`,
    `${MARKET_EVENTS_PATH}?status=active,recent`,
    `${MARKET_TRADES_PATH}?scope=all-players`,
  ].sort(), `${label} used the wrong initial Market reads`);
}

async function labelledControl(page, patterns, label) {
  for (const pattern of patterns) {
    const control = page.getByLabel(pattern).first();
    if (await control.count()) return control;
  }
  throw new Error(`${label} control was not rendered.`);
}

function instrumentRows(page) {
  return page.locator(".admin-market-route .admin-data-table__row");
}

async function assertResponsiveDirectory(page, viewport, label) {
  await assertNoHorizontalOverflow(page, label);
  const rows = instrumentRows(page);
  assert.equal(await rows.count(), 3, `${label} rendered the wrong instrument count`);
  const bodyText = await page.locator("body").innerText();
  assert.match(bodyText, /Northreach Intercontinental Renewable Infrastructure/);
  assert.match(bodyText, /한울 지역 공동체의 초소형 정밀 부품/);
  assert.match(bodyText, /9,876,543,210/);
  assert.match(bodyText, /Positive|Up|\+7\.39%/i, `${label} did not expose positive movement text`);
  assert.match(bodyText, /Negative|Down|-87\.5/i, `${label} did not expose negative movement text`);
  assert.match(bodyText, /Flat|Unchanged|0(?:\.0+)?%/i, `${label} did not expose flat movement text`);

  if (viewport.width <= 768) {
    const rowMetrics = await rows.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        scrollWidth: element.scrollWidth,
      };
    }));
    assert.ok(rowMetrics.every(({ left, right }) => left >= -1 && right <= viewport.width + 1), `${label} cards escaped the viewport`);
    assert.ok(rowMetrics.every(({ width, scrollWidth }) => scrollWidth <= width + 1), `${label} cards overflow internally`);
  }
}

async function assertShortNavigationRail(page, label) {
  const metrics = await page.evaluate(() => {
    const scroller = document.querySelector(".admin-navigation__scroller");
    const footer = document.querySelector(".admin-navigation__footer");
    const finalRoute = document.querySelector('.admin-navigation__link[data-route="logs"]');
    if (!scroller || !footer || !finalRoute) return null;
    const footerBefore = footer.getBoundingClientRect();
    const style = getComputedStyle(scroller);
    scroller.scrollTop = scroller.scrollHeight;
    const footerAfter = footer.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const finalRouteRect = finalRoute.getBoundingClientRect();
    return {
      overflowY: style.overflowY,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      atBottom: Math.abs(scroller.scrollTop + scroller.clientHeight - scroller.scrollHeight) <= 2,
      finalRouteVisible: finalRouteRect.top >= scrollerRect.top - 1
        && finalRouteRect.bottom <= scrollerRect.bottom + 1,
      footerStable: Math.abs(footerAfter.top - footerBefore.top) <= 1,
      footerVisible: footerAfter.top >= 0 && footerAfter.bottom <= window.innerHeight + 1,
    };
  });
  assert.ok(metrics, `${label} did not render the navigation rail`);
  assert.match(metrics.overflowY, /^(?:auto|scroll)$/i, `${label} rail did not retain bounded overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.scrollHeight > metrics.clientHeight + 1, `${label} rail did not remain vertically scrollable: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.atBottom, true, `${label} rail did not reach its final route: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.finalRouteVisible, true, `${label} final route remained unreachable: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.footerStable, true, `${label} game footer moved with the route scroller: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.footerVisible, true, `${label} game footer escaped the short viewport: ${JSON.stringify(metrics)}`);
}

async function detailOpener(page, ticker) {
  const row = instrumentRows(page).filter({ hasText: ticker }).first();
  await row.waitFor({ state: "visible" });
  const opener = row.getByRole("button", { name: /details|view|inspect/i }).first();
  if (!await opener.count()) throw new Error(`${ticker} did not expose an instrument-detail button.`);
  return opener;
}

async function openInstrumentDetail(page, ticker) {
  const opener = await detailOpener(page, ticker);
  await opener.focus();
  await opener.click();
  const dialog = page.locator('.admin-dialog[data-open="true"] [role="dialog"]').last();
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  await waitUntil(
    () => dialog.evaluate((element) => element.contains(document.activeElement)),
    `${ticker} detail drawer focus`,
  );
  return { opener, dialog };
}

async function closeAndAssertFocus(page, opener, dialog, label) {
  const focusables = dialog.locator([
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(","));
  const count = await focusables.count();
  assert.ok(count >= 1, `${label} drawer had no focusable control`);
  await focusables.last().focus();
  await page.keyboard.press("Tab");
  assert.equal(await focusables.first().evaluate((element) => document.activeElement === element), true, `${label} drawer did not trap forward Tab`);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await focusables.last().evaluate((element) => document.activeElement === element), true, `${label} drawer did not trap reverse Tab`);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await opener.evaluate((element) => document.activeElement === element), true, `${label} drawer did not restore focus`);
}

async function assertSessionRedirect(runtime, fixture, {
  label,
  reasons,
  expectedFailureCode = "",
  expectedHttpStatuses = [],
} = {}) {
  await runtime.page.waitForURL((url) => (
    url.pathname === "/"
      && url.searchParams.get("mode") === "admin"
      && reasons.includes(url.searchParams.get("reason"))
  ), { timeout: 10_000 });
  await runtime.page.getByRole("heading", { level: 1, name: "Administrator sign in", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(marketRequests(fixture, runtime.runId).length, 0, `${label} fetched protected Market data`);
  if (expectedFailureCode) {
    assert.ok(runtime.httpFailures.some(({ fixtureErrorCode }) => fixtureErrorCode === expectedFailureCode), `${label} did not exercise ${expectedFailureCode}`);
  }
  await assertNoPrivateIdsOrRawDetails(runtime.page, label);
  await assertCleanRuntime(runtime, label, { expectedHttpStatuses, allowRedirectAbort: true });
}

async function assertSafeMarketFailure(runtime, fixture, {
  label,
  message,
  retryable,
  status,
  expectedFailureCode,
  retryAfter = "",
} = {}) {
  await waitForMarketState(runtime.page, "failed");
  await waitForSessionGateRelease(runtime.page);
  const error = runtime.page.locator('.admin-market-route .admin-state[data-tone="error"]').first();
  await error.waitFor({ state: "visible" });
  assert.match(await error.innerText(), message, `${label} did not render its safe message`);
  assert.equal(
    await error.getByRole("button", { name: /try again|retry|refresh/i }).count() > 0,
    retryable,
    `${label} rendered the wrong retry affordance`,
  );
  const failures = runtime.httpFailures.filter(({ url }) => new URL(url).pathname.includes(`${MARKET_BASE_PATH}/`));
  assert.ok(failures.length > 0, `${label} did not exercise a failed Market BFF response`);
  assert.ok(failures.every((failure) => failure.status === status), `${label} received an unexpected response status`);
  assert.ok(
    failures.every((failure) => failure.fixtureErrorCode === expectedFailureCode),
    `${label} did not exercise ${expectedFailureCode}`,
  );
  if (retryAfter) {
    assert.ok(failures.some((failure) => failure.retryAfter === retryAfter), `${label} omitted Retry-After ${retryAfter}`);
    assert.match(await error.innerText(), new RegExp(`Wait ${retryAfter} seconds before retrying`, "i"));
  }
  await assertNoPrivateIdsOrRawDetails(runtime.page, label);
  await assertNoHorizontalOverflow(runtime.page, label);
  await assertCleanRuntime(runtime, label, { expectedHttpStatuses: [status] });
  assertSameOriginBffRequests(fixture, runtime.runId, label);
}

async function runCheck(name, task) {
  const startedAt = Date.now();
  try {
    const detail = await task();
    checks.push({ name, status: "passed", durationMs: Date.now() - startedAt, ...(detail || {}) });
  } catch (error) {
    checks.push({
      name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      failure: String(error?.stack || error?.message || error),
    });
  }
}

const fixture = await startAdminV2FixtureServer({ repositoryRoot: STATIC_ROOT });
let browser;

try {
  browser = await chromium.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    await runCheck(`ready-${viewport.width}x${viewport.height}`, async () => {
      const runtime = await createRuntime(browser, fixture, "ready", viewport);
      const label = `Market ready ${viewport.width}x${viewport.height}`;
      try {
        await waitForReady(runtime.page);
        await runtime.page.locator('[data-route="market"][aria-current="page"]').waitFor({ state: "attached" });
        const nativeBoundary = runtime.page.locator('.admin-route-boundary[data-route="market"][data-mode="source"]');
        assert.equal(await nativeBoundary.count(), 1, `${label} did not activate the source-owned Market boundary`);
        assert.equal(await nativeBoundary.locator(".admin-route-boundary__handoff").count(), 0, `${label} rendered a legacy or planned handoff`);
        await assertResponsiveDirectory(runtime.page, viewport, label);
        if (viewport.width === 1024 && viewport.height === 540) {
          await assertShortNavigationRail(runtime.page, label);
        }
        await assertNoPrivateIdsOrRawDetails(runtime.page, label);
        await capture(runtime.page, "ready", viewport);
        await assertCleanRuntime(runtime, label);
        assertSameOriginBffRequests(fixture, runtime.runId, label);
        assertInitialMarketRequests(fixture, runtime.runId, label);
        return { scenario: "ready", viewport: `${viewport.width}x${viewport.height}`, records: 3 };
      } finally {
        await runtime.close();
      }
    });
  }

  await runCheck("marketplace-separate-planned", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      const readsBefore = marketRequests(fixture, runtime.runId).length;
      await runtime.page.locator('.admin-navigation__link[data-route="marketplace"]').click();
      const boundary = runtime.page.locator('.admin-route-boundary[data-route="marketplace"][data-mode="planned"]');
      await boundary.waitFor({ state: "visible" });
      assert.match(await boundary.innerText(), /Marketplace is planned for Admin v2/i);
      assert.equal(await runtime.page.getByRole("heading", { level: 1, name: "Market Management", exact: true }).count(), 0);
      assert.equal(marketRequests(fixture, runtime.runId).length, readsBefore, "Marketplace navigation issued a financial-Market request");
      assert.equal(new URL(runtime.page.url()).hash, "#marketplace");
      await assertNoHorizontalOverflow(runtime.page, "Marketplace planned boundary");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Marketplace planned boundary");
      await assertCleanRuntime(runtime, "Marketplace planned boundary");
      return { market: "v2", marketplace: "planned", sharedRequests: 0 };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("reload-after-valid-session", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      assertInitialMarketRequests(fixture, runtime.runId, "Market before reload");
      await runtime.page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      await waitForReady(runtime.page);
      const requests = marketRequests(fixture, runtime.runId);
      for (const pathname of [MARKET_ASSETS_PATH, MARKET_EVENTS_PATH, MARKET_TRADES_PATH]) {
        assert.equal(
          requests.filter((request) => request.pathname === pathname).length,
          2,
          `Market reload did not repeat ${pathname}`,
        );
      }
      assert.equal(await instrumentRows(runtime.page).count(), 3);
      await assertNoHorizontalOverflow(runtime.page, "Market valid-session reload");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market valid-session reload");
      await assertCleanRuntime(runtime, "Market valid-session reload");
      assertSameOriginBffRequests(fixture, runtime.runId, "Market valid-session reload");
      return { scenario: "reload", authoritativeReadCount: requests.length };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("search-and-filters", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      const rows = instrumentRows(runtime.page);
      const search = await labelledControl(runtime.page, [/Search.*instrument/i, /Search.*Market/i], "Market search");
      await search.fill("한울 지역");
      assert.equal(await rows.count(), 1, "Korean Market search did not narrow the directory");
      assert.match(await rows.first().innerText(), /한울 지역 공동체/);
      await search.fill("");

      const sector = await labelledControl(runtime.page, [/^Sector$/i, /Sector filter/i], "Sector filter");
      await sector.selectOption("reserves");
      assert.equal(await rows.count(), 1, "Sector filter did not narrow the directory");
      assert.match(await rows.first().innerText(), /FLAT/);
      await sector.selectOption("all");
      await sector.selectOption({ label: "초정밀 순환 경제 연구" });
      assert.equal(await rows.count(), 1, "Unicode sector filter did not narrow the directory");
      assert.match(await rows.first().innerText(), /HANUL/);
      await sector.selectOption("all");

      const country = await labelledControl(runtime.page, [/^Country$/i], "Country filter");
      await country.selectOption("kr");
      assert.equal(await rows.count(), 2, "Country filter did not use the authoritative country code");
      await country.selectOption("all");

      const type = await labelledControl(runtime.page, [/Asset type/i, /^Type$/i], "Asset type filter");
      await type.selectOption("stock");
      assert.equal(await rows.count(), 3, "Asset-type filter dropped valid stock instruments");
      const status = await labelledControl(runtime.page, [/Listing marker/i, /Status/i], "Listing marker filter");
      await status.selectOption("active");
      assert.equal(await rows.count(), 3, "Active listing filter dropped active instruments");
      await status.selectOption("inactive");
      assert.equal(await rows.count(), 0, "Nonmatching listing filter retained active instruments");
      await runtime.page.getByRole("heading", { name: "No instruments match", exact: true }).waitFor({ state: "visible" });
      await status.selectOption("all");
      await assertNoHorizontalOverflow(runtime.page, "Market search and filters");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market search and filters");
      await assertCleanRuntime(runtime, "Market search and filters");
      return {
        scenario: "search-filter",
        searchableFields: ["symbol", "name", "sector", "type", "countryCode"],
        unicodeSectorFilter: true,
      };
    } finally {
      await runtime.close();
    }
  });

  for (const { scenario, count, state } of [
    { scenario: "market-empty", count: 0, state: "empty" },
    { scenario: "market-one", count: 1, state: "ready" },
    { scenario: "market-many", count: 52, state: "ready" },
  ]) {
    await runCheck(`cardinality-${scenario}`, async () => {
      const runtime = await createRuntime(browser, fixture, scenario);
      try {
        await waitForMarketState(runtime.page, state);
        await waitForSessionGateRelease(runtime.page);
        assert.equal(await instrumentRows(runtime.page).count(), count, `${scenario} rendered the wrong instrument count`);
        if (count === 0) {
          await runtime.page.getByRole("heading", { name: /No financial instruments|No instruments/i }).waitFor({ state: "visible" });
          await capture(runtime.page, "empty");
        }
        if (count >= 50) {
          assert.match(await runtime.page.locator("body").innerText(), /Classroom listed instrument 52/);
        }
        await assertNoHorizontalOverflow(runtime.page, scenario);
        await assertNoPrivateIdsOrRawDetails(runtime.page, scenario);
        await assertCleanRuntime(runtime, scenario);
        assertSameOriginBffRequests(fixture, runtime.runId, scenario);
        return { scenario, records: count };
      } finally {
        await runtime.close();
      }
    });
  }

  await runCheck("initial-loading", async () => {
    const runtime = await createRuntime(browser, fixture, "market-loading");
    try {
      await waitForMarketState(runtime.page, "initial-loading");
      await waitForSessionGateRelease(runtime.page);
      assert.ok(await runtime.page.locator(".admin-market-route .admin-skeleton").count() > 0, "Market loading state omitted its skeleton");
      assert.equal(await runtime.page.locator("text=NRCX").count(), 0, "Market data flashed before its reads resolved");
      await capture(runtime.page, "loading");
      await waitForReady(runtime.page, 15_000);
      await assertNoHorizontalOverflow(runtime.page, "Market loading");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market loading");
      await assertCleanRuntime(runtime, "Market loading");
      return { scenario: "market-loading", dataFlash: false };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("cancelled-first-load-reactivation", async () => {
    const runtime = await createRuntime(browser, fixture, "market-loading");
    try {
      await waitForMarketState(runtime.page, "initial-loading");
      await waitForSessionGateRelease(runtime.page);
      await waitUntil(
        () => marketRequests(fixture, runtime.runId).length === 3,
        "initial delayed Market reads",
      );
      await runtime.page.locator('.admin-navigation__link[data-route="overview"]').click();
      await runtime.page.locator('.admin-overview-route[data-admin-v2-state="ready"]')
        .waitFor({ state: "attached", timeout: 10_000 });
      await runtime.page.locator('.admin-navigation__link[data-route="market"]').click();
      await waitForReady(runtime.page, 15_000);

      const requests = marketRequests(fixture, runtime.runId);
      for (const pathname of [MARKET_ASSETS_PATH, MARKET_EVENTS_PATH, MARKET_TRADES_PATH]) {
        assert.equal(
          requests.filter((request) => request.pathname === pathname).length,
          2,
          `Market reactivation did not repeat ${pathname}`,
        );
      }
      await assertNoHorizontalOverflow(runtime.page, "Market canceled-load reactivation");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market canceled-load reactivation");
      await assertCleanRuntime(runtime, "Market canceled-load reactivation", { allowRedirectAbort: true });
      return { scenario: "cancel-reactivate", authoritativeReadCount: requests.length };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("failed-retry", async () => {
    const runtime = await createRuntime(browser, fixture, "market-failed");
    try {
      await waitForMarketState(runtime.page, "failed");
      await waitForSessionGateRelease(runtime.page);
      const error = runtime.page.locator('.admin-market-route .admin-state[data-tone="error"]');
      await error.waitFor({ state: "visible" });
      assert.match(await error.innerText(), /Market Management could not be loaded|temporarily unavailable/i);
      const retry = error.getByRole("button", { name: /retry|try again|refresh/i });
      assert.ok(await retry.count() > 0, "Retryable Market failure omitted Retry");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market failed state");
      await assertNoHorizontalOverflow(runtime.page, "Market failed state");
      await capture(runtime.page, "failed");
      await retry.click();
      await waitForReady(runtime.page);
      assert.equal(await instrumentRows(runtime.page).count(), 3, "Market retry did not resolve authoritative data");
      assert.equal(marketRequests(fixture, runtime.runId).filter(({ pathname }) => pathname === MARKET_ASSETS_PATH).length, 2);
      await assertCleanRuntime(runtime, "Market failed and retried");
      return { scenario: "market-failed", retryResolved: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("refreshing-to-stale", async () => {
    const runtime = await createRuntime(browser, fixture, "market-stale");
    try {
      await waitForReady(runtime.page);
      const refresh = runtime.page.locator('[data-market-action="refresh"]').first();
      if (!await refresh.count()) throw new Error("Market refresh action was not rendered.");
      await refresh.click();
      await waitForMarketState(runtime.page, "refreshing");
      assert.match(await runtime.page.locator("body").innerText(), /NRCX/, "Refreshing hid resolved Market data");
      await waitForMarketState(runtime.page, "stale");
      await runtime.page.locator(".admin-stale-state").waitFor({ state: "visible" });
      assert.match(await runtime.page.locator("body").innerText(), /NRCX/, "Stale state discarded resolved Market data");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market stale state");
      await assertNoHorizontalOverflow(runtime.page, "Market stale state");
      await capture(runtime.page, "stale");
      await assertCleanRuntime(runtime, "Market stale state");
      return { scenario: "market-stale", preservedResolvedData: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("permission-boundary", async () => {
    const runtime = await createRuntime(browser, fixture, "market-permission");
    try {
      const denied = runtime.page.locator('.admin-permission-boundary[data-state="denied"]');
      await denied.waitFor({ state: "visible" });
      await waitForSessionGateRelease(runtime.page);
      assert.match(await denied.innerText(), /Market access restricted/i);
      assert.equal(marketRequests(fixture, runtime.runId).length, 0, "Permission-denied Market route fetched protected data");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market permission boundary");
      await assertNoHorizontalOverflow(runtime.page, "Market permission boundary");
      await capture(runtime.page, "permission-denied");
      await assertCleanRuntime(runtime, "Market permission boundary");
      return { scenario: "market-permission", protectedReads: 0 };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("session-validation-no-data-flash", async () => {
    const runtime = await createRuntime(browser, fixture, "session-validating");
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(marketRequests(fixture, runtime.runId).length, 0, "Market data was requested before session validation");
      assert.equal(await runtime.page.locator("text=NRCX").count(), 0, "Market data flashed before session validation");
      await waitForReady(runtime.page, 15_000);
      assertInitialMarketRequests(fixture, runtime.runId, "Market validated session");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market validated session");
      await assertCleanRuntime(runtime, "Market validated session");
      return { scenario: "session-validating", dataFlash: false };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("direct-unauthenticated", async () => {
    const runtime = await createRuntime(browser, fixture, "unauthenticated", DEFAULT_VIEWPORT, {
      seedSession: false,
      includeGame: false,
    });
    try {
      await assertSessionRedirect(runtime, fixture, {
        label: "Direct unauthenticated Market navigation",
        reasons: ["session-required"],
        expectedFailureCode: "auth_required",
        expectedHttpStatuses: [401],
      });
      return { scenario: "unauthenticated", protectedReads: 0 };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("missing-selected-game", async () => {
    const runtime = await createRuntime(browser, fixture, "missing-game", DEFAULT_VIEWPORT, { includeGame: false });
    try {
      await assertSessionRedirect(runtime, fixture, {
        label: "Valid Market session without selected game",
        reasons: ["select-game"],
      });
      return { scenario: "missing-game", protectedReads: 0 };
    } finally {
      await runtime.close();
    }
  });

  for (const { scenario, code } of [
    { scenario: "expired", code: "session_expired" },
    { scenario: "revoked", code: "staff_session_revoked" },
    { scenario: "security-version-invalid", code: "staff_session_security_version_invalid" },
  ]) {
    await runCheck(`session-boundary-${scenario}`, async () => {
      const runtime = await createRuntime(browser, fixture, scenario);
      try {
        await assertSessionRedirect(runtime, fixture, {
          label: `${scenario} Market session`,
          reasons: ["session-expired", "session-required"],
          expectedFailureCode: code,
          expectedHttpStatuses: [401],
        });
        return { scenario, protectedReads: 0 };
      } finally {
        await runtime.close();
      }
    });
  }

  for (const failureScenario of [
    {
      scenario: "aal2-required",
      label: "Market AAL2-required response",
      message: /Additional administrator verification is required/i,
      retryable: false,
      status: 403,
      expectedFailureCode: "MFA_REQUIRED",
    },
    {
      scenario: "permission-403",
      label: "Market server permission-denied response",
      message: /do not have permission/i,
      retryable: false,
      status: 403,
      expectedFailureCode: "PERMISSION_DENIED",
    },
    {
      scenario: "rate-limited-429",
      label: "Market rate-limited response",
      message: /Too many requests were sent/i,
      retryable: true,
      status: 429,
      retryAfter: "7",
      expectedFailureCode: "RATE_LIMIT_EXCEEDED",
    },
    {
      scenario: "retryable-5xx",
      label: "Market retryable service response",
      message: /temporarily unavailable/i,
      retryable: true,
      status: 503,
      expectedFailureCode: "UPSTREAM_UNAVAILABLE",
    },
  ]) {
    await runCheck(`response-boundary-${failureScenario.scenario}`, async () => {
      const runtime = await createRuntime(browser, fixture, failureScenario.scenario);
      try {
        await assertSafeMarketFailure(runtime, fixture, failureScenario);
        return {
          scenario: failureScenario.scenario,
          responseStatus: failureScenario.status,
          retryAfter: failureScenario.retryAfter || null,
          safeError: true,
        };
      } finally {
        await runtime.close();
      }
    });
  }

  await runCheck("response-boundary-api-401", async () => {
    const runtime = await createRuntime(browser, fixture, "api-401");
    try {
      await waitForMarketState(runtime.page, "failed");
      const error = runtime.page.locator('.admin-market-route .admin-state[data-tone="error"]').first();
      await error.waitFor({ state: "visible" });
      assert.match(await error.innerText(), /administrator session has expired/i);
      assert.equal(await error.getByRole("button", { name: /retry|try again|refresh/i }).count(), 0);
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market 401 before redirect");
      await runtime.page.waitForURL((url) => (
        url.pathname === "/"
          && url.searchParams.get("mode") === "admin"
          && url.searchParams.get("reason") === "session-expired"
      ), { timeout: 10_000 });
      const failures = runtime.httpFailures.filter(({ url }) => new URL(url).pathname.includes(`${MARKET_BASE_PATH}/`));
      assert.ok(failures.length > 0, "Market 401 did not reach the protected BFF");
      assert.ok(failures.every(({ status }) => status === 401));
      assert.ok(failures.every(({ fixtureErrorCode }) => fixtureErrorCode === "SESSION_EXPIRED"));
      const redirectAborts = runtime.failedRequests.filter((entry) => /\?mode=admin&reason=session-expired net::ERR_ABORTED$/i.test(entry));
      assert.deepEqual(redirectAborts, [], "Concurrent Market 401 responses scheduled duplicate redirects");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market 401 after redirect");
      await assertCleanRuntime(runtime, "Market 401", { expectedHttpStatuses: [401], allowRedirectAbort: true });
      assertSameOriginBffRequests(fixture, runtime.runId, "Market 401");
      return { scenario: "api-401", responseStatus: 401, redirectAbortCount: 0, safeError: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("instrument-detail-history-focus", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      const { opener, dialog } = await openInstrumentDetail(runtime.page, "NRCX");
      await waitUntil(
        () => marketRequests(fixture, runtime.runId).filter(({ pathname }) => (
          pathname.startsWith(`${MARKET_ASSETS_PATH}/${ADMIN_V2_FIXTURE_MARKET_ASSET_ID}/`)
        )).length === 3,
        "NRCX profile, chart, and financial reads",
      );
      assert.match(await dialog.innerText(), /NRCX/);
      assert.match(await dialog.innerText(), /Open/i);
      assert.match(await dialog.innerText(), /High/i);
      assert.match(await dialog.innerText(), /Low/i);
      assert.match(await dialog.innerText(), /Market cap/i);
      assert.match(await runtime.page.locator(".admin-market-route__event-list").innerText(), /Magnitude 0\.72/i);
      assert.match(await runtime.page.locator(".admin-market-route__event-list").innerText(), /Volatility impact 0\.18/i);
      const chart = dialog.getByRole("img", { name: /Authoritative price history/i }).first();
      await chart.waitFor({ state: "visible" });
      assert.match(await chart.getAttribute("aria-labelledby") || "", /admin-market-chart/i);
      assert.match(await dialog.innerText(), /Latest tick volume/i);
      assert.match(await dialog.innerText(), /2,250,000/);
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market detail with history");
      await assertNoHorizontalOverflow(runtime.page, "Market detail with history");
      await capture(runtime.page, "instrument-detail");
      await chart.scrollIntoViewIfNeeded();
      await capture(runtime.page, "instrument-detail-history");
      await closeAndAssertFocus(runtime.page, opener, dialog, "Market detail");
      await assertCleanRuntime(runtime, "Market detail with history");
      return { scenario: "detail-history", detailReads: 3, focusRestored: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("instrument-detail-missing-history-fundamentals", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      const { opener, dialog } = await openInstrumentDetail(runtime.page, "HANUL");
      await waitUntil(
        () => marketRequests(fixture, runtime.runId).filter(({ pathname }) => (
          pathname.startsWith(`${MARKET_ASSETS_PATH}/${ADMIN_V2_FIXTURE_MARKET_NO_HISTORY_ASSET_ID}/`)
        )).length === 3,
        "HANUL profile, chart, and financial reads",
      );
      const detailText = await dialog.innerText();
      assert.match(detailText, /HANUL/);
      assert.match(detailText, /No (?:recorded )?price history|Price history (?:is )?unavailable|History unavailable/i);
      assert.match(detailText, /No fundamentals|Fundamentals unavailable|financial signals unavailable|Not available/i);
      assert.equal(await dialog.getByRole("img").count(), 0, "Missing history rendered a fabricated chart");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Market detail without history");
      await assertNoHorizontalOverflow(runtime.page, "Market detail without history");
      await dialog.locator(".admin-market-chart__empty").scrollIntoViewIfNeeded();
      await capture(runtime.page, "instrument-detail-no-history");
      await closeAndAssertFocus(runtime.page, opener, dialog, "Market no-history detail");
      await assertCleanRuntime(runtime, "Market detail without history");
      return { scenario: "detail-no-history", detailReads: 3, fabricatedRanges: false };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("malformed-optional-metadata", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      const { opener, dialog } = await openInstrumentDetail(runtime.page, "FLAT");
      await waitUntil(
        () => marketRequests(fixture, runtime.runId).filter(({ pathname }) => pathname.includes("/a3000000-0000-4000-8000-000000000003/")).length === 3,
        "FLAT malformed optional-field detail reads",
      );
      assert.match(await dialog.innerText(), /FLAT/);
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Malformed Market metadata");
      await assertNoHorizontalOverflow(runtime.page, "Malformed Market metadata");
      await closeAndAssertFocus(runtime.page, opener, dialog, "Malformed Market detail");
      await assertCleanRuntime(runtime, "Malformed Market metadata");
      return { scenario: "malformed-optionals", safeNormalization: true };
    } finally {
      await runtime.close();
    }
  });
} finally {
  await browser?.close();
  await fixture.close();
}

const failedChecks = checks.filter(({ status }) => status === "failed");
const result = {
  roadmapItem: "BETA-ADMIN-UI-V2-003",
  fixture: "local same-origin HttpOnly Admin BFF read-only financial-Market fixture",
  staticRoot: path.relative(REPOSITORY_ROOT, STATIC_ROOT) || ".",
  generatedAt: new Date().toISOString(),
  selectedGameUrlContract: "documented legacy exception; excluded from URL assertion and forbidden in rendered content",
  viewports: VIEWPORTS.map(({ width, height }) => `${width}x${height}`),
  checks,
  counts: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length,
  },
  evidence,
  resourceManifest: [...resourceManifest.values()].sort((left, right) => (
    left.pathname.localeCompare(right.pathname)
      || left.status - right.status
      || left.contentType.localeCompare(right.contentType)
  )),
  diagnostics,
  status: failedChecks.length === 0 ? "passed" : "failed",
};
writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);

if (failedChecks.length > 0) {
  const summary = failedChecks.map(({ name, failure }) => `${name}: ${failure}`).join("\n\n");
  throw new Error(`Admin v2 Market browser suite found ${failedChecks.length} failure(s):\n${summary}`);
}

process.stdout.write(
  `Admin v2 Market browser suite passed: ${checks.length} checks, ${evidence.length} screenshots, 0 failures.\n`,
);
