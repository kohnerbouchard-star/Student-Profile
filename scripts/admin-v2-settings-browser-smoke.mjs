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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_DIR = path.resolve(
  process.env.ADMIN_V2_SETTINGS_EVIDENCE_DIR
    || path.join(ROOT, "docs", "operations", "evidence", "admin-ui-v2-settings", "runtime"),
);
const RESULT_PATH = path.join(EVIDENCE_DIR, "admin-v2-settings-browser-results.json");
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const SESSION_KEY = "econovaria.admin.auth.v1";
const DEVICE_KEY = "econovaria.device.v1";
const PRIVATE_UUID = "90000000-0000-4000-8000-000000000099";
const DESKTOP = Object.freeze({ width: 1280, height: 720 });
const MOBILE = Object.freeze({ width: 390, height: 844 });
const SETTINGS_PROXY = `**/functions/v1/web-session-api/proxy/games/${ADMIN_V2_FIXTURE_GAME_ID}/settings`;
const BOOTSTRAP_PROXY = "**/functions/v1/web-session-api/proxy/session/bootstrap";
const MODIFIERS = Object.freeze([
  "priceMultiplier",
  "incomeMultiplier",
  "shockFrequency",
  "shockSeverity",
  "recoverySupport",
  "tradeMultiplier",
]);

mkdirSync(EVIDENCE_DIR, { recursive: true });

function fixtureSettings({ longKoreanPreset = false } = {}) {
  return {
    difficultyBasePreset: longKoreanPreset
      ? "교육-맞춤형-장기-경제-시뮬레이션-설정-".repeat(4)
      : "moderate",
    priceMultiplier: 1,
    incomeMultiplier: 1.1,
    shockFrequency: 0.9,
    shockSeverity: 1.2,
    recoverySupport: 1,
    tradeMultiplier: 1,
    attendanceWindow: {
      timezone: "Asia/Seoul",
      presentRewardAmount: 5,
      lateRewardAmount: 2,
      currencyMode: "player_country",
      applyDifficultyIncomeModifier: true,
      currencyCode: "ECO",
      safeKoreanNote: "출석 보상 정책은 국가 통화와 난이도 소득 조정을 자동으로 적용합니다.",
      ownerSessionId: PRIVATE_UUID,
      serverCredential: "fixture-secret-never-render",
    },
    configLastSaved: "2026-08-07T07:30:00.000Z",
    internalOwnerId: PRIVATE_UUID,
  };
}

function fulfillJson(route, status, payload, headers = {}) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    headers,
    body: JSON.stringify(payload),
  });
}

function readEnvelope(settings) {
  return {
    data: settings,
    error: null,
    meta: { requestId: `settings-browser-${randomUUID()}` },
  };
}

function bootstrapEnvelope(session) {
  return {
    data: {
      admin: session.user,
      activeGame: session.activeGameSessions[0],
      games: session.activeGameSessions,
      permissions: session.permissions,
      roles: session.roles,
      adminRole: session.adminRole,
    },
    error: null,
    meta: { requestId: "settings-browser-bootstrap" },
  };
}

