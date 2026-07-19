import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.PLAYER_LOGIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const PLAYER_IDENTIFIER = "RFID:04A1B2C3D4";
const ACCESS_CODE = "PLAYER-4826";
const GAME_CODE = "SMOKE1";
const PLAYER_SESSION_TOKEN = "ps_identity_smoke_session_token";
const PLAYER_STORAGE_KEY = "econovaria.player.auth.v1";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

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
  const failure = request.failure()?.errorText || "";
  if (request.resourceType() === "media" && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
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
        gameSession: { name: "Identity Smoke Game", status: "active" },
        player: {
          displayName: "Identity Smoke Player",
          rosterLabel: "GRADE-10-01",
          playerIdentifier: PLAYER_IDENTIFIER,
          status: "active",
        },
        session: {
          token: PLAYER_SESSION_TOKEN,
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
        gameSession: { name: "Identity Smoke Game", status: "active" },
        player: {
          displayName: "Identity Smoke Player",
          rosterLabel: "GRADE-10-01",
          playerIdentifier: PLAYER_IDENTIFIER,
          status: "active",
        },
        session: {
          status: "active",
          expiresAt: new Date(Date.now() + 43_200_000).toISOString(),
        },
        balances: [],
        attendance: { status: "not_configured" },
        availableActions: ["dashboard.view"],
      }),
    });
    return;
  }

  await route.fulfill({
    status: 503,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify({
      ok: false,
      error: {
        code: "smoke_route_not_stubbed",
        message: "This identity smoke only verifies the authenticated Player Terminal handoff.",
        retryable: false,
      },
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

  await page.waitForURL("**/player-terminal/", { timeout: 10_000 });
  await page.waitForSelector("#playerTerminal", { timeout: 10_000 });

  if (loginRequests.length !== 1) {
    throw new Error(`Expected exactly one login request, received ${loginRequests.length}.`);
  }

  const login = loginRequests[0];
  if (
    login.gameJoinCode !== GAME_CODE ||
    login.playerIdentifier !== PLAYER_IDENTIFIER ||
    login.accessCode !== ACCESS_CODE ||
    "studentCode" in login ||
    "playerUuid" in login ||
    "gameSessionId" in login
  ) {
    throw new Error(`Player login sent the wrong identity contract: ${JSON.stringify(login)}.`);
  }

  const handoff = await page.evaluate((storageKey) => {
    const raw = sessionStorage.getItem(storageKey);
    return {
      raw,
      value: raw ? JSON.parse(raw) : null,
      href: location.href,
      terminalMounted: Boolean(document.getElementById("playerTerminal")),
      legacyShellMounted: Boolean(document.getElementById("appShell")),
    };
  }, PLAYER_STORAGE_KEY);

  if (
    !handoff.terminalMounted ||
    handoff.legacyShellMounted ||
    handoff.value?.playerSessionToken !== PLAYER_SESSION_TOKEN ||
    !handoff.value?.sessionExpiresAt
  ) {
    throw new Error(`Player Terminal handoff is incomplete: ${JSON.stringify(handoff)}.`);
  }

  if (UUID_PATTERN.test(handoff.raw || "")) {
    throw new Error("Player login handoff persisted an internal UUID in browser storage.");
  }

  writeFileSync(`${ARTIFACT_DIR}/player-login-identity-runtime.json`, JSON.stringify({
    formState,
    loginRequests,
    handoff: {
      href: handoff.href,
      terminalMounted: handoff.terminalMounted,
      legacyShellMounted: handoff.legacyShellMounted,
      hasOpaqueSessionToken: handoff.value?.playerSessionToken === PLAYER_SESSION_TOKEN,
      hasExpiry: Boolean(handoff.value?.sessionExpiresAt),
      containsUuid: UUID_PATTERN.test(handoff.raw || ""),
    },
    errors,
    consoleMessages,
  }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/player-login-identity.png`, fullPage: true });

  if (errors.length) throw new Error(errors[0]);
  console.log("Player Game Code + Player ID + Access Code → Player Terminal handoff smoke passed.");
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
