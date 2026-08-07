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
  ADMIN_V2_FIXTURE_LONG_GAME_NAME,
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
    || path.join(REPOSITORY_ROOT, "docs", "operations", "evidence", "admin-ui-v2-store"),
);
const RESULT_PATH = path.join(EVIDENCE_DIRECTORY, "admin-v2-store-browser-results.json");
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
const STORE_PATH = `/games/${ADMIN_V2_FIXTURE_GAME_ID}/store/items`;
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
  return `store-${state}-${viewport.width}x${viewport.height}.png`;
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

async function waitUntil(predicate, label, timeout = 5_000) {
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
      });
    }
  });
  return { errors, securityWarnings, failedRequests, httpFailures, resources };
}

async function createRuntime(browser, fixture, scenario, viewport = DEFAULT_VIEWPORT, {
  seedSession = true,
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
  await page.goto(
    `${fixture.origin}/admin/v2.html?game=${ADMIN_V2_FIXTURE_GAME_ID}#store`,
    { waitUntil: "domcontentloaded", timeout: 15_000 },
  );
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

async function waitForStoreState(page, state, timeout = 10_000) {
  await page.locator(`.admin-store-route[data-admin-v2-state="${state}"]`)
    .waitFor({ state: "attached", timeout });
}

async function waitForReady(page, timeout = 10_000) {
  await waitForStoreState(page, "ready", timeout);
  await waitForSessionGateRelease(page);
  await page.getByRole("heading", { level: 1, name: "Store Management", exact: true })
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

async function assertCleanRuntime(runtime, label, { expectedHttpStatuses = [] } = {}) {
  const allowedStatuses = new Set(expectedHttpStatuses);
  const unexpectedHttp = runtime.httpFailures.filter((failure) => !allowedStatuses.has(failure.status));
  assert.deepEqual(unexpectedHttp, [], `${label} had unexpected HTTP failures`);
  const unexpectedConsole = runtime.errors.filter((entry) => {
    return !(allowedStatuses.size > 0 && expectedResourceConsoleError(entry));
  });
  assert.deepEqual(unexpectedConsole, [], `${label} emitted browser errors:\n${unexpectedConsole.join("\n")}`);
  assert.deepEqual(runtime.failedRequests, [], `${label} emitted failed requests:\n${runtime.failedRequests.join("\n")}`);
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

function storeRequests(fixture, runId, method = null) {
  return fixture.requestsFor(runId).filter((request) => {
    const storeRequest = request.pathname === STORE_PATH || request.pathname.startsWith(`${STORE_PATH}/`);
    return storeRequest && (!method || request.method === method);
  });
}

function assertSameOriginBffRequests(fixture, runId, label) {
  const requests = storeRequests(fixture, runId);
  assert.ok(requests.length > 0, `${label} did not reach the Store BFF`);
  for (const request of requests) {
    assert.equal(request.authorization, "", `${label} sent a browser-readable bearer token`);
    assert.match(request.apikey, /^sb_publishable_/, `${label} omitted the publishable key`);
    assert.equal(request.deviceId, DEVICE_ID, `${label} omitted the device binding`);
    assert.equal(request.gameId, ADMIN_V2_FIXTURE_GAME_ID, `${label} omitted the selected game scope`);
  }
}

function assertMutationBoundary(request, method, label) {
  assert.equal(request.method, method, `${label} used the wrong method`);
  assert.equal(request.authorization, "", `${label} sent a browser-readable bearer token`);
  assert.equal(request.csrfToken, ADMIN_V2_FIXTURE_CSRF, `${label} omitted the CSRF token`);
  assert.match(request.idempotencyKey, /^admin\.store\.(?:create|update|archive)\.[0-9a-f-]{36}\.\d+$/i, `${label} omitted a valid idempotency key`);
  if (method !== "DELETE") {
    assert.match(request.contentType, /^application\/json\b/i, `${label} omitted the JSON content type`);
  }
}

async function assertReadyMedia(page, label) {
  const seeded = page.locator('.admin-store-route__media[data-media-kind="seeded"]').first();
  const placeholder = page.locator('.admin-store-route__media[data-media-kind="placeholder"]').first();
  await seeded.locator("img").waitFor({ state: "visible" });
  await placeholder.locator("img").waitFor({ state: "visible" });
  await page.waitForFunction(() => [...document.querySelectorAll(".admin-store-route__media img")]
    .every((image) => image.complete && image.naturalWidth > 0));

  assert.equal(await seeded.getAttribute("data-state"), "ready", `${label} seeded artwork did not load`);
  assert.equal(await placeholder.getAttribute("data-state"), "ready", `${label} placeholder did not load`);
  assert.match(
    await seeded.locator("img").getAttribute("src") || "",
    /^\/player-terminal\/assets\/images\/items\/store\/northreach\/sensor-board\.webp$/,
    `${label} did not use canonical seeded artwork`,
  );
  assert.equal(
    await placeholder.locator("img").getAttribute("src"),
    "/assets/store-item-placeholder.svg",
    `${label} did not use the branded graphical placeholder`,
  );
  assert.equal((await placeholder.textContent())?.trim(), "", `${label} used a text or glyph placeholder`);
  assert.equal(await placeholder.locator("svg").count(), 0, `${label} used an inline glyph placeholder`);
}

async function assertResponsiveCatalog(page, viewport, label) {
  await assertNoHorizontalOverflow(page, label);
  const mobile = viewport.width <= 900;
  const metrics = await page.locator('.admin-data-table__row[data-row-key="classroom-transit-pass"]')
    .evaluate((row) => {
      const copy = row.querySelector(".admin-store-route__item-copy");
      const scroller = row.closest(".admin-data-table__scroll");
      const rect = row.getBoundingClientRect();
      const scrollerRect = scroller?.getBoundingClientRect();
      return {
        rowDisplay: getComputedStyle(row).display,
        left: rect.left,
        right: rect.right,
        viewport: document.documentElement.clientWidth,
        scrollerLeft: scrollerRect?.left || 0,
        scrollerRight: scrollerRect?.right || 0,
        scrollerOverflow: scroller ? getComputedStyle(scroller).overflowX : "",
        copyClientWidth: copy?.clientWidth || 0,
        copyScrollWidth: copy?.scrollWidth || 0,
      };
    });
  if (mobile) {
    assert.ok(metrics.left >= -1 && metrics.right <= metrics.viewport + 1, `${label} Store card escaped the viewport`);
    assert.equal(metrics.rowDisplay, "grid", `${label} did not switch the Store table to cards`);
  } else {
    assert.ok(
      metrics.scrollerLeft >= -1 && metrics.scrollerRight <= metrics.viewport + 1,
      `${label} Store table scroller escaped the viewport`,
    );
    assert.match(metrics.scrollerOverflow, /auto|scroll/, `${label} desktop table has no contained horizontal scroller`);
  }
  assert.ok(metrics.copyClientWidth > 0, `${label} collapsed long Store copy`);
  assert.match(await page.locator("body").innerText(), /교실 지역 간 협력 연구/, `${label} omitted Korean Store content`);
}

async function openAddDialog(page) {
  const opener = page.locator('[data-store-action="add"]').first();
  await opener.click();
  const dialog = page.locator('[data-store-dialog="create"][data-open="true"]');
  await dialog.waitFor({ state: "visible" });
  return { opener, dialog };
}

async function fillValidCreateForm(page, name) {
  const dialog = page.locator('[data-store-dialog="create"][data-open="true"]');
  await dialog.getByLabel("Item name", { exact: false }).fill(name);
  await dialog.getByLabel("Description", { exact: true }).fill("Authoritative classroom Store inventory.");
  await dialog.getByLabel("Category", { exact: false }).fill("supplies");
  await dialog.getByLabel("Price", { exact: false }).fill("19.75");
  await dialog.getByLabel("Currency", { exact: false }).selectOption("NRC");
  await dialog.getByLabel("Available quantity", { exact: false }).fill("12");
  await dialog.getByLabel("Display order", { exact: false }).fill("40");
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
      const label = `Store ready ${viewport.width}x${viewport.height}`;
      try {
        await waitForReady(runtime.page);
        await assertReadyMedia(runtime.page, label);
        await assertResponsiveCatalog(runtime.page, viewport, label);
        await assertNoPrivateIdsOrRawDetails(runtime.page, label);
        await capture(runtime.page, "ready", viewport);
        if (viewport.width === 1280 && viewport.height === 720) {
          await runtime.page.locator(".admin-store-route__catalog").scrollIntoViewIfNeeded();
          await capture(runtime.page, "media-contract", viewport);
        }
        await assertCleanRuntime(runtime, label);
        assertSameOriginBffRequests(fixture, runtime.runId, label);
        assert.deepEqual(storeRequests(fixture, runtime.runId, "GET").map(({ pathname }) => pathname), [STORE_PATH]);
        return { scenario: "ready", viewport: `${viewport.width}x${viewport.height}` };
      } finally {
        await runtime.close();
      }
    });
  }

  await runCheck("search-and-filters", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      const rows = runtime.page.locator(".admin-data-table__row");
      assert.equal(await rows.count(), 3);
      await runtime.page.getByLabel("Search Store items", { exact: true }).fill("교실 지역 간");
      assert.equal(await rows.count(), 1, "Korean search did not narrow the catalog");
      assert.match(await rows.first().innerText(), /맞춤형 교통 이용권/);
      await runtime.page.getByLabel("Search Store items", { exact: true }).fill("");
      await runtime.page.getByLabel("Status and stock", { exact: true }).selectOption("archived");
      assert.equal(await rows.count(), 1, "Archived filter did not narrow the catalog");
      assert.match(await rows.first().innerText(), /Archived field kit/);
      await runtime.page.getByLabel("Status and stock", { exact: true }).selectOption("all");
      await runtime.page.getByLabel("Category", { exact: true }).selectOption("components");
      assert.equal(await rows.count(), 1, "Category filter did not narrow the catalog");
      assert.match(await rows.first().innerText(), /Northreach sensor board/);
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Store search and filters");
      await assertCleanRuntime(runtime, "Store search and filters");
      return { scenario: "search-filter", records: 3 };
    } finally {
      await runtime.close();
    }
  });

  for (const { scenario, count, state } of [
    { scenario: "store-empty", count: 0, state: "empty" },
    { scenario: "store-one", count: 1, state: "ready" },
    { scenario: "store-many", count: 52, state: "ready" },
  ]) {
    await runCheck(`cardinality-${scenario}`, async () => {
      const runtime = await createRuntime(browser, fixture, scenario);
      try {
        await waitForStoreState(runtime.page, state);
        await waitForSessionGateRelease(runtime.page);
        assert.equal(await runtime.page.locator(".admin-data-table__row").count(), count, `${scenario} rendered the wrong row count`);
        if (count === 0) {
          await runtime.page.getByRole("heading", { name: "No Store items yet", exact: true }).waitFor({ state: "visible" });
          await capture(runtime.page, "empty");
        }
        if (count >= 50) {
          assert.match(await runtime.page.locator("body").innerText(), /Classroom Store item 52/);
        }
        await assertNoHorizontalOverflow(runtime.page, scenario);
        await assertNoPrivateIdsOrRawDetails(runtime.page, scenario);
        await assertCleanRuntime(runtime, scenario);
        return { scenario, records: count };
      } finally {
        await runtime.close();
      }
    });
  }

  await runCheck("initial-loading", async () => {
    const runtime = await createRuntime(browser, fixture, "store-loading");
    try {
      await waitForStoreState(runtime.page, "initial-loading");
      await waitForSessionGateRelease(runtime.page);
      assert.ok(await runtime.page.locator(".admin-store-route .admin-skeleton").count() > 0, "Store loading state omitted its skeleton");
      await capture(runtime.page, "loading");
      await waitForReady(runtime.page, 15_000);
      await assertNoHorizontalOverflow(runtime.page, "Store loading");
      await assertCleanRuntime(runtime, "Store loading");
      return { scenario: "store-loading" };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("failed-state", async () => {
    const runtime = await createRuntime(browser, fixture, "store-failed");
    try {
      await waitForStoreState(runtime.page, "failed");
      await waitForSessionGateRelease(runtime.page);
      const error = runtime.page.locator('.admin-state[data-tone="error"]');
      await error.waitFor({ state: "visible" });
      assert.match(await error.innerText(), /Store Management could not be loaded/i);
      assert.ok(await error.getByRole("button", { name: /retry/i }).count() > 0, "Retryable Store failure omitted Retry");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Store failed state");
      await assertNoHorizontalOverflow(runtime.page, "Store failed state");
      await capture(runtime.page, "failed");
      await assertCleanRuntime(runtime, "Store failed state");
      return { scenario: "store-failed", safeError: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("refreshing-to-stale", async () => {
    const runtime = await createRuntime(browser, fixture, "store-stale");
    try {
      await waitForReady(runtime.page);
      await runtime.page.locator('[data-store-action="refresh"]').click();
      await waitForStoreState(runtime.page, "refreshing");
      assert.match(await runtime.page.locator("body").innerText(), /Northreach sensor board/, "Refreshing hid resolved Store data");
      await waitForStoreState(runtime.page, "stale");
      await runtime.page.locator(".admin-stale-state").waitFor({ state: "visible" });
      assert.match(await runtime.page.locator("body").innerText(), /Northreach sensor board/, "Stale state discarded resolved Store data");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Store stale state");
      await assertNoHorizontalOverflow(runtime.page, "Store stale state");
      await capture(runtime.page, "stale");
      await assertCleanRuntime(runtime, "Store stale state");
      return { scenario: "store-stale", preservedResolvedData: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("permission-boundary", async () => {
    const runtime = await createRuntime(browser, fixture, "store-permission");
    try {
      const denied = runtime.page.locator('.admin-permission-boundary[data-state="denied"]');
      await denied.waitFor({ state: "visible" });
      await waitForSessionGateRelease(runtime.page);
      assert.match(await denied.innerText(), /Store access restricted/i);
      assert.equal(storeRequests(fixture, runtime.runId).length, 0, "Permission-denied Store route fetched protected data");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Store permission boundary");
      await assertNoHorizontalOverflow(runtime.page, "Store permission boundary");
      await capture(runtime.page, "permission-denied");
      await assertCleanRuntime(runtime, "Store permission boundary");
      return { scenario: "store-permission", protectedReads: 0 };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("unauthenticated-boundary", async () => {
    const runtime = await createRuntime(browser, fixture, "unauthenticated", DEFAULT_VIEWPORT, { seedSession: false });
    try {
      await runtime.page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("mode") === "admin", { timeout: 10_000 });
      await runtime.page.getByRole("heading", { name: "Administrator sign in", exact: true }).waitFor({ state: "visible" });
      assert.equal(storeRequests(fixture, runtime.runId).length, 0, "Unauthenticated Store route fetched Admin data");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Unauthenticated Store boundary");
      await assertCleanRuntime(runtime, "Unauthenticated Store boundary", { expectedHttpStatuses: [401] });
      return { scenario: "unauthenticated", protectedReads: 0 };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("create-validation-focus-success", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      let { opener, dialog } = await openAddDialog(runtime.page);
      const name = runtime.page.getByLabel("Item name", { exact: false });
      await runtime.page.waitForFunction(() => {
        const active = document.activeElement;
        return active?.getAttribute("name") === "name"
          && Boolean(active.closest('[data-store-dialog="create"][data-open="true"]'));
      });

      const close = dialog.getByRole("button", { name: "Close dialog", exact: true });
      const submit = dialog.getByRole("button", { name: "Add item", exact: true });
      await submit.focus();
      await runtime.page.keyboard.press("Tab");
      assert.equal(await close.evaluate((element) => document.activeElement === element), true, "Create dialog did not trap forward Tab");
      await runtime.page.keyboard.press("Shift+Tab");
      assert.equal(await submit.evaluate((element) => document.activeElement === element), true, "Create dialog did not trap reverse Tab");
      await runtime.page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await opener.evaluate((element) => document.activeElement === element), true, "Create dialog did not restore focus");

      ({ opener, dialog } = await openAddDialog(runtime.page));
      await capture(runtime.page, "create-dialog");
      await dialog.getByRole("button", { name: "Add item", exact: true }).click();
      await dialog.locator(".admin-validation-summary").waitFor({ state: "visible" });
      assert.equal(await runtime.page.getByLabel("Item name", { exact: false }).getAttribute("aria-invalid"), "true");
      assert.equal(await runtime.page.getByLabel("Currency", { exact: false }).getAttribute("aria-invalid"), "true");
      await capture(runtime.page, "create-validation");
      await fillValidCreateForm(runtime.page, "Collaborative classroom supply crate");

      await runtime.page.evaluate(() => {
        const button = document.querySelector('[data-store-dialog="create"][data-open="true"] [data-dialog-action="save"]');
        button?.click();
        button?.click();
      });
      await dialog.waitFor({ state: "hidden", timeout: 10_000 });
      await runtime.page.getByText("Collaborative classroom supply crate", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      const posts = storeRequests(fixture, runtime.runId, "POST");
      assert.equal(posts.length, 1, "Create double-submit emitted duplicate commands");
      assertMutationBoundary(posts[0], "POST", "Store create");
      assert.ok(storeRequests(fixture, runtime.runId, "GET").length >= 2, "Create did not refetch authoritative Store data");
      await runtime.page.locator(".admin-toast", { hasText: "Store item added" }).waitFor({ state: "visible" });
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Store create success");
      await assertCleanRuntime(runtime, "Store create success");
      return { scenario: "create", mutationCount: 1, refetched: true, duplicateSuppressed: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("edit-and-archive", async () => {
    const runtime = await createRuntime(browser, fixture, "ready");
    try {
      await waitForReady(runtime.page);
      let row = runtime.page.locator('.admin-data-table__row[data-row-key="beta-nort-sensor-board"]');
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      const editDialog = runtime.page.locator('[data-store-dialog="edit"][data-open="true"]');
      await editDialog.waitFor({ state: "visible" });
      await capture(runtime.page, "edit-dialog");
      const name = runtime.page.getByLabel("Item name", { exact: false });
      assert.equal(await name.inputValue(), "Northreach sensor board");
      await name.fill("Updated Northreach sensor board");
      await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await editDialog.waitFor({ state: "hidden" });
      await runtime.page.getByText("Updated Northreach sensor board", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      const patches = storeRequests(fixture, runtime.runId, "PATCH");
      assert.equal(patches.length, 1);
      assertMutationBoundary(patches[0], "PATCH", "Store edit");

      row = runtime.page.locator('.admin-data-table__row[data-row-key="beta-nort-sensor-board"]');
      const archiveOpener = row.getByRole("button", { name: "Archive", exact: true });
      await archiveOpener.click();
      let archiveDialog = runtime.page.locator('[data-store-dialog="archive"][data-open="true"]');
      await archiveDialog.waitFor({ state: "visible" });
      assert.equal(
        await archiveDialog.getByRole("button", { name: "Archive item", exact: true }).evaluate((element) => document.activeElement === element),
        true,
        "Archive confirmation did not receive initial focus",
      );
      await capture(runtime.page, "archive-dialog");
      await archiveDialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await archiveDialog.waitFor({ state: "hidden" });
      assert.equal(await archiveOpener.evaluate((element) => document.activeElement === element), true, "Archive dialog did not restore focus");

      await archiveOpener.click();
      archiveDialog = runtime.page.locator('[data-store-dialog="archive"][data-open="true"]');
      await archiveDialog.getByRole("button", { name: "Archive item", exact: true }).click();
      await archiveDialog.waitFor({ state: "hidden" });
      row = runtime.page.locator('.admin-data-table__row[data-row-key="beta-nort-sensor-board"]');
      await row.getByText("Archived", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      const deletes = storeRequests(fixture, runtime.runId, "DELETE");
      assert.equal(deletes.length, 1);
      assertMutationBoundary(deletes[0], "DELETE", "Store archive");
      assert.ok(storeRequests(fixture, runtime.runId, "GET").length >= 3, "Edit/archive did not refetch authoritative Store data");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Store edit and archive");
      await assertNoHorizontalOverflow(runtime.page, "Store edit and archive");
      await assertCleanRuntime(runtime, "Store edit and archive");
      return { scenario: "edit-archive", patchCount: 1, deleteCount: 1, focusRestored: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("retryable-mutation-idempotency", async () => {
    const runtime = await createRuntime(browser, fixture, "store-mutation-failed");
    try {
      await waitForReady(runtime.page);
      const { dialog } = await openAddDialog(runtime.page);
      await fillValidCreateForm(runtime.page, "Retry-safe classroom supply");
      const submit = dialog.getByRole("button", { name: "Add item", exact: true });
      await submit.click();
      await dialog.locator(".admin-validation-summary").waitFor({ state: "visible" });
      assert.match(await dialog.innerText(), /temporarily unavailable/i);
      await capture(runtime.page, "mutation-retryable-error");
      await submit.click();
      await waitUntil(
        () => storeRequests(fixture, runtime.runId, "POST").length === 2,
        "the second retryable Store mutation request",
      );
      const posts = storeRequests(fixture, runtime.runId, "POST");
      assertMutationBoundary(posts[0], "POST", "Retryable Store create first attempt");
      assertMutationBoundary(posts[1], "POST", "Retryable Store create retry");
      assert.equal(posts[1].idempotencyKey, posts[0].idempotencyKey, "Retryable mutation minted a new idempotency key");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "Retryable Store mutation");
      await assertCleanRuntime(runtime, "Retryable Store mutation", { expectedHttpStatuses: [503] });
      return { scenario: "store-mutation-failed", attempts: 2, reusedIdempotencyKey: true };
    } finally {
      await runtime.close();
    }
  });

  await runCheck("aal2-mutation-boundary", async () => {
    const runtime = await createRuntime(browser, fixture, "store-mutation-aal2");
    try {
      await waitForReady(runtime.page);
      const { dialog } = await openAddDialog(runtime.page);
      await fillValidCreateForm(runtime.page, "AAL2 protected classroom supply");
      await dialog.getByRole("button", { name: "Add item", exact: true }).click();
      await dialog.locator(".admin-validation-summary").waitFor({ state: "visible" });
      assert.match(await dialog.innerText(), /additional administrator verification is required/i);
      assert.equal(storeRequests(fixture, runtime.runId, "POST").length, 1);
      assertMutationBoundary(storeRequests(fixture, runtime.runId, "POST")[0], "POST", "AAL2 Store create");
      await assertNoPrivateIdsOrRawDetails(runtime.page, "AAL2 Store mutation");
      await assertNoHorizontalOverflow(runtime.page, "AAL2 Store mutation");
      await capture(runtime.page, "mutation-aal2-required");
      await assertCleanRuntime(runtime, "AAL2 Store mutation", { expectedHttpStatuses: [403] });
      return { scenario: "store-mutation-aal2", safeError: true };
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
  roadmapItem: "BETA-ADMIN-UI-V2-002",
  fixture: "local same-origin HttpOnly Admin BFF Store fixture",
  staticRoot: path.relative(REPOSITORY_ROOT, STATIC_ROOT) || ".",
  generatedAt: new Date().toISOString(),
  selectedGameUrlContract: "documented legacy exception; excluded from private-DOM assertion",
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
  throw new Error(`Admin v2 Store browser suite found ${failedChecks.length} failure(s):\n${summary}`);
}

process.stdout.write(
  `Admin v2 Store browser suite passed: ${checks.length} checks, ${evidence.length} screenshots, 0 failures.\n`,
);
