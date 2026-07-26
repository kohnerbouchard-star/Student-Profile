import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4321;
const origin = `http://127.0.0.1:${port}`;
const API_BASE = `${origin}/functions/v1/web-session-api`;
const INITIAL_CSRF = "A".repeat(43);
const ELEVATED_CSRF = "B".repeat(43);
const FACTOR_HANDLE = `mfa1.${"C".repeat(16)}.${"D".repeat(64)}`;
const GAME_ID = "11111111-1111-4111-8111-111111111111";
const QR_CODE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const SECRET = "JBSWY3DPEHPK3PXP";

const server = spawn(
  "python3",
  ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", root],
  { stdio: ["ignore", "pipe", "pipe"] },
);

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15_000;
    const probe = () => {
      const request = http.get(`${origin}/`, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else if (Date.now() > deadline) reject(new Error("Static server did not become ready."));
        else setTimeout(probe, 120);
      });
      request.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Static server did not start."));
        else setTimeout(probe, 120);
      });
    };
    probe();
  });
}

function sessionBody(assuranceLevel, csrfToken) {
  return {
    ok: true,
    session: {
      authenticated: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      assuranceLevel,
      mfaRequired: true,
    },
    user: {
      id: "22222222-2222-4222-8222-222222222222",
      email: "admin@example.test",
      displayName: "MFA Administrator",
      role: "game_admin",
      permissionVersion: 1,
      securityVersion: 1,
    },
    activeGameSessions: [{
      id: GAME_ID,
      name: "MFA Test Game",
      status: "active",
    }],
    csrfToken,
  };
}

