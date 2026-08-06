import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  ADMIN_V2_FIXTURE_ADMIN_ID,
  ADMIN_V2_FIXTURE_GAME_ID,
  ADMIN_V2_FIXTURE_OPAQUE_GAME_ID,
  ADMIN_V2_FIXTURE_LONG_ADMIN_NAME,
  ADMIN_V2_FIXTURE_LONG_GAME_NAME,
  ADMIN_V2_FIXTURE_LONG_PLAYER_NAME,
  ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";
import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_NAVIGATION_ROUTES,
} from "../admin/v2/src/core/navigation-registry.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const STATIC_ROOT = path.resolve(
  REPOSITORY_ROOT,
  String(process.env.ADMIN_V2_STATIC_ROOT || ".").trim() || ".",
);
const EVIDENCE_DIRECTORY = path.resolve(
  process.env.ADMIN_V2_EVIDENCE_DIR
    || path.join(REPOSITORY_ROOT, "docs", "operations", "evidence", "admin-ui-v2-phase1"),
);
const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 1280, height: 720 }),
  Object.freeze({ width: 1024, height: 768 }),
  Object.freeze({ width: 768, height: 1024 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 320, height: 568 }),
]);
const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const SHORT_DESKTOP_VIEWPORT = Object.freeze({ width: 1024, height: 540 });
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const FORBIDDEN_UI_DETAILS = Object.freeze([
  "SELECT * FROM",
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "backend/supabase",
  "stack",
]);
const UUID_IN_URL_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const SECURITY_WARNING_PATTERN = /content security policy|trusted\s*types?|trustedtype|refused to (?:execute|load|apply|connect)/i;
const LEGACY_NAVIGATION_DESTINATIONS = Object.freeze(
  ADMIN_NAVIGATION_ROUTES.filter((route) => route.migration === "legacy"),
);
const PLANNED_NAVIGATION_DESTINATIONS = Object.freeze(
  ADMIN_NAVIGATION_ROUTES.filter((route) => route.migration === "planned"),
);
// Preserves the eight previously accepted UUID-free URL assertions unchanged as
// deferred debt while the taxonomy correction changes route dispositions.
const DEFERRED_UUID_ROUTE_ASSERTION_IDS = Object.freeze([
  "players",
  "attendance",
  "contracts",
  "store",
  "marketplace",
  "world-management",
  "settings",
  "logs",
]);
const DEFERRED_UUID_ROUTE_ASSERTIONS = Object.freeze(
  DEFERRED_UUID_ROUTE_ASSERTION_IDS.map((routeId) =>
    ADMIN_NAVIGATION_ROUTES.find((route) => route.id === routeId)),
);
const runtimeDiagnostics = [];

mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });

function screenshotName(state, viewport) {
  return `overview-${state}-${viewport.width}x${viewport.height}.png`;
}

function stateSelector(state) {
  return `[data-admin-v2-state="${state}"]`;
}

async function waitForState(page, state, timeout = 10_000) {
  await page.locator(stateSelector(state)).first().waitFor({ state: "attached", timeout });
}

async function waitForSessionGateRelease(page) {
  const gate = page.locator("#adminSessionGate");
  if (await gate.count()) {
    await gate.waitFor({ state: "detached", timeout: 10_000 });
  }
}

async function assertNoDocumentHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  assert.ok(
    metrics.documentWidth <= metrics.viewportWidth + 1,
    `${label} has document horizontal overflow: ${metrics.documentWidth}px / ${metrics.viewportWidth}px`,
  );
  assert.ok(
    metrics.bodyWidth <= metrics.viewportWidth + 1,
    `${label} body has horizontal overflow: ${metrics.bodyWidth}px / ${metrics.viewportWidth}px`,
  );
}

async function assertNoRawBackendDetails(page, label) {
  const bodyText = await page.locator("body").textContent() || "";
  const rawFragments = [ADMIN_V2_RAW_BACKEND_DIAGNOSTIC, ...FORBIDDEN_UI_DETAILS];
  for (const fragment of rawFragments) {
    assert.equal(
      bodyText.toLowerCase().includes(fragment.toLowerCase()),
      false,
      `${label} rendered forbidden backend detail: ${fragment}`,
    );
  }
  assert.equal(bodyText.includes(ADMIN_V2_FIXTURE_GAME_ID), false, `${label} rendered the internal game UUID`);
  assert.equal(bodyText.includes(ADMIN_V2_FIXTURE_ADMIN_ID), false, `${label} rendered the internal administrator UUID`);
}

async function assertNoRuntimeErrors(runtime, label, {
  allowExpectedHttpConsoleError = false,
  allowExpectedRedirectAborts = false,
} = {}) {
  const unexpectedErrors = allowExpectedHttpConsoleError && runtime.httpFailures.length > 0
    ? runtime.errors.filter((entry) => !/^console: Failed to load resource: the server responded with a status of \d+ \(.+\)$/i.test(entry))
    : runtime.errors;
  assert.deepEqual(unexpectedErrors, [], `${label} emitted browser errors:\n${unexpectedErrors.join("\n")}`);
  assert.deepEqual(
    runtime.securityWarnings,
    [],
    `${label} emitted CSP or Trusted Types warnings:\n${runtime.securityWarnings.join("\n")}`,
  );
  const unexpectedFailedRequests = allowExpectedRedirectAborts
    ? runtime.failedRequests.filter((entry) => !/\?mode=admin&reason=session-expired net::ERR_ABORTED$/i.test(entry))
    : runtime.failedRequests;
  assert.deepEqual(
    unexpectedFailedRequests,
    [],
    `${label} emitted failed browser requests:\n${unexpectedFailedRequests.join("\n")}`,
  );
  const missingStatic = runtime.httpFailures.filter(({ url }) => {
    const pathname = new URL(url).pathname;
    return !pathname.startsWith("/functions/v1/web-session-api/");
  });
  assert.deepEqual(missingStatic, [], `${label} emitted missing or failed static requests`);

  assert.ok(runtime.resourceContentTypes.some(({ kind }) => kind === "javascript"), `${label} loaded no JavaScript`);
  assert.ok(runtime.resourceContentTypes.some(({ kind }) => kind === "css"), `${label} loaded no CSS`);
  for (const resource of runtime.resourceContentTypes) {
    if (resource.kind === "javascript") {
      assert.match(resource.contentType, /^(?:application|text)\/javascript\b/i, `${label} served invalid JavaScript MIME for ${resource.url}`);
    } else {
      assert.match(resource.contentType, /^text\/css\b/i, `${label} served invalid CSS MIME for ${resource.url}`);
    }
  }
}