async function createRuntime(browser, fixture, {
  viewport = DESKTOP,
  permissions = null,
  longKoreanPreset = false,
  failPatch = false,
  staleAfterFirstRead = false,
} = {}) {
  const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
  const runId = randomUUID();
  const session = createAdminV2FixtureSession("ready");
  if (permissions) session.permissions = permissions;
  let settings = fixtureSettings({ longKoreanPreset });
  let getCount = 0;
  const requests = [];
  const browserErrors = [];

  await context.addCookies([
    { name: "admin-v2-scenario", value: "ready", url: fixture.origin, sameSite: "Lax" },
    { name: "admin-v2-run", value: runId, url: fixture.origin, sameSite: "Lax" },
  ]);
  await context.addInitScript(({ sessionKey, deviceKey, seededSession, deviceId }) => {
    try {
      window.sessionStorage.setItem(sessionKey, JSON.stringify(seededSession));
      window.localStorage.setItem(deviceKey, deviceId);
    } catch (_error) {}
  }, { sessionKey: SESSION_KEY, deviceKey: DEVICE_KEY, seededSession: session, deviceId: DEVICE_ID });

  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error"
      && !/Failed to load resource: the server responded with a status of 503/i.test(message.text())
    ) {
      browserErrors.push(`console: ${message.text()}`);
    }
  });

  if (permissions) {
    await page.route(BOOTSTRAP_PROXY, (route) => fulfillJson(route, 200, bootstrapEnvelope(session)));
  }

  await page.route(SETTINGS_PROXY, async (route) => {
    const request = route.request();
    const method = request.method();
    const headers = request.headers();
    let body = null;
    try { body = request.postDataJSON(); } catch (_error) {}
    requests.push({ method, headers, body });

    if (method === "GET") {
      getCount += 1;
      if (staleAfterFirstRead && getCount > 1) {
        return fulfillJson(route, 503, {
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
            retryable: true,
          },
        }, { "x-request-id": "settings-browser-stale" });
      }
      return fulfillJson(route, 200, readEnvelope(settings));
    }

    if (method !== "PATCH") {
      return fulfillJson(route, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
    }
    if (failPatch) {
      return fulfillJson(route, 503, {
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
          retryable: true,
        },
      }, { "x-request-id": "settings-browser-save-failed" });
    }

    assert.equal(headers["x-econovaria-csrf-token"], ADMIN_V2_FIXTURE_CSRF, "Settings PATCH omitted CSRF");
    assert.match(headers["idempotency-key"] || "", /^admin\.settings\.save\./, "Settings PATCH omitted idempotency");
    assert.equal(headers.authorization || "", "", "Settings PATCH leaked a bearer token");
    assert.equal(headers["x-econovaria-game-id"], ADMIN_V2_FIXTURE_GAME_ID, "Settings PATCH omitted game scope");

    const incoming = body?.settings || {};
    settings = {
      ...settings,
      ...incoming,
      attendanceWindow: incoming.attendanceWindow
        ? { ...settings.attendanceWindow, ...incoming.attendanceWindow }
        : settings.attendanceWindow,
    };
    if (MODIFIERS.some((field) => Object.hasOwn(incoming, field))) {
      settings.difficultyBasePreset = "custom";
    } else if (incoming.difficultyPreset) {
      settings.difficultyBasePreset = incoming.difficultyPreset;
    }
    return fulfillJson(route, 200, { ok: true, settings });
  });

  await page.goto(`${fixture.origin}/admin/v2.html?game=${ADMIN_V2_FIXTURE_GAME_ID}#settings`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const gate = page.locator("#adminSessionGate");
  if (await gate.count()) await gate.waitFor({ state: "detached", timeout: 10_000 });

  return {
    context,
    page,
    requests,
    browserErrors,
    async close() { await context.close(); },
  };
}

async function waitReady(page) {
  await page.locator('.admin-shell[data-admin-v2-state="ready"]').waitFor({ state: "attached", timeout: 10_000 });
  await page.getByRole("heading", { level: 1, name: "Settings", exact: true }).waitFor({ state: "visible" });
}

async function capture(page, name) {
  const target = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: target, fullPage: false, animations: "disabled" });
  return path.relative(ROOT, target);
}

