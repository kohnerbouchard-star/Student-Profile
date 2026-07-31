import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.PLAYER_LOGIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const PLAYER_IDENTIFIER = "RFID:04A1B2C3D4";
const ACCESS_CODE = "PLAYER-4826";
const GAME_CODE = "SMOKE1";
const CSRF_TOKEN = "C".repeat(43);
const PLAYER_STORAGE_KEY = "econovaria.player.auth.v1";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const SESSION_COOKIE = "econovaria_player_session=v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB; Path=/; HttpOnly; SameSite=Strict";

function isJsDelivrRequest(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.hostname === "cdn.jsdelivr.net";
  } catch (_) {
    return false;
  }
}

mkdirSync(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const consoleMessages = [];
const loginRequests = [];
const statusRequests = [];
const proxyRequests = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
page.on("requestfailed", (request) => {
  if (isJsDelivrRequest(request.url())) return;
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

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "http://127.0.0.1:4173",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "apikey, content-type, x-econovaria-device-id, x-econovaria-csrf-token, x-request-id, idempotency-key",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "cache-control": "private, no-store",
    ...extra,
  };
}

function assertBrowserRequestBoundary(request, pathname) {
  const headers = request.headers();
  if (headers.authorization !== undefined) {
    errors.push(`Player browser exposed Authorization on ${request.method()} ${pathname}`);
  }
  if (headers["x-player-session-token"] !== undefined || headers["x-econovaria-player-session-token"] !== undefined) {
    errors.push(`Player browser exposed the retired Player token header on ${request.method()} ${pathname}`);
  }
  if (!headers.apikey) {
    errors.push(`Player browser omitted publishable application identity on ${request.method()} ${pathname}`);
  }
}

const capabilityManifest = {
  ok: true,
  schemaVersion: 1,
  manifestVersion: "2026-07-27.1",
  service: "classroom-api",
  capabilities: {
    routes: {
      dashboard: false,
      news: false,
      market: false,
      portfolio: false,
      business: false,
      contracts: false,
      store: false,
      marketplace: false,
      inventory: false,
      crafting: false,
      banking: false,
      loans: false,
      messages: false,
      progression: false,
      profile: true,
    },
    actions: {
      bankingExport: false,
      bankTransfer: false,
      businessHire: false,
      businessPrice: false,
      businessProduction: false,
      chartRange: false,
      contractAccept: false,
      contractSubmit: false,
      craftItem: false,
      inventoryUse: false,
      loanApply: false,
      loanRepay: false,
      logout: true,
      marketOrder: false,
      marketSearch: false,
      marketWatchlist: false,
      marketplaceCancel: false,
      marketplaceListing: false,
      marketplacePurchase: false,
      messageAttachment: false,
      messageSearch: false,
      messageSend: false,
      notificationsRead: false,
      progressionClaim: false,
      progressionUnlock: false,
      savingsTransfer: false,
      storePurchase: false,
    },
  },
  endpoints: [
    { key: "capabilities", operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }] },
    { key: "logout", operations: [{ method: "POST", pathTemplate: "/players/me/session/logout" }] },
  ],
};