async function assertMeaningfulOverview(page, label) {
  const heading = page.getByRole("heading", { level: 1, name: "Overview", exact: true });
  await heading.waitFor({ state: "visible" });
  await page.locator('[data-route="overview"][aria-current="page"]').waitFor({ state: "attached" });
  assert.equal(await page.locator('[data-route="world-management"]').count(), 1, `${label} omitted World Management`);
  assert.equal(
    (await page.locator('[data-route="world-management"]').textContent())?.trim(),
    "World Management",
  );
  assert.equal(await page.locator('[data-route="market"]').count(), 1, `${label} omitted Market`);
  assert.equal(await page.locator('[data-route="marketplace"]').count(), 1, `${label} omitted Marketplace`);
  assert.equal(
    await page.locator('[data-route="market"]').evaluate((element) => element === document.querySelector('[data-route="marketplace"]')),
    false,
    `${label} conflated Market and Marketplace`,
  );

  const bodyText = await page.locator("body").textContent() || "";
  assert.ok(bodyText.includes(ADMIN_V2_FIXTURE_LONG_GAME_NAME), `${label} omitted the long game name`);
  assert.ok(bodyText.includes(ADMIN_V2_FIXTURE_LONG_ADMIN_NAME), `${label} omitted the long administrator name`);
  assert.ok(bodyText.includes(ADMIN_V2_FIXTURE_LONG_PLAYER_NAME), `${label} omitted the long player name`);
  assert.doesNotMatch(bodyText, /\[object (?:HTML|Object)/i, `${label} stringified a DOM or data object into UI copy`);
  assert.match(
    await page.locator(".admin-topbar__identity").getAttribute("aria-label") || "",
    new RegExp(ADMIN_V2_FIXTURE_LONG_ADMIN_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `${label} removed the long administrator's accessible name`,
  );
  await assertNoRawBackendDetails(page, label);
  await assertNoDocumentHorizontalOverflow(page, label);
}

async function verifyCanonicalNavigationLayout(page, label, { openMobile = false } = {}) {
  if (openMobile) {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.locator('.admin-shell[data-mobile-navigation-open="true"]').waitFor({ state: "attached" });
  }

  const actual = await page.locator(".admin-navigation__group").evaluateAll((sections) => sections.map((section) => {
    const heading = section.querySelector(".admin-navigation__group-label");
    const sectionRect = section.getBoundingClientRect();
    return {
      group: heading?.textContent?.trim() || "",
      top: sectionRect.top,
      bottom: sectionRect.bottom,
      routes: [...section.querySelectorAll(".admin-navigation__link")].map((link) => {
        const routeLabel = link.querySelector(".admin-navigation__label");
        return {
          id: link.getAttribute("data-route"),
          label: routeLabel?.textContent?.trim() || "",
          accessibleName: link.getAttribute("aria-label"),
          hasIcon: Boolean(link.querySelector("svg path")),
          labelClientWidth: routeLabel?.clientWidth || 0,
          labelScrollWidth: routeLabel?.scrollWidth || 0,
          labelClientHeight: routeLabel?.clientHeight || 0,
          labelScrollHeight: routeLabel?.scrollHeight || 0,
        };
      }),
    };
  }));
  const expected = ADMIN_NAVIGATION_GROUPS.map((group) => ({
    group: group.label,
    routes: group.routes.map((route) => ({
      id: route.id,
      label: route.label,
      accessibleName: route.label,
    })),
  }));
  assert.deepEqual(
    actual.map((group) => ({
      group: group.group,
      routes: group.routes.map(({ id, label: routeLabel, accessibleName }) => ({ id, label: routeLabel, accessibleName })),
    })),
    expected,
    `${label} rendered a non-canonical navigation taxonomy`,
  );
  for (let index = 1; index < actual.length; index += 1) {
    assert.ok(
      actual[index].top >= actual[index - 1].bottom - 1,
      `${label} navigation groups ${actual[index - 1].group} and ${actual[index].group} collide`,
    );
  }
  for (const group of actual) {
    for (const route of group.routes) {
      assert.equal(route.hasIcon, true, `${label} route ${route.id} has no icon`);
      assert.ok(route.labelClientWidth > 0 && route.labelClientHeight > 0, `${label} route ${route.id} has no visible label`);
      assert.ok(
        route.labelScrollWidth <= route.labelClientWidth + 1,
        `${label} route ${route.id} truncates horizontally`,
      );
      assert.ok(
        route.labelScrollHeight <= route.labelClientHeight + 1,
        `${label} route ${route.id} clips vertically`,
      );
    }
  }

  if (openMobile) {
    await page.keyboard.press("Escape");
    await page.locator('.admin-shell[data-mobile-navigation-open="false"]').waitFor({ state: "attached" });
  }
}

function browserErrorRecorder(page) {
  const errors = [];
  const securityWarnings = [];
  const failedRequests = [];
  const httpFailures = [];
  const resourceContentTypes = [];
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
    if (response.status() >= 400) {
      httpFailures.push({
        method: response.request().method(),
        status: response.status(),
        url,
        retryAfter: response.headers()["retry-after"] || "",
        fixtureErrorCode: response.headers()["x-fixture-error-code"] || "",
      });
    }
    if (/\.(?:m?js)$/i.test(pathname)) {
      resourceContentTypes.push({ kind: "javascript", url, contentType });
    } else if (/\.css$/i.test(pathname)) {
      resourceContentTypes.push({ kind: "css", url, contentType });
    }
  });
  return { errors, securityWarnings, failedRequests, httpFailures, resourceContentTypes };
}

