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
  ADMIN_V2_FIXTURE_PERMISSIONS,
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
    || path.join(REPOSITORY_ROOT, "docs", "operations", "evidence", "admin-ui-v2-crafting"),
);
const RESULT_PATH = path.join(EVIDENCE_DIRECTORY, "admin-v2-crafting-browser-results.json");
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const PRIVATE_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const JOB_KEY = `cft_${"a".repeat(32)}`;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });
const checks = [];
const evidence = [];

function oversight({ empty = false } = {}) {
  return {
    schemaVersion: 1,
    pack: empty ? {} : {
      packKey: "econovaria.physical-economy.v1",
      contentVersion: "1.0.0",
      status: "active",
      activatedAt: "2026-08-07T00:00:00.000Z",
      durabilityEnabled: false,
      repairEnabled: false,
    },
    jobs: empty ? [] : [
      {
        jobKey: JOB_KEY,
        playerId: "학생 김민준 — 국제 공급망 연구 프로젝트",
        recipeKey: "advanced_composite",
        recipeName: `초정밀 복합소재 제조법 ${"매우긴이름".repeat(18)}`,
        quantity: 2,
        status: "failed",
        difficulty: "advanced",
        countryCode: "LUM",
        qualityBand: "standard",
        startedAt: "2026-08-07T01:00:00.000Z",
        completesAt: "2026-08-07T01:05:00.000Z",
        failureCode: "reservation_conflict",
        recoveryVersion: 1,
      },
      {
        jobKey: `cft_${"b".repeat(32)}`,
        playerId: ADMIN_V2_FIXTURE_ADMIN_ID,
        recipeKey: "sensor_array",
        recipeName: "센서 배열",
        quantity: 1,
        status: "claimed",
        qualityBand: "high",
        claimedAt: "2026-08-07T02:00:00.000Z",
      },
    ],
    effects: empty ? [] : [{
      effectCode: "mobility_boost",
      handlerCode: "server-only-handler",
      kind: "temporary",
      scope: "player",
      durationSeconds: 900,
      stackingRule: "replace",
      maxStacks: 1,
      cooldownSeconds: 120,
      enabled: true,
      summary: "Temporary logistics mobility effect",
    }],
    supply: empty ? [] : [{
      itemKey: "advanced_composite",
      countryCode: "LUM",
      scarcityBand: "constrained",
      availableQuantity: 4,
      reservedQuantity: 6,
      eventMultiplier: 1.25,
      routeMultiplier: 0.8,
      sourceEventKey: "event.route-disruption.001",
      expiresAt: "2026-08-08T00:00:00.000Z",
      version: 3,
    }],
    invariants: {
      negativeOwned: 0,
      negativeReserved: 0,
      reservedAboveOwned: empty ? 0 : 1,
      reservationProjectionMismatch: 0,
      duplicateOutputGrants: 0,
      repairEnabled: false,
      durabilityEnabled: false,
    },
  };
}

function bootstrapPermissions({ denied = false } = {}) {
  return denied
    ? ADMIN_V2_FIXTURE_PERMISSIONS.filter((permission) => permission !== "inventory.redeem")
    : [...ADMIN_V2_FIXTURE_PERMISSIONS];
}

function bootstrapEnvelope({ denied = false } = {}) {
  return {
    data: {
      admin: {
        id: ADMIN_V2_FIXTURE_ADMIN_ID,
        email: "alexandria.admin@example.test",
        displayName: "Administrator",
        role: "game_admin",
      },
      activeGame: {
        id: ADMIN_V2_FIXTURE_GAME_ID,
        name: ADMIN_V2_FIXTURE_LONG_GAME_NAME,
        status: "active",
        gameCode: "NORTH7",
      },
      games: [{
        id: ADMIN_V2_FIXTURE_GAME_ID,
        name: ADMIN_V2_FIXTURE_LONG_GAME_NAME,
        status: "active",
        gameCode: "NORTH7",
      }],
      permissions: bootstrapPermissions({ denied }),
      roles: ["game_admin"],
      adminRole: "game_admin",
    },
    error: null,
    meta: { requestId: "admin-v2-crafting-bootstrap" },
  };
}