function assertPublicRequest(request, { csrf = "" } = {}) {
  const headers = request.headers();
  assert.equal(headers.authorization, undefined, `${request.url()} exposed Authorization.`);
  assert.equal(headers.apikey, "sb_publishable_admin_mfa_browser_test");
  assert.match(headers["x-econovaria-device-id"] || "", /^[0-9a-f-]{36}$/i);
  if (csrf) assert.equal(headers["x-econovaria-csrf-token"], csrf);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const browserErrors = [];
  const requests = [];
  let loggedIn = false;

  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  await page.route("**/runtime-config.env.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.__ECONOVARIA_RUNTIME_CONFIG__=Object.freeze({environment:"staging",projectRef:"eecvbssdvarfcykcfrny",supabaseUrl:"https://eecvbssdvarfcykcfrny.supabase.co",apiProxyUrl:"${origin}",supabasePublishableKey:"sb_publishable_admin_mfa_browser_test"});`,
  }));

  await page.route(`${API_BASE}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push({ method: request.method(), pathname, headers: request.headers() });

    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "apikey,content-type,x-econovaria-csrf-token,x-econovaria-device-id",
        },
        body: "",
      });
      return;
    }

    const commonHeaders = {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "cache-control": "private, no-store",
      "content-type": "application/json",
    };

    if (pathname.endsWith("/login")) {
      assertPublicRequest(request);
      const body = request.postDataJSON();
      assert.equal(body.email, "admin@example.test");
      assert.equal(body.password, "SecurePassword123!");
      loggedIn = true;
      await route.fulfill({
        status: 200,
        headers: {
          ...commonHeaders,
          "set-cookie": "econovaria_admin_session=v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB; Path=/; HttpOnly; SameSite=Strict",
        },
        body: JSON.stringify(sessionBody("aal1", INITIAL_CSRF)),
      });
      return;
    }

    if (pathname.endsWith("/status")) {
      assertPublicRequest(request);
      if (!loggedIn) {
        await route.fulfill({
          status: 401,
          headers: commonHeaders,
          body: JSON.stringify({
            ok: false,
            error: {
              code: "staff_session_missing",
              message: "Administrator sign-in is required.",
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: commonHeaders,
        body: JSON.stringify(sessionBody("aal1", INITIAL_CSRF)),
      });
      return;
    }

    if (pathname.endsWith("/mfa")) {
      assertPublicRequest(request);
      assert.equal(loggedIn, true);
      await route.fulfill({
        status: 200,
        headers: commonHeaders,
        body: JSON.stringify({
          ok: true,
          assuranceLevel: "aal1",
          nextAssuranceLevel: "aal2",
          needsEnrollment: true,
          factors: [],
        }),
      });
      return;
    }

    if (pathname.endsWith("/mfa/enroll")) {
      assertPublicRequest(request, { csrf: INITIAL_CSRF });
      assert.equal(request.postDataJSON().friendlyName, "Econovaria Admin");
      await route.fulfill({
        status: 201,
        headers: commonHeaders,
        body: JSON.stringify({
          ok: true,
          factor: {
            handle: FACTOR_HANDLE,
            type: "totp",
            status: "unverified",
            friendlyName: "Econovaria Admin",
            qrCode: QR_CODE,
            secret: SECRET,
            uri: "otpauth://totp/Econovaria:admin@example.test?secret=JBSWY3DPEHPK3PXP",
          },
        }),
      });
      return;
    }

    if (pathname.endsWith("/mfa/verify")) {
      assertPublicRequest(request, { csrf: INITIAL_CSRF });
      const body = request.postDataJSON();
      assert.equal(body.factorHandle, FACTOR_HANDLE);
      assert.equal(body.code, "123456");
      await route.fulfill({
        status: 200,
        headers: {
          ...commonHeaders,
          "set-cookie": "econovaria_admin_session=v1.EEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF; Path=/; HttpOnly; SameSite=Strict",
        },
        body: JSON.stringify({
          ...sessionBody("aal2", ELEVATED_CSRF),
          verified: true,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: commonHeaders,
      body: JSON.stringify({ ok: false, error: { code: "route_not_found" } }),
    });
  });

  await page.goto(`${origin}/?mode=admin&mfa-smoke=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#adminEmail").fill("admin@example.test");
  await page.locator("#adminAccessCode").fill("SecurePassword123!");
  await page.locator("#adminForm button[type='submit']").click();

  const dialog = page.locator(".econovaria-mfa-dialog");
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  assert.equal(await page.locator(".econovaria-mfa-secret").textContent(), SECRET);
  assert.equal(await page.locator(".econovaria-mfa-qr").getAttribute("src"), QR_CODE);

  await page.locator(".econovaria-mfa-code").fill("123456");
  await page.locator(".econovaria-mfa-submit").click();
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  await page.locator("#adminGamesStep:not(.hidden)").waitFor({ state: "visible" });
  assert.match(await page.locator("#adminGameList").textContent(), /MFA Test Game/);

  const storage = await page.evaluate(() => ({
    admin: sessionStorage.getItem("econovaria.admin.auth.v1"),
    player: sessionStorage.getItem("econovaria.player.auth.v1"),
    all: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  const serializedStorage = JSON.stringify(storage);
  assert.equal(serializedStorage.includes("accessToken"), false);
  assert.equal(serializedStorage.includes("refreshToken"), false);
  assert.equal(serializedStorage.includes("SecurePassword123!"), false);
  assert.equal(serializedStorage.includes(SECRET), false);
  assert.equal(serializedStorage.includes(FACTOR_HANDLE), false);

  const paths = requests
    .filter((entry) => entry.method !== "OPTIONS")
    .map((entry) => entry.pathname);
  assert.equal(paths[0], "/functions/v1/web-session-api/status");
  assert.deepEqual(paths.slice(-5), [
    "/functions/v1/web-session-api/login",
    "/functions/v1/web-session-api/status",
    "/functions/v1/web-session-api/mfa",
    "/functions/v1/web-session-api/mfa/enroll",
    "/functions/v1/web-session-api/mfa/verify",
  ]);
  assert.deepEqual(browserErrors, []);
  console.log("Admin password login, TOTP enrollment, AAL2 elevation, and browser secrecy smoke passed.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