async function createScenarioRuntime(
  browser,
  fixture,
  scenario,
  viewport = DEFAULT_VIEWPORT,
  {
    seedSession = true,
    selectedGameId = scenario === "legacy-handoff"
      ? ADMIN_V2_FIXTURE_OPAQUE_GAME_ID
      : ADMIN_V2_FIXTURE_GAME_ID,
    includeGame = true,
    includeFixtureQuery = true,
    hash = "overview",
  } = {},
) {
  const runId = randomUUID();
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  await context.addCookies([
    {
      name: "admin-v2-scenario",
      value: scenario,
      url: fixture.origin,
      sameSite: "Lax",
    },
    {
      name: "admin-v2-run",
      value: runId,
      url: fixture.origin,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(({ sessionKey, deviceKey, session, deviceId }) => {
    try {
      if (session) window.sessionStorage.setItem(sessionKey, JSON.stringify(session));
      else window.sessionStorage.removeItem(sessionKey);
      window.localStorage.setItem(deviceKey, deviceId);
    } catch (_error) {
      // The init script also runs for originless documents; the fixture document
      // gets the seeded state before any application script executes.
    }
  }, {
    sessionKey: SESSION_STORAGE_KEY,
    deviceKey: DEVICE_STORAGE_KEY,
    session: seedSession ? createAdminV2FixtureSession(scenario) : null,
    deviceId: DEVICE_ID,
  });

  const page = await context.newPage();
  const diagnostics = browserErrorRecorder(page);
  const query = new URLSearchParams();
  if (includeGame) query.set("game", selectedGameId);
  if (includeFixtureQuery) query.set("fixture", scenario);
  const suffix = query.size ? `?${query}` : "";
  const url = `${fixture.origin}/admin/v2.html${suffix}${hash ? `#${hash}` : ""}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  return {
    context,
    page,
    ...diagnostics,
    runId,
    scenario,
    selectedGameId,
    async close() {
      runtimeDiagnostics.push({
        scenario,
        runId,
        errors: [...diagnostics.errors],
        securityWarnings: [...diagnostics.securityWarnings],
        failedRequests: [...diagnostics.failedRequests],
        httpFailures: [...diagnostics.httpFailures],
        resourceContentTypes: [...new Map(diagnostics.resourceContentTypes.map((entry) => [entry.url, entry])).values()],
      });
      await context.close();
    },
  };
}

function assertNoBearerRequests(fixture, runId, label) {
  const requests = fixture.requestsFor(runId);
  assert.ok(requests.length > 0, `${label} did not reach the same-origin session or Admin BFF boundary`);
  for (const request of requests) {
    assert.equal(request.authorization, "", `${label} sent a browser-readable bearer token to ${request.pathname}`);
    assert.match(request.apikey, /^sb_publishable_/, `${label} omitted the publishable API key`);
    assert.match(request.deviceId, /^[0-9a-f-]{36}$/i, `${label} omitted the device binding`);
  }
}

async function assertBffReadBoundary(fixture, runId) {
  const overviewRequests = fixture.requestsFor(runId).filter((request) =>
    request.pathname === "/games"
      || request.pathname === "/notifications"
      || request.pathname.endsWith("/dashboard")
      || request.pathname.endsWith("/store/items")
  );
  assert.deepEqual(
    overviewRequests.map((request) => request.pathname).sort(),
    [
      "/games",
      `/games/${ADMIN_V2_FIXTURE_GAME_ID}/dashboard`,
      `/games/${ADMIN_V2_FIXTURE_GAME_ID}/store/items`,
      "/notifications",
    ].sort(),
  );
  for (const request of overviewRequests) {
    assert.equal(request.method, "GET");
    assert.match(request.apikey, /^sb_publishable_/);
    assert.match(request.deviceId, /^[0-9a-f-]{36}$/i);
    assert.equal(request.gameId, ADMIN_V2_FIXTURE_GAME_ID);
    assert.equal(request.authorization, "");
  }
}

async function verifyShortRail(page, { openMobile = false } = {}) {
  if (openMobile) {
    const toggle = page.getByRole("button", { name: "Open navigation", exact: true });
    await toggle.click();
    await page.locator('.admin-shell[data-mobile-navigation-open="true"]').waitFor({ state: "attached" });
  }
  const metrics = await page.evaluate(() => {
    const scroller = document.querySelector(".admin-navigation__scroller");
    const footer = document.querySelector(".admin-navigation__footer");
    const lastRoute = document.querySelector('[data-route="logs"]');
    if (!scroller || !footer || !lastRoute) return null;
    const footerBefore = footer.getBoundingClientRect();
    scroller.scrollTop = scroller.scrollHeight;
    const footerAfter = footer.getBoundingClientRect();
    const lastRouteRect = lastRoute.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return {
      scrollable: scroller.scrollHeight > scroller.clientHeight + 1,
      atBottom: Math.abs(scroller.scrollTop + scroller.clientHeight - scroller.scrollHeight) <= 2,
      footerStable: Math.abs(footerAfter.top - footerBefore.top) <= 1,
      footerVisible: footerAfter.top >= 0 && footerAfter.bottom <= window.innerHeight + 1,
      lastRouteVisible: lastRouteRect.top >= scrollerRect.top - 1 && lastRouteRect.bottom <= scrollerRect.bottom + 1,
      footerTop: Math.round(footerAfter.top * 100) / 100,
      footerBottom: Math.round(footerAfter.bottom * 100) / 100,
      viewportHeight: window.innerHeight,
      scrollerClientHeight: scroller.clientHeight,
      scrollerScrollHeight: scroller.scrollHeight,
    };
  });
  assert.ok(metrics, "Short viewport did not render the navigation rail");
  const detail = JSON.stringify(metrics);
  assert.equal(metrics.scrollable, true, `Navigation routes do not scroll independently at short viewport height: ${detail}`);
  assert.equal(metrics.atBottom, true, `Navigation route scroller did not reach its last item: ${detail}`);
  assert.equal(metrics.footerStable, true, `Persistent game selector moved with the route scroller: ${detail}`);
  assert.equal(metrics.footerVisible, true, `Persistent game selector is outside the short viewport: ${detail}`);
  assert.equal(metrics.lastRouteVisible, true, `Last navigation route is not reachable by scrolling: ${detail}`);
  if (openMobile) {
    await page.keyboard.press("Escape");
    await page.locator('.admin-shell[data-mobile-navigation-open="false"]').waitFor({ state: "attached" });
  }
}

async function verifyNavigationKeyboardAndCollapsedLabels(page) {
  const overview = page.locator('.admin-navigation__link[data-route="overview"]');
  await overview.focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-route")),
    "players",
    "ArrowDown did not move focus to the next Admin route",
  );
  await page.keyboard.press("End");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-route")),
    "logs",
    "End did not move focus to the final Admin route",
  );
  await page.keyboard.press("Home");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-route")),
    "overview",
    "Home did not restore focus to Overview",
  );

  const collapse = page.getByRole("button", { name: "Collapse navigation", exact: true });
  await collapse.click();
  await page.locator('.admin-navigation[data-collapsed="true"]').waitFor({ state: "attached" });
  assert.equal(await overview.getAttribute("aria-label"), "Overview");
  assert.equal(
    await page.locator('.admin-navigation__link[data-route="world-management"]').getAttribute("aria-label"),
    "World Management",
  );
  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
}

async function verifyDialogFocusLifecycle(page) {
  const opener = page.getByRole("button", { name: /open notifications/i }).first();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog").last();
  await dialog.waitFor({ state: "visible" });
  assert.equal(await page.locator("#adminPreview").evaluate((element) => element.inert), true);
  assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);

  const focusLoop = await dialog.evaluate((element) => {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type=hidden])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const candidates = [...element.querySelectorAll(selector)].filter((candidate) => {
      const style = getComputedStyle(candidate);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    candidates.at(-1)?.focus();
    return {
      count: candidates.length,
      firstLabel: candidates[0]?.getAttribute("aria-label") || candidates[0]?.textContent?.trim() || "",
      lastLabel: candidates.at(-1)?.getAttribute("aria-label") || candidates.at(-1)?.textContent?.trim() || "",
    };
  });
  assert.ok(focusLoop.count >= 1, "Notification drawer has no focusable controls");
  await page.keyboard.press("Tab");
  assert.equal(
    await dialog.evaluate((element) => {
      const candidate = element.querySelector("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
      return document.activeElement === candidate;
    }),
    true,
    `Tab did not loop from ${focusLoop.lastLabel} to ${focusLoop.firstLabel}`,
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await dialog.evaluate((element) => {
      const candidates = [...element.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter((candidate) => {
          const style = getComputedStyle(candidate);
          return style.display !== "none" && style.visibility !== "hidden";
        });
      return document.activeElement === candidates.at(-1);
    }),
    true,
    `Shift+Tab did not loop from ${focusLoop.firstLabel} to ${focusLoop.lastLabel}`,
  );

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.locator("#adminPreview").evaluate((element) => element.inert), false);
  assert.equal(await opener.evaluate((element) => document.activeElement === element), true, "Dialog did not restore opener focus");
}

