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

function oversight() {
  return {
    schemaVersion: 1,
    pack: {
      packKey: "econovaria.physical-economy.v1",
      contentVersion: "1.0.0",
      status: "active",
      activatedAt: "2026-08-07T00:00:00.000Z",
      durabilityEnabled: false,
      repairEnabled: false,
    },
    jobs: [],
    effects: [],
    supply: [
      {
        itemKey: "advanced_composite",
        countryCode: "LUM",
        scarcityBand: "constrained",
        availableQuantity: 4,
        reservedQuantity: 2,
        eventMultiplier: 1.25,
        routeMultiplier: 0.8,
        sourceEventKey: "event.route-disruption.001",
        expiresAt: "2026-08-15T00:00:00.000Z",
        version: 3,
      },
    ],
    invariants: {
      negativeOwned: 0,
      negativeReserved: 0,
      reservedAboveOwned: 0,
      reservationProjectionMismatch: 0,
      duplicateOutputGrants: 0,
      repairEnabled: false,
      durabilityEnabled: false,
    },
  };
}

const fixture = await startAdminV2FixtureServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: "dark",
  reducedMotion: "reduce",
});

try {
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

  await page.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const marker = "/functions/v1/web-session-api/proxy";
    const upstreamPath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length) || "/";

    if (!upstreamPath.includes(`/games/${ADMIN_V2_FIXTURE_GAME_ID}/crafting/`)) {
      await route.continue();
      return;
    }

    if (request.method() === "GET" && upstreamPath.endsWith("/crafting/oversight")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: oversight(),
          error: null,
          meta: { requestId: "crafting-supply-read" },
        }),
      });
      return;
    }

    if (request.method() === "POST" && upstreamPath.endsWith("/crafting/supply/advanced_composite")) {
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
          meta: { requestId: "crafting-supply-write" },
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
  await page.locator('.admin-crafting-route[data-admin-v2-state="ready"]')
    .waitFor({ state: "attached", timeout: 10_000 });
  await page.getByRole("heading", { level: 2, name: "Crafting supply" })
    .waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Adjust" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Adjust advanced_composite" })
    .waitFor({ state: "visible" });
  await dialog.getByLabel("Scarcity").selectOption("scarce");
  await dialog.getByLabel("Available quantity").fill("7");
  await dialog.getByLabel("Event multiplier").fill("1.5");
  await dialog.getByLabel("Route multiplier").fill("0.9");
  await dialog.getByRole("button", { name: "Apply supply state" }).click();
  const review = page.getByRole("alertdialog", { name: "Review supply change" });
  await review.waitFor({ state: "visible", timeout: 10_000 });
  await review.getByRole("button", { name: "Apply supply state" }).click();
  await review.waitFor({ state: "detached", timeout: 10_000 });
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  await page.waitForTimeout(50);

  assert.equal(mutations.length, 1, "Crafting supply mutation must execute exactly once.");
  const mutation = mutations[0];
  assert.equal(mutation.headers["x-econovaria-csrf-token"], ADMIN_V2_FIXTURE_CSRF);
  assert.match(
    String(mutation.headers["idempotency-key"] || ""),
    /^admin\.crafting\.supply\.[0-9a-f-]{36}\.\d+$/i,
  );
  assert.equal(mutation.body.idempotencyKey, mutation.headers["idempotency-key"]);
  assert.equal(mutation.body.countryCode, "LUM");
  assert.equal(mutation.body.scarcityBand, "scarce");
  assert.equal(mutation.body.availableQuantity, 7);
  assert.equal(mutation.body.eventMultiplier, 1.5);
  assert.equal(mutation.body.routeMultiplier, 0.9);
  assert.equal(mutation.body.sourceEventKey, "event.route-disruption.001");
  assert.equal(mutation.body.expiresAt, "2026-08-15T00:00:00.000Z");
  assert.deepEqual(browserErrors, []);

  process.stdout.write("Admin V2 Crafting supply browser mutation smoke passed.\n");
} finally {
  await context.close();
  await browser.close();
  await fixture.close();
}