await page.route("**/functions/v1/player-web-session-api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  assertBrowserRequestBoundary(request, pathname);

  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
    return;
  }

  if (request.method() === "POST" && pathname.endsWith("/player-web-session-api/login")) {
    loginRequests.push(request.postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders({ "set-cookie": SESSION_COOKIE }),
      body: JSON.stringify({
        ok: true,
        csrfToken: CSRF_TOKEN,
        session: {
          authenticated: true,
          expiresAt: new Date(Date.now() + 43_200_000).toISOString(),
          absoluteExpiresAt: new Date(Date.now() + 14_400_000).toISOString(),
        },
        gameSession: { name: "Identity Smoke Game", status: "active" },
        player: {
          displayName: "Identity Smoke Player",
          rosterLabel: "GRADE-10-01",
          playerIdentifier: PLAYER_IDENTIFIER,
          status: "active",
        },
      }),
    });
    return;
  }

  if (request.method() === "GET" && pathname.endsWith("/player-web-session-api/status")) {
    statusRequests.push(pathname);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify({
        ok: true,
        csrfToken: CSRF_TOKEN,
        session: {
          authenticated: true,
          expiresAt: new Date(Date.now() + 43_200_000).toISOString(),
          absoluteExpiresAt: new Date(Date.now() + 14_400_000).toISOString(),
        },
        gameSession: { name: "Identity Smoke Game", status: "active" },
        player: {
          displayName: "Identity Smoke Player",
          rosterLabel: "GRADE-10-01",
          playerIdentifier: PLAYER_IDENTIFIER,
          status: "active",
        },
      }),
    });
    return;
  }

  if (request.method() === "GET" && pathname.endsWith("/player-web-session-api/proxy/players/me")) {
    proxyRequests.push(pathname);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
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

  if (request.method() === "GET" && pathname.endsWith("/player-web-session-api/proxy/players/me/capabilities")) {
    proxyRequests.push(pathname);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify(capabilityManifest),
    });
    return;
  }

  await route.fulfill({
    status: 503,
    contentType: "application/json",
    headers: corsHeaders(),
    body: JSON.stringify({
      ok: false,
      error: {
        code: "smoke_route_not_stubbed",
        message: "This identity smoke verifies the Player HttpOnly-session handoff.",
        retryable: false,
      },
    }),
  });
});

await page.route("**/functions/v1/player-api/**", async (route) => {
  errors.push(`Player browser bypassed the HttpOnly BFF: ${route.request().url()}`);
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: { code: "direct_player_authority_forbidden" } }),
  });
});

await page.route("**/functions/v1/classroom-api/**", async (route) => {
  errors.push(`Player browser reached retired classroom authority: ${route.request().url()}`);
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: { code: "retired_player_authority" } }),
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
  if (statusRequests.length !== 1) {
    throw new Error(`Expected exactly one cookie-session status request, received ${statusRequests.length}.`);
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
      readableCookies: document.cookie,
    };
  }, PLAYER_STORAGE_KEY);

  if (
    !handoff.terminalMounted ||
    handoff.legacyShellMounted ||
    handoff.value?.authenticated !== true ||
    handoff.value?.csrfToken !== CSRF_TOKEN ||
    !handoff.value?.sessionExpiresAt ||
    "playerSessionToken" in (handoff.value || {}) ||
    "accessToken" in (handoff.value || {})
  ) {
    throw new Error(`Player Terminal cookie-session handoff is incomplete: ${JSON.stringify(handoff)}.`);
  }

  if (UUID_PATTERN.test(handoff.raw || "")) {
    throw new Error("Player login handoff persisted an internal UUID in browser storage.");
  }
  if (/econovaria_player_session|session_token|ps_identity/i.test(handoff.readableCookies || "")) {
    throw new Error("Player session credential became browser-readable through document.cookie.");
  }

  writeFileSync(`${ARTIFACT_DIR}/player-login-identity-runtime.json`, JSON.stringify({
    formState,
    loginRequests,
    statusRequests,
    proxyRequests,
    handoff: {
      href: handoff.href,
      terminalMounted: handoff.terminalMounted,
      legacyShellMounted: handoff.legacyShellMounted,
      authenticated: handoff.value?.authenticated === true,
      hasCsrf: handoff.value?.csrfToken === CSRF_TOKEN,
      hasExpiry: Boolean(handoff.value?.sessionExpiresAt),
      hasBrowserToken: Boolean(handoff.value?.playerSessionToken || handoff.value?.accessToken),
      containsUuid: UUID_PATTERN.test(handoff.raw || ""),
      readableSessionCookie: /econovaria_player_session/i.test(handoff.readableCookies || ""),
    },
    errors,
    consoleMessages,
  }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/player-login-identity.png`, fullPage: true });

  if (errors.length) throw new Error(errors[0]);
  console.log("Player Game Code + Player ID + Access Code → HttpOnly Player Terminal handoff smoke passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/player-login-identity-runtime.json`, JSON.stringify({
    loginRequests,
    statusRequests,
    proxyRequests,
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