async function verifyWorldPlannedBoundary(page) {
  await page.locator('.admin-navigation__link[data-route="world-management"]').click();
  await page.locator('.admin-navigation__link[data-route="world-management"][aria-current="page"]')
    .waitFor({ state: "attached" });
  const boundary = page.locator('.admin-route-boundary[data-route="world-management"][data-mode="planned"]');
  await boundary
    .waitFor({ state: "visible" });
  assert.match(page.url(), /\/admin\/v2\.html\?/i, "World Management bypassed the explicit v2 boundary");
  assert.match(await boundary.innerText(), /World Management is planned for Admin v2/i);
  assert.match(await boundary.innerText(), /No unrelated legacy page will be opened/i);
  assert.equal(await boundary.getByRole("link").count(), 0, "World Management exposed a legacy destination");
  const group = page.locator('.admin-navigation__link[data-route="world-management"]')
    .locator("xpath=ancestor::section[contains(@class, 'admin-navigation__group')]");
  assert.equal(
    (await group.getByRole("heading", { name: "World", exact: true }).textContent())?.trim(),
    "World",
    "World Management is not a first-class item in the World navigation group",
  );
}

function adminDataRequests(fixture, runId) {
  return fixture.requestsFor(runId).filter((request) =>
    request.pathname === "/games"
      || request.pathname === "/notifications"
      || request.pathname.endsWith("/dashboard")
      || request.pathname.endsWith("/store/items")
  );
}

function assertBrowserUrlHasNoInternalId(url, label) {
  assert.doesNotMatch(url, UUID_IN_URL_PATTERN, `${label} exposed an internal UUID in the browser URL`);
  assert.equal(url.includes(ADMIN_V2_FIXTURE_ADMIN_ID), false, `${label} exposed the administrator UUID in the browser URL`);
  assert.equal(url.includes(ADMIN_V2_FIXTURE_GAME_ID), false, `${label} exposed the fixture game UUID in the browser URL`);
}

async function verifyLegacyHandoffContract(browser, fixture, destination) {
  const runtime = await createScenarioRuntime(browser, fixture, "legacy-handoff");
  const label = `${destination.label} legacy handoff`;
  const mainFrameNavigations = [];
  runtime.page.on("framenavigated", (frame) => {
    if (frame === runtime.page.mainFrame()) mainFrameNavigations.push(frame.url());
  });
  try {
    await waitForState(runtime.page, "ready");
    await waitForSessionGateRelease(runtime.page);

    const navigationLink = runtime.page.locator(`.admin-navigation__link[data-route="${destination.id}"]`);
    await navigationLink.waitFor({ state: "visible" });
    assert.equal((await navigationLink.textContent())?.trim(), destination.label, `${label} changed its visible destination label`);
    assert.equal(await navigationLink.getAttribute("aria-label"), destination.label, `${label} changed its accessible label`);

    if (destination.id === "world-management") {
      const group = navigationLink.locator("xpath=ancestor::section[contains(@class, 'admin-navigation__group')]");
      assert.equal(
        (await group.getByRole("heading", { name: "World", exact: true }).textContent())?.trim(),
        "World",
        "World Management is not a first-class item in the World navigation group",
      );
    }

    const startingHistoryLength = await runtime.page.evaluate(() => history.length);
    await navigationLink.click();
    const boundary = runtime.page.locator(`.admin-route-boundary[data-route="${destination.id}"][data-mode="legacy"]`);
    await boundary.waitFor({ state: "visible" });
    await runtime.page.locator(`.admin-navigation__link[data-route="${destination.id}"][aria-current="page"]`)
      .waitFor({ state: "attached" });
    assert.equal(
      await navigationLink.evaluate((element) => document.activeElement === element),
      true,
      `${label} did not retain focus on the activated navigation item`,
    );
    assert.match(await boundary.innerText(), new RegExp(`${destination.label} remains in the existing Admin`, "i"));
    assert.match(await boundary.innerText(), /Phase 1 migrates only Overview/i, `${label} did not clearly identify its legacy status`);

    const v2BoundaryUrl = runtime.page.url();
    const parsedBoundaryUrl = new URL(v2BoundaryUrl);
    assert.equal(parsedBoundaryUrl.pathname, "/admin/v2.html", `${label} bypassed the v2 boundary`);
    assert.equal(parsedBoundaryUrl.searchParams.get("game"), ADMIN_V2_FIXTURE_OPAQUE_GAME_ID, `${label} lost the opaque game context`);
    assert.equal(parsedBoundaryUrl.hash, `#${destination.id}`);
    assertBrowserUrlHasNoInternalId(v2BoundaryUrl, `${label} v2 boundary`);
    assert.equal(
      await runtime.page.evaluate((initialLength) => history.length >= initialLength + 1, startingHistoryLength),
      true,
      `${label} did not add a browser-history entry for route activation`,
    );

    const handoff = runtime.page.getByRole("link", { name: "Open existing Admin", exact: true });
    await handoff.focus();
    assert.equal(await handoff.evaluate((element) => document.activeElement === element), true, `${label} action cannot receive focus`);
    const handoffUrl = new URL(await handoff.getAttribute("href"), runtime.page.url());
    assert.equal(handoffUrl.pathname, "/admin/");
    assert.deepEqual([...handoffUrl.searchParams], [["game", ADMIN_V2_FIXTURE_OPAQUE_GAME_ID]]);
    assert.equal(handoffUrl.hash, `#${destination.legacyDestination.fragment}`);
    assertBrowserUrlHasNoInternalId(handoffUrl.href, `${label} target`);

    await runtime.page.goBack({ waitUntil: "domcontentloaded" });
    await runtime.page.locator('.admin-route-boundary[data-route="overview"][data-mode="source"]')
      .waitFor({ state: "visible" });
    assert.equal(new URL(runtime.page.url()).hash, "#overview", `${label} history Back did not return to Overview`);
    await runtime.page.goForward({ waitUntil: "domcontentloaded" });
    await boundary.waitFor({ state: "visible" });
    assert.equal(new URL(runtime.page.url()).hash, `#${destination.id}`, `${label} history Forward did not restore the boundary`);

    const navigationsBeforeHandoff = mainFrameNavigations.length;
    await Promise.all([
      runtime.page.waitForURL((url) => url.pathname === "/admin/" && url.hash === `#${destination.legacyDestination.fragment}`),
      runtime.page.getByRole("link", { name: "Open existing Admin", exact: true }).click(),
    ]);
    await runtime.page.getByRole("heading", { level: 1, name: "Existing Admin fixture target" }).waitFor({ state: "visible" });
    const legacyUrl = runtime.page.url();
    assertBrowserUrlHasNoInternalId(legacyUrl, `${label} actual navigation`);
    assert.equal(new URL(legacyUrl).searchParams.get("game"), ADMIN_V2_FIXTURE_OPAQUE_GAME_ID);
    await runtime.page.waitForTimeout(100);
    assert.equal(runtime.page.url(), legacyUrl, `${label} entered a navigation loop after the handoff`);
    assert.equal(
      mainFrameNavigations.slice(navigationsBeforeHandoff).filter((url) => new URL(url).pathname === "/admin/").length,
      1,
      `${label} navigated to the legacy destination more than once`,
    );

    await runtime.page.goBack({ waitUntil: "domcontentloaded" });
    await runtime.page.locator(`.admin-route-boundary[data-route="${destination.id}"][data-mode="legacy"]`)
      .waitFor({ state: "visible" });
    assert.equal(new URL(runtime.page.url()).pathname, "/admin/v2.html", `${label} could not return through browser history`);
    await assertNoRawBackendDetails(runtime.page, label);
    await assertNoRuntimeErrors(runtime, label);
    assertNoBearerRequests(fixture, runtime.runId, label);
  } finally {
    await runtime.close();
  }
}

