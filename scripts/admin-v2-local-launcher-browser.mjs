import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  ADMIN_V2_FIXTURE_GAME_ID as selectedGameId,
  ADMIN_V2_FIXTURE_LONG_GAME_NAME as selectedGameName,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const gateway = "http://127.0.0.1:4173";
const sessionPath = "/functions/v1/web-session-api";
const fixtureEmail = "local-launcher@example.test";
const fixturePassword = "local-browser-fixture-placeholder";
const fixtureKey = "sb_publishable_local_launcher_" + randomUUID();
const cookie = "v1." + Buffer.alloc(12, 1).toString("base64url")
  + "." + Buffer.alloc(18, 2).toString("base64url");
const localCookie = "econovaria_admin_session";
const scanPath = `${sessionPath}/proxy/games/${selectedGameId}/attendance/scan`;
const screenCard = "SYNTHETIC-LAUNCHER-CARD";
const fixtureDevice = "c0000000-0000-4000-8000-000000000001";
const legacyScripts = new Set([
  "classroom-write-fallback.js", "create-action-adapter.js",
  "scanner-auto-refresh.js", "scanner-reward-localization.js", "scanner-lifecycle-settle.js",
]);
const decoy = { id: "10000000-0000-4000-8000-000000000003", name: "Not selected", status: "active" };

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

function fixedFixtureReadPath({ pathname, search }) {
  switch (pathname) {
    case `${sessionPath}/proxy/session/bootstrap`:
      return search === "" ? `${sessionPath}/proxy/session/bootstrap` : null;
    case `${sessionPath}/proxy/games`:
      return search === "" ? `${sessionPath}/proxy/games` : null;
    case `${sessionPath}/proxy/notifications`:
      return search === "?scope=admin-console" ? `${sessionPath}/proxy/notifications?scope=admin-console` : null;
    case `${sessionPath}/proxy/games/${selectedGameId}/lifecycle`:
      return search === "" ? `${sessionPath}/proxy/games/${selectedGameId}/lifecycle` : null;
    case `${sessionPath}/proxy/games/${selectedGameId}/dashboard`:
      return search === "" ? `${sessionPath}/proxy/games/${selectedGameId}/dashboard` : null;
    case `${sessionPath}/proxy/games/${selectedGameId}/store/items`:
      return search === "?include=stock,prices,purchaseStats"
        ? `${sessionPath}/proxy/games/${selectedGameId}/store/items?include=stock,prices,purchaseStats`
        : null;
    case `${sessionPath}/proxy/games/${selectedGameId}/attendance/today`:
      return search === "" ? `${sessionPath}/proxy/games/${selectedGameId}/attendance/today` : null;
    default:
      return null;
  }
}