async function assertNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(metrics.document <= metrics.viewport + 1, `${label} document overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.body <= metrics.viewport + 1, `${label} body overflow: ${JSON.stringify(metrics)}`);
}

async function assertNoSensitiveData(page, label) {
  const exposed = await page.evaluate(() => ({
    text: document.body.innerText,
    attributes: [...document.body.querySelectorAll("*")]
      .flatMap((element) => [...element.attributes].map((attribute) => `${attribute.name}=${attribute.value}`)),
  }));
  const combined = `${exposed.text}\n${exposed.attributes.join("\n")}`;
  assert.equal(combined.includes(PRIVATE_UUID), false, `${label} exposed a private settings UUID`);
  assert.equal(combined.includes(ADMIN_V2_FIXTURE_ADMIN_ID), false, `${label} exposed the administrator UUID`);
  assert.equal(combined.includes("fixture-secret-never-render"), false, `${label} exposed credential-like data`);
  assert.equal(combined.includes(ADMIN_V2_RAW_BACKEND_DIAGNOSTIC), false, `${label} exposed raw backend detail`);
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY|service_role|SELECT \* FROM/i, `${label} exposed backend secret detail`);
}

function assertClean(runtime, label) {
  assert.deepEqual(runtime.browserErrors, [], `${label} emitted browser errors:\n${runtime.browserErrors.join("\n")}`);
}

const checks = [];
const evidence = [];
let fatalError = null;
const pass = (name) => checks.push({ name, status: "passed" });
const fixture = await startAdminV2FixtureServer();
const browser = await chromium.launch({ headless: true });

try {
  const ready = await createRuntime(browser, fixture);
  try {
    await waitReady(ready.page);
    assert.equal(await ready.page.getByLabel("Difficulty preset").inputValue(), "moderate");
    assert.equal(await ready.page.getByLabel("Price multiplier").inputValue(), "1");
    assert.equal(await ready.page.getByLabel("Present reward").inputValue(), "5");
    assert.equal(await ready.page.getByLabel("Late reward").inputValue(), "2");
    assert.equal(ready.requests.filter(({ method }) => method === "GET").length, 1);
    for (const routeId of ["overview", "store", "market", "settings"]) {
      assert.ok(await ready.page.locator(`[data-route="${routeId}"]`).count() >= 1, `missing V2 navigation route ${routeId}`);
    }
    await assertNoSensitiveData(ready.page, "ready Settings");
    await assertNoOverflow(ready.page, "ready desktop Settings");
    evidence.push(await capture(ready.page, "settings-ready-1280x720"));
    pass("current values and source-owned route");

    await ready.page.getByLabel("Price multiplier").fill("2.1");
    await ready.page.getByRole("button", { name: "Review and save" }).click();
    const summary = ready.page.locator(".admin-validation-summary");
    await summary.waitFor({ state: "visible" });
    assert.equal(await summary.evaluate((node) => node === document.activeElement), true, "validation summary did not receive focus");
    assert.equal(ready.requests.filter(({ method }) => method === "PATCH").length, 0, "invalid Settings issued PATCH");
    evidence.push(await capture(ready.page, "settings-validation"));
    pass("validation and validation-summary focus");

    await ready.page.getByLabel("Price multiplier").fill("1");
    await ready.page.getByLabel("Present reward").fill("6");
    const opener = ready.page.getByRole("button", { name: "Review and save" });
    await opener.focus();
    await opener.click();
    let dialog = ready.page.getByRole("alertdialog", { name: "Apply game settings?" });
    await dialog.waitFor({ state: "visible" });
    const confirm = dialog.getByRole("button", { name: "Apply settings" });
    assert.equal(await confirm.evaluate((node) => node === document.activeElement), true, "confirm action did not autofocus");
    await ready.page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await opener.evaluate((node) => node === document.activeElement), true, "Escape did not restore opener focus");
    await opener.click();
    dialog = ready.page.getByRole("alertdialog", { name: "Apply game settings?" });
    await dialog.getByRole("button", { name: "Apply settings" }).click();
    await ready.page.waitForFunction(() => document.querySelector("#admin-settings-present-reward")?.value === "6");
    const attendancePatch = ready.requests.filter(({ method }) => method === "PATCH").at(-1);
    assert.deepEqual(Object.keys(attendancePatch.body.settings).sort(), ["attendanceWindow"]);
    assert.equal(attendancePatch.body.settings.attendanceWindow.presentRewardAmount, 6);
    assert.equal(attendancePatch.body.settings.attendanceWindow.currencyMode, "player_country");
    assert.equal(attendancePatch.body.settings.attendanceWindow.applyDifficultyIncomeModifier, true);
    pass("confirmation focus and attendance mutation semantics");

    await ready.page.getByLabel("Price multiplier").fill("1.25");
    await ready.page.getByRole("button", { name: "Review and save" }).click();
    await ready.page.getByRole("alertdialog", { name: "Apply game settings?" })
      .getByRole("button", { name: "Apply settings" }).click();
    await ready.page.waitForFunction(() => document.querySelector("#admin-settings-difficulty-preset")?.value === "custom");
    const modifierPatch = ready.requests.filter(({ method }) => method === "PATCH").at(-1);
    assert.equal(modifierPatch.body.settings.priceMultiplier, 1.25);
    assert.equal(modifierPatch.body.settings.difficultyPreset, undefined);
    pass("modifier edit follows custom-policy semantics");
    assertClean(ready, "ready/edit Settings");
  } finally {
    await ready.close();
  }

  const stale = await createRuntime(browser, fixture, { staleAfterFirstRead: true });
  try {
    await waitReady(stale.page);
    await stale.page.getByRole("button", { name: "Refresh", exact: true }).click();
    await stale.page.locator('.admin-shell[data-admin-v2-state="stale"]').waitFor({ state: "attached", timeout: 10_000 });
    assert.equal(await stale.page.getByLabel("Present reward").inputValue(), "5");
    assert.equal(await stale.page.getByRole("button", { name: "Refresh before saving" }).isDisabled(), true);
    await assertNoSensitiveData(stale.page, "stale Settings");
    evidence.push(await capture(stale.page, "settings-stale"));
    pass("stale data retained and mutation blocked");
    assertClean(stale, "stale Settings");
  } finally {
    await stale.close();
  }

  const failed = await createRuntime(browser, fixture, { failPatch: true });
  try {
    await waitReady(failed.page);
    await failed.page.getByLabel("Late reward").fill("3");
    await failed.page.getByRole("button", { name: "Review and save" }).click();
    await failed.page.getByRole("alertdialog", { name: "Apply game settings?" })
      .getByRole("button", { name: "Apply settings" }).click();
    await failed.page.getByText("Settings were not saved", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await assertNoSensitiveData(failed.page, "failed-save Settings");
    evidence.push(await capture(failed.page, "settings-failed-save"));
    pass("failed save uses safe error presentation");
    assertClean(failed, "failed-save Settings");
  } finally {
    await failed.close();
  }

  const deniedPermissions = createAdminV2FixtureSession("ready").permissions
    .filter((permission) => permission !== "settings.manage");
  const denied = await createRuntime(browser, fixture, { permissions: deniedPermissions });
  try {
    await denied.page.locator('.admin-shell[data-admin-v2-state="permission-denied"]').waitFor({ state: "attached", timeout: 10_000 });
    await denied.page.getByText("Settings access restricted", { exact: true }).waitFor({ state: "visible" });
    assert.equal(denied.requests.length, 0, "permission-denied Settings queried the settings API");
    evidence.push(await capture(denied.page, "settings-permission-denied"));
    pass("settings.manage permission denial is fail-closed");
    assertClean(denied, "permission-denied Settings");
  } finally {
    await denied.close();
  }

  const mobile = await createRuntime(browser, fixture, { viewport: MOBILE, longKoreanPreset: true });
  try {
    await waitReady(mobile.page);
    const currentPreset = await mobile.page.getByLabel("Difficulty preset").inputValue();
    assert.match(currentPreset, /교육-맞춤형/);
    assert.ok(currentPreset.length <= 80, "long current preset was not bounded");
    await assertNoOverflow(mobile.page, "mobile long/Korean Settings");
    await assertNoSensitiveData(mobile.page, "mobile long/Korean Settings");
    evidence.push(await capture(mobile.page, "settings-mobile-korean-390x844"));
    pass("mobile and long/Korean value containment");
    assertClean(mobile, "mobile Settings");
  } finally {
    await mobile.close();
  }
} catch (error) {
  fatalError = error;
  checks.push({ name: "browser acceptance", status: "failed", detail: String(error?.stack || error) });
} finally {
  await browser.close();
  await fixture.close();
  const result = {
    generatedAt: new Date().toISOString(),
    route: "/admin/v2.html#settings",
    permission: "settings.manage",
    checks,
    evidence,
  };
  writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

if (fatalError) throw fatalError;
