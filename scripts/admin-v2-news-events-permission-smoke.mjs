import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { chromium } from "playwright";

import {
  ADMIN_V2_FIXTURE_ADMIN_ID,
  ADMIN_V2_FIXTURE_GAME_ID,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_ID = "a0000000-0000-4000-8000-00000000000a";
const PRIVATE_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

const fixture = await startAdminV2FixtureServer();
const browser = await chromium.launch({ headless: true });
const runId = randomUUID();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: "dark" });
const browserErrors = [];

try {
  await context.addCookies([
    { name: "admin-v2-scenario", value: "ready", url: fixture.origin, sameSite: "Lax" },
    { name: "admin-v2-run", value: runId, url: fixture.origin, sameSite: "Lax" },
  ]);

  const baseSession = createAdminV2FixtureSession("ready");
  const deniedSession = {
    ...baseSession,
    permissions: baseSession.permissions.filter((permission) => permission !== "world.manage"),
  };
  await context.addInitScript(({ sessionKey, deviceKey, sessionValue, deviceId }) => {
    window.sessionStorage.setItem(sessionKey, JSON.stringify(sessionValue));
    window.localStorage.setItem(deviceKey, deviceId);
  }, {
    sessionKey: SESSION_STORAGE_KEY,
    deviceKey: DEVICE_STORAGE_KEY,
    sessionValue: deniedSession,
    deviceId: DEVICE_ID,
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  await page.goto(`${fixture.origin}/admin/v2.html?game=${encodeURIComponent(ADMIN_V2_FIXTURE_GAME_ID)}#news-events`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await page.getByRole("heading", { name: "News & Events access restricted" }).waitFor({
    state: "visible",
    timeout: 10_000,
  });

  assert.equal(await page.locator(".admin-news-events").count(), 0);
  assert.equal(
    fixture.requestsFor(runId).filter((entry) => entry.pathname.includes("/world/campaign")).length,
    0,
    "world.manage denial must occur before any News & Events read",
  );

  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, PRIVATE_UUID_PATTERN);
  assert.equal(body.includes(ADMIN_V2_FIXTURE_GAME_ID), false);
  assert.equal(body.includes(ADMIN_V2_FIXTURE_ADMIN_ID), false);

  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(overflow.document <= overflow.viewport + 1, `document overflow: ${JSON.stringify(overflow)}`);
  assert.ok(overflow.body <= overflow.viewport + 1, `body overflow: ${JSON.stringify(overflow)}`);
  assert.deepEqual(browserErrors, []);

  process.stdout.write(`${JSON.stringify({
    route: "#news-events",
    permission: "world.manage",
    permissionDeniedBeforeRead: true,
    privateUuidExposed: false,
    browserErrors: 0,
  }, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
  await fixture.close();
}