async function startUpstream(backendOrigin, requests) {
  const fixture = createAdminV2FixtureSession();
  const { user, csrfToken, assuranceLevel, mfaRequired, expiresAt, absoluteExpiresAt } = fixture;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const signed = ["timestamp", "nonce", "client-ip", "signature", "mode"]
      .every((key) => req.headers["x-econovaria-bff-" + key])
      && req.headers["x-econovaria-bff-mode"] === "local";
    const hasSession = String(req.headers.cookie || "").split(/;\s*/).includes(localCookie + "=" + cookie);
    const game = req.headers["x-econovaria-game-id"];
    const event = { path: url.pathname, method: req.method, signed, hasSession, game };
    requests.push(event);
    try {
      if (url.pathname === "/rest/v1/rpc/game_provisioning_preflight_v1"
          && req.method === "POST" && req.headers.apikey === "local-launcher-fixture") {
        json(res, 200, { ready: true, packId: "econovaria.beta-seed-pack.v1" });
      } else if (url.pathname === sessionPath + "/login" && req.method === "POST" && signed) {
        const body = await readJson(req);
        if (body.email !== fixtureEmail || body.password !== fixturePassword) {
          return json(res, 401, { code: "invalid_fixture_login" });
        }
        json(res, 200, { ok: true }, {
          "set-cookie": `__Host-${localCookie}=${cookie}; Path=/; Secure; HttpOnly; SameSite=Strict`,
        });
      } else if (url.pathname === sessionPath + "/status" && req.method === "GET" && signed && hasSession) {
        json(res, 200, {
          ok: true, session: { authenticated: true, assuranceLevel, mfaRequired, expiresAt, absoluteExpiresAt },
          user, csrfToken, activeGameSessions: [decoy, ...fixture.activeGameSessions],
        });
      } else if (url.pathname === scanPath && req.method === "POST") {
        const body = await readJson(req);
        const bootstrapped = requests.some((prior) => prior.path === sessionPath + "/proxy/session/bootstrap"
          && prior.game === selectedGameId && prior.signed && prior.hasSession);
        event.valid = signed && hasSession && game === selectedGameId && bootstrapped && url.search === ""
          && req.headers["x-econovaria-csrf-token"] === csrfToken
          && typeof req.headers["x-econovaria-device-id"] === "string"
          && /^[0-9a-f-]{36}$/u.test(req.headers["x-econovaria-device-id"])
          && /^admin\.attendance\.scan\.[0-9a-f-]{36}\.1$/u.test(req.headers["idempotency-key"] || "")
          && !req.headers.authorization
          && Object.keys(body ?? {}).sort().join(",") === "deviceTimezone,playerId"
          && body.playerId === screenCard && typeof body.deviceTimezone === "string" && body.deviceTimezone.length > 0
          && requests.filter((entry) => entry.method === "POST" && entry.path === scanPath).length === 1;
        if (!event.valid) return json(res, 403, { code: "invalid_fixture_scan" });
        json(res, 200, { data: {
          player: { displayName: "Synthetic Player" },
          attendance: { status: "present", wasCreated: true },
          reward: { amount: 4, currencyCode: "ECO" },
        } });
      } else if (req.method === "GET" && signed && hasSession && game === selectedGameId) {
        // Request values only select a known fixture read; they never build its URL.
        const fixturePath = fixedFixtureReadPath(url);
        if (fixturePath === null) return json(res, 403, { code: "unexpected_fixture_request" });
        const result = await fetch(backendOrigin + fixturePath, { redirect: "error" });
        res.writeHead(result.status, { "content-type": result.headers.get("content-type") ?? "application/json" });
        res.end(Buffer.from(await result.arrayBuffer()));
      } else {
        json(res, 403, { code: "unexpected_fixture_request" });
      }
    } catch {
      json(res, 500, { code: "fixture_failure" });
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    }),
  };
}