async function verifyPlannedBoundaryContract(browser, fixture, destination) {
  const runtime = await createScenarioRuntime(browser, fixture, "legacy-handoff");
  const label = `${destination.label} planned boundary`;
  const mainFrameNavigations = [];
  runtime.page.on("framenavigated", (frame) => {
    if (frame === runtime.page.mainFrame()) mainFrameNavigations.push(frame.url());
  });
  try {
    await waitForState(runtime.page, "ready");
    await waitForSessionGateRelease(runtime.page);

    const navigationLink = runtime.page.locator(`.admin-navigation__link[data-route="${destination.id}"]`);
    await navigationLink.waitFor({ state: "visible" });
    assert.equal((await navigationLink.textContent())?.trim(), destination.label);
    assert.equal(await navigationLink.getAttribute("aria-label"), destination.label);

    const startingHistoryLength = await runtime.page.evaluate(() => history.length);
    await navigationLink.click();
    const boundary = runtime.page.locator(`.admin-route-boundary[data-route="${destination.id}"][data-mode="planned"]`);
    await boundary.waitFor({ state: "visible" });
    await runtime.page.locator(`.admin-navigation__link[data-route="${destination.id}"][aria-current="page"]`)
      .waitFor({ state: "attached" });
    assert.equal(
      await navigationLink.evaluate((element) => document.activeElement === element),
      true,
      `${label} did not retain focus on the activated navigation item`,
    );
    assert.match(await boundary.innerText(), new RegExp(`${destination.label} is planned for Admin v2`, "i"));
    assert.match(await boundary.innerText(), /part of the Admin product/i);
    assert.match(await boundary.innerText(), /No unrelated legacy page will be opened/i);
    assert.equal(await boundary.getByRole("link").count(), 0, `${label} exposed an unrelated legacy link`);
    assert.equal(await boundary.getByRole("button").count(), 0, `${label} exposed a non-functional action`);

    const plannedUrl = new URL(runtime.page.url());
    assert.equal(plannedUrl.pathname, "/admin/v2.html");
    assert.equal(plannedUrl.searchParams.get("game"), ADMIN_V2_FIXTURE_OPAQUE_GAME_ID);
    assert.equal(plannedUrl.hash, `#${destination.id}`);
    assertBrowserUrlHasNoInternalId(plannedUrl.href, label);
    assert.equal(
      await runtime.page.evaluate((initialLength) => history.length >= initialLength + 1, startingHistoryLength),
      true,
      `${label} did not add a browser-history entry`,
    );

    await runtime.page.waitForTimeout(100);
    assert.equal(new URL(runtime.page.url()).pathname, "/admin/v2.html", `${label} entered a navigation loop`);
    assert.equal(
      mainFrameNavigations.some((url) => new URL(url).pathname === "/admin/"),
      false,
      `${label} navigated to the legacy Admin`,
    );

    await runtime.page.goBack({ waitUntil: "domcontentloaded" });
    await runtime.page.locator('.admin-route-boundary[data-route="overview"][data-mode="source"]')
      .waitFor({ state: "visible" });
    assert.equal(new URL(runtime.page.url()).hash, "#overview", `${label} history Back did not return to Overview`);
    await runtime.page.goForward({ waitUntil: "domcontentloaded" });
    await boundary.waitFor({ state: "visible" });
    assert.equal(new URL(runtime.page.url()).hash, `#${destination.id}`, `${label} history Forward did not restore the boundary`);
    await assertNoRawBackendDetails(runtime.page, label);
    await assertNoRuntimeErrors(runtime, label);
    assertNoBearerRequests(fixture, runtime.runId, label);
  } finally {
    await runtime.close();
  }
}

async function auditAuthoritativeUuidHandoffExposure(browser, fixture) {
  const runtime = await createScenarioRuntime(browser, fixture, "ready");
  const findings = [];
  try {
    await waitForState(runtime.page, "ready");
    await waitForSessionGateRelease(runtime.page);
    for (const destination of DEFERRED_UUID_ROUTE_ASSERTIONS) {
      await runtime.page.locator(`.admin-navigation__link[data-route="${destination.id}"]`).click();
      await runtime.page.locator(`.admin-route-boundary[data-route="${destination.id}"][data-mode="${destination.migration}"]`)
        .waitFor({ state: "visible" });
      const browserUrl = runtime.page.url();
      const handoffHref = destination.migration === "legacy"
        ? await runtime.page.getByRole("link", { name: "Open existing Admin", exact: true }).getAttribute("href")
        : null;
      const handoffUrl = handoffHref ? new URL(handoffHref, browserUrl).href : null;
      const internalIdAbsent = !UUID_IN_URL_PATTERN.test(browserUrl)
        && (!handoffUrl || !UUID_IN_URL_PATTERN.test(handoffUrl));
      findings.push({
        scenario: "legacy-route-internal-id-contract",
        classification: "expected-legacy-contract-exception",
        debtStatus: "deferred-pending-public-game-handoff-contract",
        destination: destination.id,
        label: destination.label,
        ownership: destination.migration,
        selectedGame: "authoritative-current-uuid",
        assertion: "No internal UUID appears in the v2 boundary URL or an available legacy handoff URL.",
        assertionPassed: internalIdAbsent,
        internalIdAbsent,
        browserUrl: new URL(browserUrl).pathname + new URL(browserUrl).search + new URL(browserUrl).hash,
        handoffUrl: handoffUrl
          ? new URL(handoffUrl).pathname + new URL(handoffUrl).search + new URL(handoffUrl).hash
          : null,
        status: internalIdAbsent ? "passed" : "expected-exception",
        failure: internalIdAbsent
          ? null
          : "The authoritative selected-game contract is an internal UUID and is preserved in the v2 route URL and any available legacy handoff URL.",
      });
    }
    await assertNoRawBackendDetails(runtime.page, "authoritative UUID handoff audit");
    await assertNoRuntimeErrors(runtime, "authoritative UUID handoff audit");
    assertNoBearerRequests(fixture, runtime.runId, "authoritative UUID handoff audit");
    return findings;
  } finally {
    await runtime.close();
  }
}

async function assertRedirectedSessionBoundary(runtime, fixture, {
  label,
  expectedReasons,
  expectedFailureCode = "",
  requiresBoundaryRequest = true,
} = {}) {
  await runtime.page.waitForURL((url) =>
    url.pathname === "/"
      && url.searchParams.get("mode") === "admin"
      && expectedReasons.includes(url.searchParams.get("reason")),
  { timeout: 10_000 });
  await runtime.page.getByRole("heading", { level: 1, name: "Administrator sign in" }).waitFor({ state: "visible" });
  const finalUrl = new URL(runtime.page.url());
  assert.ok(expectedReasons.includes(finalUrl.searchParams.get("reason")), `${label} used an unexpected redirect reason`);
  assert.equal(adminDataRequests(fixture, runtime.runId).length, 0, `${label} fetched Admin data before session validation`);
  if (expectedFailureCode) {
    assert.ok(
      runtime.httpFailures.some((failure) => failure.fixtureErrorCode === expectedFailureCode),
      `${label} did not exercise ${expectedFailureCode}`,
    );
  }
  await assertNoRawBackendDetails(runtime.page, label);
  await assertNoRuntimeErrors(runtime, label, { allowExpectedHttpConsoleError: true });
  if (requiresBoundaryRequest) {
    assertNoBearerRequests(fixture, runtime.runId, label);
  } else {
    assert.ok(
      fixture.requestsFor(runtime.runId).every((request) => request.authorization === ""),
      `${label} sent a browser-readable bearer token`,
    );
  }
}