async function createRuntime(browser, fixture, scenario, viewport) {
  const runId = randomUUID();
  const context = await browser.newContext({
    viewport,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  await context.addCookies([
    { name: "admin-v2-scenario", value: "ready", url: fixture.origin, sameSite: "Lax" },
    { name: "admin-v2-run", value: runId, url: fixture.origin, sameSite: "Lax" },
  ]);

  const session = createAdminV2FixtureSession("ready");
  if (scenario === "permission") {
    session.permissions = bootstrapPermissions({ denied: true });
  }
  await context.addInitScript(({ sessionKey, deviceKey, seededSession, deviceId }) => {
    window.sessionStorage.setItem(sessionKey, JSON.stringify(seededSession));
    window.localStorage.setItem(deviceKey, deviceId);
  }, {
    sessionKey: SESSION_STORAGE_KEY,
    deviceKey: DEVICE_STORAGE_KEY,
    seededSession: session,
    deviceId: DEVICE_ID,
  });

  const mutations = [];
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const marker = "/functions/v1/web-session-api/proxy";
    const upstreamPath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length) || "/";

    if (scenario === "permission" && upstreamPath === "/session/bootstrap") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(bootstrapEnvelope({ denied: true })),
      });
      return;
    }

    if (!upstreamPath.includes(`/games/${ADMIN_V2_FIXTURE_GAME_ID}/crafting/`)) {
      await route.continue();
      return;
    }

    if (scenario === "failed") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "x-request-id": "admin-v2-crafting-failed" },
        body: JSON.stringify({
          code: "UPSTREAM_UNAVAILABLE",
          message: "SELECT * FROM private.inventory_holdings USING service_role",
        }),
      });
      return;
    }

    if (request.method() === "GET" && upstreamPath.endsWith("/crafting/oversight")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: oversight({ empty: scenario === "empty" }),
          error: null,
          meta: { requestId: "admin-v2-crafting-oversight" },
        }),
      });
      return;
    }

    if (request.method() === "POST") {
      mutations.push({
        upstreamPath,
        headers: await request.allHeaders(),
        body: request.postDataJSON(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { committed: true },
          error: null,
          meta: { requestId: "admin-v2-crafting-mutation" },
        }),
      });
      return;
    }

    await route.abort();
  });

  await page.goto(
    `${fixture.origin}/admin/v2.html?game=${ADMIN_V2_FIXTURE_GAME_ID}#crafting`,
    { waitUntil: "domcontentloaded", timeout: 15_000 },
  );
  return { context, page, mutations, errors, scenario, viewport };
}

async function assertNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(metrics.document <= metrics.viewport + 1, `${label} document overflow ${JSON.stringify(metrics)}`);
  assert.ok(metrics.body <= metrics.viewport + 1, `${label} body overflow ${JSON.stringify(metrics)}`);
}

async function assertNoLeaks(page, label) {
  const exposure = await page.evaluate(() => {
    const attributes = [];
    for (const element of document.body.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        if (
          attribute.name === "title"
          || attribute.name.startsWith("aria-")
          || attribute.name.startsWith("data-")
        ) {
          attributes.push(`${attribute.name}=${attribute.value}`);
        }
      }
    }
    return { text: document.body.innerText, attributes };
  });
  assert.doesNotMatch(exposure.text, PRIVATE_UUID_PATTERN, `${label} rendered a UUID`);
  assert.doesNotMatch(exposure.attributes.join("\n"), PRIVATE_UUID_PATTERN, `${label} exposed a UUID in attributes`);
  assert.equal(exposure.text.includes("service_role"), false);
  assert.equal(exposure.text.includes("server-only-handler"), false);
}

