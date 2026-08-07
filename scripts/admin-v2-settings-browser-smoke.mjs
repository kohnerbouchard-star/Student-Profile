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
  process.env.ADMIN_V2_SETTINGS_EVIDENCE_DIR
    || path.join(REPOSITORY_ROOT, "docs", "operations", "evidence", "admin-ui-v2-settings", "runtime"),
);
const RESULT_PATH = path.join(EVIDENCE_DIRECTORY, "admin-v2-settings-browser-results.json");
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const SETTINGS_PROXY_PATTERN = `**/functions/v1/web-session-api/proxy/games/${ADMIN_V2_FIXTURE_GAME_ID}/settings`;
const SESSION_BOOTSTRAP_PATTERN = "**/functions/v1/web-session-api/proxy/session/bootstrap";
const PRIVATE_UUID = "90000000-0000-4000-8000-000000000099";
const DESKTOP = Object.freeze({ width: 1280, height: 720 });
const MOBILE = Object.freeze({ width: 390, height: 844 });

mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });

function baseSettings({ longKoreanPreset = false } = {}) {
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

function json(route, status, payload, headers = {}) {
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

async function createSettingsRuntime(browser, fixture, {
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
  let settings = baseSettings({ longKoreanPreset });
  let getCount = 0;
  const settingsRequests = [];
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
  }, {
    sessionKey: SESSION_STORAGE_KEY,
    deviceKey: DEVICE_STORAGE_KEY,
    seededSession: session,
    deviceId: DEVICE_ID,
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 503/i.test(message.text())) {
      browserErrors.push(`console: ${message.text()}`);
    }
  });

  if (permissions) {
    await page.route(SESSION_BOOTSTRAP_PATTERN, (route) => json(route, 200, bootstrapEnvelope(session)));
  }

  await page.route(SETTINGS_PROXY_PATTERN, async (route) => {
    const request = route.request();
    const headers = request.headers();
    const method = request.method();
    let body = null;
    try { body = request.postDataJSON(); } catch (_error) {}
    settingsRequests.push({ method, headers, body });

    if (method === "GET") {
      getCount += 1;
      if (staleAfterFirstRead && getCount > 1) {
        return json(route, 503, {
          error: { code: "UPSTREAM_UNAVAILABLE", message: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC, retryable: true },
        }, { "x-request-id": "settings-browser-stale" });
      }
      return json(route, 200, readEnvelope(settings));
    }

    if (method !== "PATCH") {
      return json(route, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
    }
    if (failPatch) {
      return json(route, 503, {
        error: { code: "UPSTREAM_UNAVAILABLE", message: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC, retryable: true },
      }, { "x-request-id": "settings-browser-save-failed" });
    }

    assert.equal(headers["x-econovaria-csrf-token"], ADMIN_V2_FIXTURE_CSRF, "Settings PATCH omitted CSRF");
    assert.match(headers["idempotency-key"] || "", /^admin\.settings\.save\./, "Settings PATCH omitted idempotency identity");
    assert.equal(headers.authorization || "", "", "Settings PATCH leaked a browser bearer token");
    assert.equal(headers["x-econovaria-game-id"], ADMIN_V2_FIXTURE_GAME_ID, "Settings PATCH omitted selected game scope");

    const incoming = body?.settings || {};
    settings = {
      ...settings,
      ...incoming,
      attendanceWindow: incoming.attendanceWindow
        ? { ...settings.attendanceWindow, ...incoming.attendanceWindow }
        : settings.attendanceWindow,
    };
    if (["priceMultiplier", "incomeMultiplier", "shockFrequency", "shockSeverity", "recoverySupport", "tradeMultiplier"]
      .some((field) => Object.hasOwn(incoming, field))) {
      settings.difficultyBasePreset = "custom";
    } else if (incoming.difficultyPreset) {
      settings.difficultyBasePreset = incoming.difficultyPreset;
    }
    return json(route, 200, { ok: true, settings });
  });

  await page.goto(`${fixture.origin}/admin/v2.html?game=${encodeURIComponent(ADMIN_V2_FIXTURE_GAME_ID)}#settings`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const gate = page.locator("#adminSessionGate");
  if (await gate.count()) await gate.waitFor({ state: "detached", timeout: 10_000 });

  return {
    context,
    page,
    session,
    settingsRequests,
    browserErrors,
    async close() { await context.close(); },
  };
}

async function waitForReady(page) {
  await page.locator('.admin-shell[data-admin-v2-state="ready"]').waitFor({ state: "attached", timeout: 10_000 });
  await page.getByRole("heading", { level: 1, name: "Settings", exact: true }).waitFor({ state: "visible" });
}

async function screenshot(page, name) {
  const target = path.join(EVIDENCE_DIRECTORY, `${name}.png`);
  await page.screenshot({ path: target, fullPage: false, animations: "disabled" });
  return path.relative(REPOSITORY_ROOT, target);
}

async function noHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(metrics.document <= metrics.viewport + 1, `${label} document overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.body <= metrics.viewport + 1, `${label} body overflow: ${JSON.stringify(metrics)}`);
}

async function noSensitivePresentation(page, label) {
  const exposed = await page.evaluate(() => ({
    text: document.body.innerText,
    attributes: [...document.body.querySelectorAll("*")].flatMap((element) => [...element.attributes].map((attribute) => `${attribute.name}=${attribute.value}`)),
  }));
  const combined = `${exposed.text}\n${exposed.attributes.join("\n")}`;
  assert.equal(combined.includes(PRIVATE_UUID), false, `${label} exposed a private settings UUID`);
  assert.equal(combined.includes(ADMIN_V2_FIXTURE_ADMIN_ID), false, `${label} exposed the administrator UUID`);
  assert.equal(combined.includes("fixture-secret-never-render"), false, `${label} exposed a credential-like value`);
  assert.equal(combined.includes(ADMIN_V2_RAW_BACKEND_DIAGNOSTIC), false, `${label} exposed raw backend detail`);
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY|service_role|SELECT \* FROM/i, `${label} exposed backend secret detail`);
}

async function assertCleanRuntime(runtime, label) {
  assert.deepEqual(runtime.browserErrors, [], `${label} emitted browser errors:\n${runtime.browserErrors.join("\n")}`);
}

const checks = [];
const evidence = [];
function passed(name, detail = "") {
  checks.push({ name, status: "passed", detail });
}

const fixture = await startAdminV2FixtureServer();
const browser = await chromium.launch({ headless: true });
try {
  {
    const runtime = await createSettingsRuntime(browser, fixture);
    try {
      await waitForReady(runtime.page);
      assert.equal(await runtime.page.getByLabel("Difficulty preset").inputValue(), "moderate");
      assert.equal(await runtime.page.getByLabel("Price multiplier").inputValue(), "1");
      assert.equal(await runtime.page.getByLabel("Present reward").inputValue(), "5");
      assert.equal(await runtime.page.getByLabel("Late reward").inputValue(), "2");
      assert.equal(runtime.settingsRequests.filter(({ method }) => method === "GET").length, 1);
      for (const routeId of ["overview", "store", "market", "settings"]) {
        assert.equal(await runtime.page.locator(`[data-route="${routeId}"]`).count(), 1, `missing V2 navigation route ${routeId}`);
      }
      await noSensitivePresentation(runtime.page, "ready Settings");
      await noHorizontalOverflow(runtime.page, "ready desktop Settings");
      evidence.push(await screenshot(runtime.page, "settings-ready-1280x720"));
      passed("current values and source-owned route");

      await runtime.page.getByLabel("Price multiplier").fill("2.1");
      await runtime.page.getByRole("button", { name: "Review and save" }).click();
      const validation = runtime.page.locator(".admin-validation-summary");
      await validation.waitFor({ state: "visible" });
      assert.equal(await validation.evaluate((node) => node === document.activeElement), true, "validation summary did not receive focus");
      assert.equal(runtime.settingsRequests.filter(({ method }) => method === "PATCH").length, 0, "invalid settings issued a PATCH");
      evidence.push(await screenshot(runtime.page, "settings-validation"));
      passed("validation and focus summary");

      await runtime.page.getByLabel("Price multiplier").fill("1");
      await runtime.page.getByLabel("Present reward").fill("6");
      const opener = runtime.page.getByRole("button", { name: "Review and save" });
      await opener.focus();
      await opener.click();
      const dialog = runtime.page.getByRole("alertdialog", { name: "Apply game settings?" });
      await dialog.waitFor({ state: "visible" });
      const confirm = dialog.getByRole("button", { name: "Apply settings" });
      assert.equal(await confirm.evaluate((node) => node === document.activeElement), true, "confirmation did not autofocus the primary action");
      await runtime.page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await opener.evaluate((node) => node === document.activeElement), true, "Escape did not restore opener focus");
      await opener.click();
      await dialog.getByRole("button", { name: "Apply settings" }).click();
      await runtime.page.getByLabel("Present reward").waitFor({ state: "visible" });
      await runtime.page.waitForFunction(() => document.querySelector('#admin-settings-present-reward')?.value === "6");
      const attendancePatch = runtime.settingsRequests.filter(({ method }) => method === "PATCH").at(-1);
      assert.deepEqual(Object.keys(attendancePatch.body.settings).sort(), ["attendanceWindow"]);
      assert.equal(attendancePatch.body.settings.attendanceWindow.presentRewardAmount, 6);
      assert.equal(attendancePatch.body.settings.attendanceWindow.currencyMode, "player_country");
      assert.equal(attendancePatch.body.settings.attendanceWindow.applyDifficultyIncomeModifier, true);
      passed("confirmed attendance edit preserves security and hidden attendance policy");

      await runtime.page.getByLabel("Price multiplier").fill("1.25");
      await opener.click();
      await runtime.page.getByRole("alertdialog", { name: "Apply game settings?" }).getByRole("button", { name: "Apply settings" }).click();
      await runtime.page.waitForFunction(() => document.querySelector('#admin-settings-difficulty-preset')?.value === "custom");
      const modifierPatch = runtime.settingsRequests.filter(({ method }) => method === "PATCH").at(-1);
      assert.equal(modifierPatch.body.settings.priceMultiplier, 1.25);
      assert.equal(modifierPatch.body.settings.difficultyPreset, undefined);
      passed("modifier edit follows authoritative custom-policy semantics");
      await assertCleanRuntime(runtime, "ready/edit Settings");
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createSettingsRuntime(browser, fixture, { staleAfterFirstRead: true });
    try {
      await waitForReady(runtime.page);
      await runtime.page.getByRole("button", { name: "Refresh", exact: true }).click();
      await runtime.page.locator('.admin-shell[data-admin-v2-state="stale"]').waitFor({ state: "attached", timeout: 10_000 });
      assert.equal(await runtime.page.getByLabel("Present reward").inputValue(), "5");
      const blockedSave = runtime.page.getByRole("button", { name: "Refresh before saving" });
      assert.equal(await blockedSave.isDisabled(), true, "stale Settings did not block mutation");
      await noSensitivePresentation(runtime.page, "stale Settings");
      evidence.push(await screenshot(runtime.page, "settings-stale"));
      passed("stale data retained and mutation blocked");
      await assertCleanRuntime(runtime, "stale Settings");
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createSettingsRuntime(browser, fixture, { failPatch: true });
    try {
      await waitForReady(runtime.page);
      await runtime.page.getByLabel("Late reward").fill("3");
      await runtime.page.getByRole("button", { name: "Review and save" }).click();
      await runtime.page.getByRole("alertdialog", { name: "Apply game settings?" }).getByRole("button", { name: "Apply settings" }).click();
      await runtime.page.getByText("Settings were not saved", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      await noSensitivePresentation(runtime.page, "failed-save Settings");
      evidence.push(await screenshot(runtime.page, "settings-failed-save"));
      passed("failed save uses safe error presentation");
      await assertCleanRuntime(runtime, "failed-save Settings");
    } finally {
      await runtime.close();
    }
  }

  {
    const permissions = createAdminV2FixtureSession("ready").permissions.filter((permission) => permission !== "settings.manage");
    const runtime = await createSettingsRuntime(browser, fixture, { permissions });
    try {
      await runtime.page.locator('.admin-shell[data-admin-v2-state="permission-denied"]').waitFor({ state: "attached", timeout: 10_000 });
      await runtime.page.getByText("Settings access restricted", { exact: true }).waitFor({ state: "visible" });
      assert.equal(runtime.settingsRequests.length, 0, "permission-denied Settings still queried the settings API");
      evidence.push(await screenshot(runtime.page, "settings-permission-denied"));
      passed("settings.manage permission denial is fail-closed");
      await assertCleanRuntime(runtime, "permission-denied Settings");
    } finally {
      await runtime.close();
    }
  }

  {
    const runtime = await createSettingsRuntime(browser, fixture, { viewport: MOBILE, longKoreanPreset: true });
    try {
      await waitForReady(runtime.page);
      const currentPreset = await runtime.page.getByLabel("Difficulty preset").inputValue();
      assert.match(currentPreset, /교육-맞춤형/);
      assert.ok(currentPreset.length <= 80, "long current preset was not presentation-bounded");
      await noHorizontalOverflow(runtime.page, "mobile long/Korean Settings");
      await noSensitivePresentation(runtime.page, "mobile long/Korean Settings");
      evidence.push(await screenshot(runtime.page, "settings-mobile-korean-390x844"));
      passed("mobile and long/Korean value containment");
      await assertCleanRuntime(runtime, "mobile Settings");
    } finally {
      await runtime.close();
    }
  }
} finally {
  await browser.close();
  await fixture.close();
}

const result = {
  generatedAt: new Date().toISOString(),
  route: "/admin/v2.html#settings",
  permission: "settings.manage",
  checks,
  evidence,
};
writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