async function assertSafeOverviewFailure(runtime, {
  label,
  message,
  retryable,
  status,
  expectedFailureCode,
  retryAfter = "",
} = {}) {
  await waitForState(runtime.page, "failed");
  await waitForSessionGateRelease(runtime.page);
  const error = runtime.page.locator('.admin-state[data-tone="error"]').first();
  await error.waitFor({ state: "visible" });
  assert.match(await error.innerText(), message, `${label} did not render the expected safe error message`);
  assert.equal(
    await error.getByRole("button", { name: /try again|retry|refresh/i }).count() > 0,
    retryable,
    `${label} rendered the wrong retry affordance`,
  );
  const failures = runtime.httpFailures.filter(({ url }) => new URL(url).pathname.includes("/functions/v1/web-session-api/proxy/"));
  assert.ok(failures.length > 0, `${label} did not exercise a failed same-origin BFF response`);
  assert.ok(failures.every((failure) => failure.status === status), `${label} received an unexpected response status`);
  assert.ok(
    failures.every((failure) => failure.fixtureErrorCode === expectedFailureCode),
    `${label} did not exercise ${expectedFailureCode}`,
  );
  if (retryAfter) {
    assert.ok(failures.some((failure) => failure.retryAfter === retryAfter), `${label} omitted Retry-After ${retryAfter}`);
    assert.match(await error.innerText(), new RegExp(`Wait ${retryAfter} seconds before retrying`, "i"), `${label} did not expose safe retry timing`);
  }
  await assertNoRawBackendDetails(runtime.page, label);
  await assertNoRuntimeErrors(runtime, label, { allowExpectedHttpConsoleError: true });
}

async function capture(page, filename) {
  const destination = path.join(EVIDENCE_DIRECTORY, filename);
  await page.screenshot({ path: destination, fullPage: false, animations: "disabled" });
  return destination;
}

const fixture = await startAdminV2FixtureServer({ repositoryRoot: STATIC_ROOT });
let browser;
const evidence = [];
const checks = [];