async function screenshot(page, scenario, viewport) {
  const destination = path.join(
    EVIDENCE_DIRECTORY,
    `crafting-${scenario}-${viewport.width}x${viewport.height}.png`,
  );
  await page.screenshot({ path: destination, fullPage: false, animations: "disabled" });
  evidence.push(path.relative(REPOSITORY_ROOT, destination));
}

async function runReady(browser, fixture, viewport) {
  const runtime = await createRuntime(browser, fixture, "ready", viewport);
  try {
    await runtime.page.locator('.admin-crafting-route[data-admin-v2-state="ready"]')
      .waitFor({ state: "attached", timeout: 10_000 });
    await runtime.page.getByRole("heading", { level: 1, name: "Crafting Supervision" })
      .waitFor({ state: "visible" });
    await runtime.page.getByText("초정밀 복합소재 제조법", { exact: false }).first().waitFor({ state: "visible" });
    await assertNoOverflow(runtime.page, `ready ${viewport.width}`);
    await assertNoLeaks(runtime.page, `ready ${viewport.width}`);

    const release = runtime.page.getByRole("button", { name: "Release & fail" }).first();
    await release.click();
    const dialog = runtime.page.getByRole("dialog");
    await dialog.getByLabel("Recovery reason").fill("Administrative recovery after Inventory reservation review");
    await dialog.getByRole("button", { name: "Release & fail" }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(runtime.mutations.length, 1);
    assert.match(
      runtime.mutations[0].headers["idempotency-key"] || "",
      /^admin\.crafting\.recover\.[0-9a-f-]{36}\.\d+$/i,
    );
    assert.equal(runtime.mutations[0].headers["x-econovaria-csrf-token"], ADMIN_V2_FIXTURE_CSRF);
    assert.equal(runtime.mutations[0].body.outcome, "release_and_fail");
    assert.equal(runtime.mutations[0].body.idempotencyKey, runtime.mutations[0].headers["idempotency-key"]);
    assert.deepEqual(runtime.errors, []);
    await screenshot(runtime.page, "ready", viewport);
    checks.push(`ready-${viewport.width}x${viewport.height}`);
  } finally {
    await runtime.context.close();
  }
}

async function runState(browser, fixture, scenario) {
  const viewport = { width: 1280, height: 720 };
  const runtime = await createRuntime(browser, fixture, scenario, viewport);
  try {
    if (scenario === "empty") {
      await runtime.page.locator('.admin-crafting-route[data-admin-v2-state="empty"]')
        .waitFor({ state: "attached", timeout: 10_000 });
      await runtime.page.getByText("No recipes observed yet").waitFor({ state: "visible" });
    } else if (scenario === "failed") {
      await runtime.page.locator('.admin-crafting-route[data-admin-v2-state="failed"]')
        .waitFor({ state: "attached", timeout: 10_000 });
      await runtime.page.getByText("Crafting supervision could not be loaded").waitFor({ state: "visible" });
      await assertNoLeaks(runtime.page, "failed");
    } else {
      await runtime.page.locator('[data-admin-v2-state="permission-denied"]')
        .waitFor({ state: "attached", timeout: 10_000 });
      await runtime.page.getByText("Crafting access restricted").waitFor({ state: "visible" });
      assert.equal(runtime.mutations.length, 0);
    }
    await assertNoOverflow(runtime.page, scenario);
    await screenshot(runtime.page, scenario, viewport);
    checks.push(scenario);
  } finally {
    await runtime.context.close();
  }
}

const fixture = await startAdminV2FixtureServer({ repositoryRoot: STATIC_ROOT });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of VIEWPORTS) await runReady(browser, fixture, viewport);
  for (const scenario of ["empty", "failed", "permission"]) await runState(browser, fixture, scenario);
} finally {
  await browser.close();
  await fixture.close();
}

const result = {
  ok: true,
  checks,
  evidence,
  generatedAt: new Date().toISOString(),
};
writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
