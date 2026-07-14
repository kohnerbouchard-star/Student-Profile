import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.PLAYER_LOGIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const GAME_ID = "00000000-0000-4000-8000-000000000101";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000102";
const PLAYER_IDENTIFIER = "RFID:04A1B2C3D4";
const ACCESS_CODE = "PLAYER-4826";
const GAME_CODE = "SMOKE1";

mkdirSync(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const consoleMessages = [];
const loginRequests = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
page.on("requestfailed", (request) => {
  if (request.url().includes("cdn.jsdelivr.net")) return;
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
});

await page.route("https://cdn.jsdelivr.net/**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.supabase = window.supabase || {};",
  });
});

await page.route("**/functions/v1/classroom-api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;

  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-player-session-token",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
      body: "",
    });
    return;
  }

  if (request.method() === "POST" && pathname.endsWith("/players/login")) {
    loginRequests.push(request.postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        ok: true,
        gameSession: { id: GAME_ID, name: "Identity Smoke Game", status: "active" },
        player: {
          id: PLAYER_UUID,
          displayName: "Identity Smoke Player",
          rosterLabel: "GRADE-10-01",
          playerIdentifier: PLAYER_IDENTIFIER,
          status: "active",
        },
        session: {
          token: "ps_identity_smoke_session_token",
          status: "active",
          expiresAt: new Date(Date.now() + 43_200_000).toISOString(),
        },
      }),
    });
    return;
  }

  if (request.method() === "GET" && pathname.endsWith("/players/me")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        ok: true,
        gameSession: { id: GAME_ID, name: "Identity Smoke Game", status: "active" },
        player: {
          id: PLAYER_UUID,
          displayName: "Identity Smoke Player",
          rosterLabel: "GRADE-10-01",
          playerIdentifier: PLAYER_IDENTIFIER,
          status: "active",
        },
        availableActions: [],
        accountBalances: [],
        inventory: [],
        holdings: [],
      }),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify({
      ok: true,
      gameSession: { id: GAME_ID, name: "Identity Smoke Game", status: "active" },
      player: {
        id: PLAYER_UUID,
        displayName: "Identity Smoke Player",
        rosterLabel: "GRADE-10-01",
        playerIdentifier: PLAYER_IDENTIFIER,
        status: "active",
      },
      dashboard: {},
      balances: [],
      holdings: [],
      inventory: [],
      activity: [],
    }),
  });
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#playerForm", { timeout: 15_000 });

  const formState = await page.evaluate(() => {
    const playerId = document.getElementById("playerId");
    const accessCode = document.getElementById("playerAccessCode");
    return {
      playerPlaceholder: playerId?.getAttribute("placeholder") || "",
      playerRequired: Boolean(playerId?.required),
      accessDisabled: Boolean(accessCode?.disabled),
      accessRequired: Boolean(accessCode?.required),
      accessPlaceholder: accessCode?.getAttribute("placeholder") || "",
      accessLabel: accessCode?.closest("label")?.querySelector("span")?.textContent?.trim() || "",
    };
  });

  if (
    !formState.playerRequired ||
    formState.accessDisabled ||
    !formState.accessRequired ||
    formState.accessLabel !== "Access Code"
  ) {
    throw new Error(`Player login form is not using the three-part identity contract: ${JSON.stringify(formState)}.`);
  }

  await page.locator("#gameCode").fill(GAME_CODE);
  await page.locator("#playerId").fill(PLAYER_IDENTIFIER);
  await page.locator("#playerAccessCode").fill(ACCESS_CODE);
  await page.locator("#playerForm button[type='submit']").click();

  await page.waitForFunction(() => document.getElementById("appShell")?.classList.contains("hidden") === false, null, {
    timeout: 10_000,
  });

  if (loginRequests.length !== 1) {
    throw new Error(`Expected exactly one login request, received ${loginRequests.length}.`);
  }

  const login = loginRequests[0];
  if (
    login.gameJoinCode !== GAME_CODE ||
    login.playerIdentifier !== PLAYER_IDENTIFIER ||
    login.accessCode !== ACCESS_CODE ||
    "studentCode" in login ||
    "playerUuid" in login
  ) {
    throw new Error(`Player login sent the wrong identity contract: ${JSON.stringify(login)}.`);
  }

  const identity = await page.evaluate(() => ({
    name: document.getElementById("identityName")?.textContent?.trim() || "",
    meta: document.getElementById("identityMeta")?.textContent?.trim() || "",
  }));

  writeFileSync(`${ARTIFACT_DIR}/player-login-identity-runtime.json`, JSON.stringify({
    formState,
    loginRequests,
    identity,
    errors,
    consoleMessages,
  }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/player-login-identity.png`, fullPage: true });

  if (errors.length) throw new Error(errors[0]);
  console.log("Player Game Code + Player ID + Access Code smoke passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/player-login-identity-runtime.json`, JSON.stringify({
    loginRequests,
    errors,
    consoleMessages,
  }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/player-login-identity-failure.png`, fullPage: true });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