async function launcherEnvironment(dir, upstream) {
  const executable = (name, content) => writeFile(path.join(dir, name), content, { mode: 0o700 });
  await executable("npx", `#!/bin/sh
case "$*" in
  "supabase start --workdir backend") exit 0 ;;
  "supabase status -o env --workdir backend")
    printf '%s\\n' 'API_URL=${upstream}' 'PUBLISHABLE_KEY=${fixtureKey}' 'SECRET_KEY=local-launcher-fixture'
    ;;
  *) exit 97 ;;
esac
`);
  await executable("psql", "#!/bin/sh\nexit 98\n");
  await executable("fixture-browser-open", "#!/bin/sh\nexit 0\n");
  await executable("script-shell", `#!/bin/sh
export PATH="${dir}:$PATH"
exec /bin/sh "$@"
`);
  return {
    PATH: `${dir}:${process.env.PATH}`,
    HOME: dir,
    BROWSER: path.join(dir, "fixture-browser-open"),
    npm_config_script_shell: path.join(dir, "script-shell"),
    npm_config_offline: "true",
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

async function waitForGateway(child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(child.exitCode, null, "The npm launcher exited before gateway readiness.");
    try {
      const result = await fetch(gateway + "/runtime-config.env.js", { signal: AbortSignal.timeout(300) });
      if (result.ok && (await result.text()).includes(fixtureKey)) return;
    } catch { /* The child may still be starting. */ }
    await delay(100);
  }
  assert.fail("The npm launcher did not serve its synthetic runtime configuration.");
}

function assertGameJourney(requests) {
  const bootstrap = requests.filter((event) => event.path === sessionPath + "/proxy/session/bootstrap");
  assert.ok(bootstrap.length > 0 && bootstrap.every((event) => event.game === selectedGameId
    && event.signed && event.hasSession), "Expected only signed same-game bootstraps after sign-in.");
  assert.ok(requests.some((event) => event.path === `${sessionPath}/proxy/games/${selectedGameId}/dashboard`
    && event.signed && event.hasSession));
  assert.ok(!requests.some((event) => event.game === decoy.id || event.path.includes(decoy.id)));
}

function assertSingleScannerSubmission(requests) {
  const writes = requests.filter((event) => event.path.startsWith(sessionPath + "/proxy/") && event.method === "POST");
  assert.deepEqual(writes, [{
    path: scanPath, method: "POST", signed: true, hasSession: true, game: selectedGameId, valid: true,
  }], "Exactly one authenticated, selected-game synthetic write must reach the scanner fixture.");
}

async function verifyHttpJourney(requests) {
  const base = gateway + sessionPath;
  const headers = { apikey: fixtureKey };
  const login = await fetch(base + "/login", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ email: fixtureEmail, password: fixturePassword }),
    redirect: "error",
  });
  assert.equal(login.status, 200);
  const sessionCookie = login.headers.get("set-cookie");
  assert.match(sessionCookie, /^econovaria_admin_session=v1\..*; HttpOnly; SameSite=Strict$/u);
  const signedSession = { ...headers, cookie: sessionCookie.split(";")[0] };
  const status = await fetch(base + "/status", { headers: signedSession, redirect: "error" });
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.deepEqual(statusBody.activeGameSessions.map((game) => game.id), [decoy.id, selectedGameId]);
  const scoped = { ...signedSession, "x-econovaria-game-id": selectedGameId };
  for (const path of [
    `/proxy/games/${selectedGameId}/dashboard?view=unknown`,
    "/proxy/notifications?scope=other",
    `/proxy/games/${selectedGameId}/players`,
  ]) {
    const denied = await fetch(base + path, { headers: scoped, redirect: "error" });
    assert.equal(denied.status, 403, `The fixture must reject an undeclared read: ${path}`);
  }
  const bootstrap = await fetch(base + "/proxy/session/bootstrap", { headers: scoped, redirect: "error" });
  assert.equal(bootstrap.status, 200);
  assert.equal((await bootstrap.json()).data.activeGame.id, selectedGameId);
  const dashboard = await fetch(base + `/proxy/games/${selectedGameId}/dashboard`, { headers: scoped, redirect: "error" });
  assert.equal(dashboard.status, 200);
  const attendance = await fetch(base + `/proxy/games/${selectedGameId}/attendance/today`, {
    headers: scoped, redirect: "error",
  });
  assert.equal(attendance.status, 200);
  const scan = await fetch(gateway + scanPath, {
    method: "POST",
    headers: {
      ...scoped, "content-type": "application/json", "x-econovaria-csrf-token": statusBody.csrfToken,
      "x-econovaria-device-id": fixtureDevice, "idempotency-key": `admin.attendance.scan.${randomUUID()}.1`,
    },
    body: JSON.stringify({ playerId: screenCard, deviceTimezone: "Asia/Seoul" }),
    redirect: "error",
  });
  assert.equal(scan.status, 200);
  assert.deepEqual((await scan.json()).data.reward, { amount: 4, currencyCode: "ECO" });
  assertGameJourney(requests);
  assertSingleScannerSubmission(requests);
}