try {
  browser = await chromium.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    const runtime = await createScenarioRuntime(browser, fixture, "ready", viewport);
    const label = `ready ${viewport.width}x${viewport.height}`;
    try {
      await waitForState(runtime.page, "ready");
      await waitForSessionGateRelease(runtime.page);
      await assertMeaningfulOverview(runtime.page, label);
      await verifyCanonicalNavigationLayout(runtime.page, label, { openMobile: viewport.width <= 760 });
      if (viewport.width === 320 && viewport.height === 568) {
        await verifyShortRail(runtime.page, { openMobile: true });
      }
      const destination = await capture(runtime.page, screenshotName("ready", viewport));
      evidence.push(path.relative(REPOSITORY_ROOT, destination));
      await assertNoRuntimeErrors(runtime, label);
      await assertBffReadBoundary(fixture, runtime.runId);
      checks.push({ scenario: "ready", viewport: `${viewport.width}x${viewport.height}`, status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "ready", SHORT_DESKTOP_VIEWPORT);
    try {
      await waitForState(runtime.page, "ready");
      await waitForSessionGateRelease(runtime.page);
      await assertMeaningfulOverview(runtime.page, "short desktop 1024x540");
      await verifyCanonicalNavigationLayout(runtime.page, "short desktop 1024x540");
      await verifyShortRail(runtime.page);
      const destination = await capture(runtime.page, screenshotName("short-desktop", SHORT_DESKTOP_VIEWPORT));
      evidence.push(path.relative(REPOSITORY_ROOT, destination));
      await assertNoRuntimeErrors(runtime, "short desktop 1024x540");
      checks.push({ scenario: "short-desktop-rail", viewport: "1024x540", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "ready");
    try {
      await waitForState(runtime.page, "ready");
      await waitForSessionGateRelease(runtime.page);
      await runtime.page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      await waitForState(runtime.page, "ready");
      await waitForSessionGateRelease(runtime.page);
      await assertMeaningfulOverview(runtime.page, "direct reload 1280x720");
      await verifyNavigationKeyboardAndCollapsedLabels(runtime.page);
      await verifyDialogFocusLifecycle(runtime.page);
      await verifyWorldPlannedBoundary(runtime.page);
      await assertNoDocumentHorizontalOverflow(runtime.page, "keyboard and dialog lifecycle");
      await assertNoRuntimeErrors(runtime, "keyboard and dialog lifecycle");
      checks.push({ scenario: "direct-reload-keyboard-dialog-legacy-boundary", viewport: "1280x720", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  for (const destination of LEGACY_NAVIGATION_DESTINATIONS) {
    await verifyLegacyHandoffContract(browser, fixture, destination);
    checks.push({
      scenario: "legacy-route-handoff",
      destination: destination.id,
      label: destination.label,
      ownership: "legacy",
      selectedGame: "opaque",
      focus: "navigation-item-then-handoff-action",
      history: "back-forward-and-return",
      status: "passed",
    });
  }

  for (const destination of PLANNED_NAVIGATION_DESTINATIONS) {
    await verifyPlannedBoundaryContract(browser, fixture, destination);
    checks.push({
      scenario: "planned-route-boundary",
      destination: destination.id,
      label: destination.label,
      ownership: "planned",
      legacyDestination: null,
      focus: "navigation-item",
      history: "back-forward-and-no-handoff",
      status: "passed",
    });
  }

  checks.push(...await auditAuthoritativeUuidHandoffExposure(browser, fixture));

  {
    const runtime = await createScenarioRuntime(browser, fixture, "session-validating", DEFAULT_VIEWPORT, {
      seedSession: false,
    });
    try {
      const gate = runtime.page.locator("#adminSessionGate");
      await gate.waitFor({ state: "visible" });
      assert.equal(await runtime.page.locator("#adminPreview").isHidden(), true, "Admin shell was visible before session validation");
      let bodyText = await runtime.page.locator("body").innerText();
      assert.equal(bodyText.includes(ADMIN_V2_FIXTURE_LONG_GAME_NAME), false, "Game data flashed before session validation");
      assert.equal(bodyText.includes(ADMIN_V2_FIXTURE_LONG_ADMIN_NAME), false, "Administrator data flashed before session validation");
      assert.equal(bodyText.includes(ADMIN_V2_FIXTURE_LONG_PLAYER_NAME), false, "Player data flashed before session validation");
      await runtime.page.waitForTimeout(250);
      assert.equal(await gate.isVisible(), true, "Session gate released before the authoritative response");
      assert.equal(adminDataRequests(fixture, runtime.runId).length, 0, "Admin data was requested before session bootstrap validation");

      await waitForState(runtime.page, "ready", 15_000);
      await waitForSessionGateRelease(runtime.page);
      bodyText = await runtime.page.locator("body").innerText();
      assert.ok(bodyText.includes(ADMIN_V2_FIXTURE_LONG_PLAYER_NAME), "Validated session did not release Admin data");
      const requestPaths = fixture.requestsFor(runtime.runId).map((request) => request.pathname);
      const bootstrapIndex = requestPaths.indexOf("/session/bootstrap");
      const firstDataIndex = requestPaths.findIndex((pathname) =>
        pathname === "/games"
          || pathname === "/notifications"
          || pathname.endsWith("/dashboard")
          || pathname.endsWith("/store/items")
      );
      assert.ok(bootstrapIndex >= 0 && firstDataIndex > bootstrapIndex, "Admin data did not wait for the session bootstrap boundary");
      await assertNoRawBackendDetails(runtime.page, "session validation without data flash");
      await assertNoRuntimeErrors(runtime, "session validation without data flash");
      assertNoBearerRequests(fixture, runtime.runId, "session validation without data flash");
      checks.push({ scenario: "session-validation-no-data-flash", viewport: "1280x720", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "unauthenticated", DEFAULT_VIEWPORT, {
      seedSession: false,
      includeGame: false,
      includeFixtureQuery: false,
      hash: "",
    });
    try {
      await assertRedirectedSessionBoundary(runtime, fixture, {
        label: "direct unauthenticated /admin/v2.html",
        expectedReasons: ["session-required"],
        expectedFailureCode: "auth_required",
      });
      checks.push({ scenario: "direct-unauthenticated", route: "/admin/v2.html", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "missing-game", DEFAULT_VIEWPORT, {
      includeGame: false,
      includeFixtureQuery: false,
      hash: "",
    });
    try {
      await assertRedirectedSessionBoundary(runtime, fixture, {
        label: "valid session without selected game",
        expectedReasons: ["select-game"],
        requiresBoundaryRequest: false,
      });
      checks.push({ scenario: "missing-selected-game", route: "/admin/v2.html", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  for (const { scenario: sessionScenario, failureCode } of [
    { scenario: "expired", failureCode: "session_expired" },
    { scenario: "revoked", failureCode: "staff_session_revoked" },
    { scenario: "security-version-invalid", failureCode: "staff_session_security_version_invalid" },
  ]) {
    const runtime = await createScenarioRuntime(browser, fixture, sessionScenario);
    try {
      await assertRedirectedSessionBoundary(runtime, fixture, {
        label: `${sessionScenario} administrator session`,
        expectedReasons: ["session-expired", "session-required"],
        expectedFailureCode: failureCode,
      });
      checks.push({ scenario: `session-${sessionScenario}`, status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  for (const failureScenario of [
    {
      scenario: "aal2-required",
      label: "AAL2-required response",
      message: /Additional administrator verification is required/i,
      retryable: false,
      status: 403,
      expectedFailureCode: "MFA_REQUIRED",
    },
    {
      scenario: "permission-403",
      label: "permission-denied 403 response",
      message: /do not have permission/i,
      retryable: false,
      status: 403,
      expectedFailureCode: "PERMISSION_DENIED",
    },
    {
      scenario: "rate-limited-429",
      label: "rate-limited 429 response",
      message: /Too many requests were sent/i,
      retryable: true,
      status: 429,
      retryAfter: "7",
      expectedFailureCode: "RATE_LIMIT_EXCEEDED",
    },
    {
      scenario: "retryable-5xx",
      label: "retryable 5xx response",
      message: /temporarily unavailable/i,
      retryable: true,
      status: 503,
      expectedFailureCode: "UPSTREAM_UNAVAILABLE",
    },
  ]) {
    const runtime = await createScenarioRuntime(browser, fixture, failureScenario.scenario);
    try {
      await assertSafeOverviewFailure(runtime, failureScenario);
      assertNoBearerRequests(fixture, runtime.runId, failureScenario.label);
      checks.push({
        scenario: failureScenario.scenario,
        responseStatus: failureScenario.status,
        retryAfter: failureScenario.retryAfter || null,
        safeError: true,
        status: "passed",
      });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "api-401");
    try {
      await waitForState(runtime.page, "failed");
      const error = runtime.page.locator('.admin-state[data-tone="error"]').first();
      await error.waitFor({ state: "visible" });
      assert.match(await error.innerText(), /administrator session has expired/i, "401 did not render the safe session-required message");
      await assertNoRawBackendDetails(runtime.page, "401 response before redirect");
      await runtime.page.waitForURL((url) =>
        url.pathname === "/"
          && url.searchParams.get("mode") === "admin"
          && url.searchParams.get("reason") === "session-expired",
      { timeout: 10_000 });
      assert.ok(adminDataRequests(fixture, runtime.runId).length > 0, "401 scenario did not reach the Admin BFF");
      assert.ok(
        runtime.httpFailures.some((failure) => failure.fixtureErrorCode === "SESSION_EXPIRED"),
        "401 scenario did not exercise SESSION_EXPIRED",
      );
      await assertNoRawBackendDetails(runtime.page, "401 response after redirect");
      const duplicateRedirectAborts = runtime.failedRequests.filter((entry) =>
        /\?mode=admin&reason=session-expired net::ERR_ABORTED$/i.test(entry)
      );
      await assertNoRuntimeErrors(runtime, "401 response", {
        allowExpectedHttpConsoleError: true,
        allowExpectedRedirectAborts: true,
      });
      assertNoBearerRequests(fixture, runtime.runId, "401 response");
      checks.push({
        scenario: "api-401-session-expired",
        responseStatus: 401,
        safeError: true,
        redirectAbortCount: duplicateRedirectAborts.length,
        status: duplicateRedirectAborts.length === 0 ? "passed" : "failed",
        failure: duplicateRedirectAborts.length === 0
          ? null
          : "Concurrent 401 panel responses schedule duplicate session-expired redirects, producing aborted navigation requests.",
      });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "loading");
    try {
      await waitForState(runtime.page, "initial-loading");
      await waitForSessionGateRelease(runtime.page);
      assert.ok(await runtime.page.locator(".admin-skeleton").count() > 0, "Loading state has no shape-accurate skeleton");
      await assertNoDocumentHorizontalOverflow(runtime.page, "initial loading");
      const destination = await capture(runtime.page, screenshotName("loading", DEFAULT_VIEWPORT));
      evidence.push(path.relative(REPOSITORY_ROOT, destination));
      await assertNoRuntimeErrors(runtime, "initial loading");
      checks.push({ scenario: "loading", viewport: "1280x720", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "stale");
    try {
      await waitForState(runtime.page, "ready");
      assert.ok((await runtime.page.locator("body").innerText()).includes(ADMIN_V2_FIXTURE_LONG_PLAYER_NAME));
      await runtime.page.getByRole("button", { name: "Refresh overview", exact: true }).click();
      await waitForState(runtime.page, "refreshing");
      assert.ok(
        (await runtime.page.locator("body").innerText()).includes(ADMIN_V2_FIXTURE_LONG_PLAYER_NAME),
        "Refresh concealed previously resolved content",
      );
      await waitForState(runtime.page, "stale");
      await runtime.page.locator(".admin-stale-state").waitFor({ state: "visible" });
      assert.ok(
        (await runtime.page.locator("body").innerText()).includes(ADMIN_V2_FIXTURE_LONG_PLAYER_NAME),
        "Stale state discarded previously resolved content",
      );
      await assertNoRawBackendDetails(runtime.page, "stale refresh");
      await assertNoDocumentHorizontalOverflow(runtime.page, "stale refresh");
      const destination = await capture(runtime.page, screenshotName("stale", DEFAULT_VIEWPORT));
      evidence.push(path.relative(REPOSITORY_ROOT, destination));
      await assertNoRuntimeErrors(runtime, "stale refresh");
      checks.push({ scenario: "refreshing-stale", viewport: "1280x720", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "failed");
    try {
      await waitForState(runtime.page, "failed");
      await waitForSessionGateRelease(runtime.page);
      await runtime.page.locator('.admin-state[data-tone="error"]').first().waitFor({ state: "visible" });
      assert.ok(
        await runtime.page.getByRole("button", { name: /try again|retry|refresh/i }).count() > 0,
        "Failed state does not expose an explicit retry action",
      );
      await assertNoRawBackendDetails(runtime.page, "failed request");
      await assertNoDocumentHorizontalOverflow(runtime.page, "failed request");
      const destination = await capture(runtime.page, screenshotName("failed", DEFAULT_VIEWPORT));
      evidence.push(path.relative(REPOSITORY_ROOT, destination));
      await assertNoRuntimeErrors(runtime, "failed request");
      checks.push({ scenario: "failed", viewport: "1280x720", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "permission");
    try {
      await runtime.page.locator('.admin-permission-boundary[data-state="denied"]').waitFor({ state: "visible" });
      await waitForSessionGateRelease(runtime.page);
      assert.match(
        await runtime.page.locator("body").innerText(),
        /(?:does not include|do not have) the permission/i,
      );
      await assertNoRawBackendDetails(runtime.page, "permission denial");
      await assertNoDocumentHorizontalOverflow(runtime.page, "permission denial");
      const overviewRequests = fixture.requestsFor(runtime.runId).filter((request) =>
        request.pathname.endsWith("/dashboard")
          || request.pathname === "/games"
          || request.pathname === "/notifications"
          || request.pathname.endsWith("/store/items")
      );
      assert.equal(overviewRequests.length, 0, "Permission denial still fetched Overview data");
      const destination = await capture(runtime.page, screenshotName("permission-denied", DEFAULT_VIEWPORT));
      evidence.push(path.relative(REPOSITORY_ROOT, destination));
      await assertNoRuntimeErrors(runtime, "permission denial");
      checks.push({ scenario: "permission-denied", viewport: "1280x720", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "planned-permission");
    try {
      await waitForState(runtime.page, "ready");
      await waitForSessionGateRelease(runtime.page);
      const marketplace = runtime.page.locator('.admin-navigation__link[data-route="marketplace"]');
      await marketplace.click();
      const denial = runtime.page.locator('.admin-permission-boundary[data-state="denied"]');
      await denial.waitFor({ state: "visible" });
      assert.match(await denial.innerText(), /Marketplace access restricted/i);
      assert.match(await denial.innerText(), /permission required for this destination/i);
      assert.equal(
        await runtime.page.locator('.admin-route-boundary[data-route="marketplace"]').count(),
        0,
        "A permission-denied planned route rendered its planned content",
      );
      assert.equal(await denial.getByRole("link").count(), 0, "A permission-denied planned route exposed a link");
      assert.equal(new URL(runtime.page.url()).hash, "#marketplace");
      await assertNoRawBackendDetails(runtime.page, "planned route permission denial");
      await assertNoDocumentHorizontalOverflow(runtime.page, "planned route permission denial");
      await assertNoRuntimeErrors(runtime, "planned route permission denial");
      checks.push({ scenario: "planned-route-permission-denied", route: "marketplace", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createScenarioRuntime(browser, fixture, "empty");
    try {
      await waitForState(runtime.page, "empty");
      await waitForSessionGateRelease(runtime.page);
      await runtime.page.locator('.admin-state[data-tone="empty"]').first().waitFor({ state: "visible" });
      const bodyText = await runtime.page.locator("body").innerText();
      assert.equal(bodyText.includes(ADMIN_V2_FIXTURE_LONG_PLAYER_NAME), false, "Empty state fabricated a player row");
      assert.doesNotMatch(bodyText, /\b(?:demo|sample|placeholder) (?:player|contract|notification|record)\b/i);
      await assertNoRawBackendDetails(runtime.page, "empty state");
      await assertNoDocumentHorizontalOverflow(runtime.page, "empty state");
      const destination = await capture(runtime.page, screenshotName("empty", DEFAULT_VIEWPORT));
      evidence.push(path.relative(REPOSITORY_ROOT, destination));
      await assertNoRuntimeErrors(runtime, "empty state");
      checks.push({ scenario: "empty", viewport: "1280x720", status: "passed" });
    } finally {
      await runtime.close();
    }
  }

  const passedChecks = checks.filter((check) => check.status === "passed");
  const expectedExceptions = checks.filter((check) => check.status === "expected-exception");
  const failedChecks = checks.filter((check) => check.status === "failed");
  const result = {
    roadmapItem: "BETA-ADMIN-UI-V2-001",
    fixture: "local same-origin Admin BFF read fixture",
    staticRoot: path.relative(REPOSITORY_ROOT, STATIC_ROOT) || ".",
    generatedAt: new Date().toISOString(),
    viewports: VIEWPORTS.map(({ width, height }) => `${width}x${height}`),
    checks,
    counts: {
      total: checks.length,
      passed: passedChecks.length,
      expectedExceptions: expectedExceptions.length,
      failed: failedChecks.length,
    },
    expectedExceptions,
    evidence,
    diagnostics: runtimeDiagnostics,
    status: failedChecks.length > 0
      ? "failed"
      : expectedExceptions.length > 0
        ? "passed-with-expected-exceptions"
        : "passed",
  };
  writeFileSync(
    path.join(EVIDENCE_DIRECTORY, "admin-v2-browser-results.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  if (failedChecks.length > 0) {
    throw new Error(
      `Admin v2 browser contract audit found ${failedChecks.length} failure(s): ${[...new Set(failedChecks.map((check) => check.failure))].join(" ")}`,
    );
  }
  process.stdout.write(
    `Admin v2 browser smoke passed: ${passedChecks.length} checks, ${expectedExceptions.length} expected legacy-contract exceptions, ${failedChecks.length} failures, ${evidence.length} screenshots.\n`,
  );
} catch (error) {
  const passedChecks = checks.filter((check) => check.status === "passed");
  const expectedExceptions = checks.filter((check) => check.status === "expected-exception");
  const failedChecks = checks.filter((check) => check.status === "failed");
  const result = {
    roadmapItem: "BETA-ADMIN-UI-V2-001",
    generatedAt: new Date().toISOString(),
    staticRoot: path.relative(REPOSITORY_ROOT, STATIC_ROOT) || ".",
    checks,
    counts: {
      total: checks.length,
      passed: passedChecks.length,
      expectedExceptions: expectedExceptions.length,
      failed: failedChecks.length,
    },
    expectedExceptions,
    evidence,
    diagnostics: runtimeDiagnostics,
    status: "failed",
    failure: String(error?.stack || error?.message || error),
  };
  writeFileSync(
    path.join(EVIDENCE_DIRECTORY, "admin-v2-browser-results.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  throw error;
} finally {
  await browser?.close();
  await fixture.close();
}