async function verifyBrowser(requests) {
  const { chromium } = await import("playwright");
  const executablePath = process.env.ADMIN_LOCAL_BROWSER_EXECUTABLE;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", (route) => new URL(route.request().url()).origin === gateway
      ? route.continue()
      : route.abort("blockedbyclient"));
    const page = await context.newPage();
    const pageErrors = [];
    const requestedPaths = new Set();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => requestedPaths.add(new URL(request.url()).pathname));
    await page.goto(gateway + "/", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.getByRole("tab", { name: "Admin", exact: true }).click({ timeout: 10_000 });
    await page.locator("#adminEmail").fill(fixtureEmail, { timeout: 10_000 });
    await page.locator("#adminAccessCode").fill(fixturePassword, { timeout: 10_000 });
    await page.getByRole("button", { name: "Admin Login", exact: true }).click({ timeout: 10_000 });
    await page.getByRole("button", { name: /Not selected/ }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: new RegExp(selectedGameName) }).click({ timeout: 10_000 });
    await page.waitForURL((url) => url.origin === gateway && url.pathname === "/admin/"
      && url.searchParams.get("game") === selectedGameId, { timeout: 10_000 });
    await page.locator('body[data-admin-ui-version="2"] #adminPreview').waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#adminSessionGate").waitFor({ state: "detached", timeout: 10_000 });
    await page.getByRole("heading", { level: 1, name: "Overview", exact: true }).waitFor({ timeout: 10_000 });
    await page.locator('[data-admin-v2-state="ready"]').first().waitFor({ state: "visible", timeout: 10_000 });
    const stored = (await context.cookies(gateway)).find((entry) => entry.name === localCookie);
    assert.equal(stored?.httpOnly, true, "Local session must remain HttpOnly.");
    assert.equal(await page.evaluate((name) => document.cookie.includes(name), localCookie), false);
    await page.locator('.admin-navigation__link[data-route="attendance"]').click({ timeout: 10_000 });
    const scanner = page.getByRole("region", { name: "Attendance scanner", exact: true });
    const input = scanner.getByLabel("RFID / scanner input", { exact: true });
    await input.fill(screenCard, { timeout: 10_000 });
    await input.press("Enter", { timeout: 10_000 });
    const scanStatus = scanner.getByRole("status");
    await scanStatus.getByText("Synthetic Player checked in.", { exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    assert.match(await scanStatus.innerText(), /present · Reward 4 ECO/u);
    await scanner.locator("#adminAttendanceScannerInput:not(:disabled)")
      .waitFor({ state: "visible", timeout: 10_000 });
    const afterScan = new URL(page.url());
    assert.equal(afterScan.pathname, "/admin/");
    assert.equal(afterScan.searchParams.get("game"), selectedGameId);
    assert.equal(afterScan.hash, "#attendance");
    for (const scriptPath of ["/admin/v2/src/main.js", "/admin/v2/src/routes/attendance/AttendanceScannerPanel.js"]) {
      assert.ok(requestedPaths.has(scriptPath), `Expected native Admin request for ${scriptPath}`);
    }
    assert.deepEqual([...requestedPaths].filter((url) => legacyScripts.has(path.posix.basename(url))), []);
    assert.deepEqual(pageErrors, [], "The real login and mounted Admin scripts must not throw.");
    assertGameJourney(requests);
    assertSingleScannerSubmission(requests);
  } finally {
    await browser.close();
  }
}

async function main() {
  // Never run the fixture against a pre-existing local server.
  const probe = createServer();
  probe.listen(4173, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolve) => probe.close(resolve));

  const dir = await mkdtemp(path.join(tmpdir(), "econovaria-admin-launcher-"));
  const requests = [];
  const config = path.join(root, "runtime-config.env.js");
  const getConfig = () => readFile(config).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const previous = await getConfig();
  let backend, upstream, child, exited;
  try {
    backend = await startAdminV2FixtureServer();
    upstream = await startUpstream(backend.origin, requests);
    child = spawn("npm", ["run", "dev:local"], {
      cwd: root, env: await launcherEnvironment(dir, upstream.url), detached: true, stdio: "ignore",
    });
    exited = once(child, "exit");
    await waitForGateway(child);
    const route = `/admin/?game=${selectedGameId}`;
    const document = await fetch(gateway + route, { redirect: "error" });
    assert.equal(document.status, 200);
    assert.match(await document.text(), /<meta name="econovaria-admin-ui-version" content="2"/u);
    assert.equal(requests.filter((event) => event.path.endsWith("game_provisioning_preflight_v1")).length, 1);
    if (process.argv.includes("--http-only")) {
      await verifyHttpJourney(requests);
      console.log("Synthetic npm launcher HTTP journey passed: readiness, V2 document, signed login, status, and selected-game Overview and scanner (browser not run).");
    } else {
      await verifyBrowser(requests);
      console.log("Synthetic npm launcher browser journey passed: login, game selection, and Admin V2 Attendance scanner.");
    }
  } finally {
    try {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        // Stop only the process group created for this run, including Python's normal cleanup.
        try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
        await exited;
      }
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (Buffer.compare((await getConfig()) ?? Buffer.alloc(0), previous ?? Buffer.alloc(0)) === 0) break;
        await delay(50);
      }
      assert.deepEqual(await getConfig(), previous, "The launcher must restore its temporary runtime config.");
    } finally {
      await upstream?.close();
      await backend?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
}

await main();
