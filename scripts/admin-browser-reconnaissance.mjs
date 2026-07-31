#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./admin-browser-reconnaissance-core.mjs", import.meta.url);
const SOURCE_DIRECTORY = new URL("./", import.meta.url);

function replaceExactlyOnce(source, label, before, after) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${occurrences}.`);
  }
  return source.replace(before, after);
}

function replaceSection(source, label, startNeedle, endNeedle, replacement) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start < 0 || end <= start) {
    throw new Error(`${label} could not resolve its canonical boundaries.`);
  }
  return `${source.slice(0, start)}${replacement}\n${source.slice(end)}`;
}

function parseSupabaseStatusEnv(sourceText) {
  const values = {};
  for (const line of String(sourceText || "").split(/\r?\n/u)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    }
    values[match[1]] = value;
  }
  return values;
}

async function executeLocalFile(command, args, options = {}) {
  const [{ execFile }, { promisify }] = await Promise.all([
    import("node:child_process"),
    import("node:util"),
  ]);
  return promisify(execFile)(command, args, options);
}

async function localSupabaseAdminRuntime() {
  const { stdout } = await executeLocalFile(
    "npx",
    ["supabase", "status", "--workdir", "backend", "-o", "env"],
    { timeout: 30_000, maxBuffer: 2_097_152 },
  );
  const values = parseSupabaseStatusEnv(stdout);
  const apiUrl = String(values.API_URL || values.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/u, "");
  const serviceRoleKey = String(
    values.SERVICE_ROLE_KEY || values.SECRET_KEY || "",
  ).trim();
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(apiUrl)) {
    throw new Error("Disposable local Supabase API URL is unavailable.");
  }
  if (!serviceRoleKey) {
    throw new Error("Disposable local Supabase service credential is unavailable.");
  }
  return { apiUrl, serviceRoleKey };
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function createConnectedAdminFixture() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for disposable local Admin setup.");
  }
  const { apiUrl, serviceRoleKey } = await localSupabaseAdminRuntime();
  const adminHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const authResponse = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Browser E2E Teacher" },
    }),
    cache: "no-store",
    redirect: "error",
  });
  const authPayload = await authResponse.json().catch(() => null);
  const authUserId = String(authPayload?.id || authPayload?.user?.id || "").trim();
  if (
    !authResponse.ok ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(authUserId)
  ) {
    throw new Error(`Disposable local Auth identity returned ${authResponse.status}.`);
  }

  await executeLocalFile("psql", [
    databaseUrl,
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `insert into public.staff_users (
       supabase_auth_user_id,
       email,
       display_name,
       status,
       role,
       mfa_required
     ) values (
       ${sqlLiteral(authUserId)}::uuid,
       lower(${sqlLiteral(ADMIN_EMAIL)}),
       'Browser E2E Teacher',
       'active',
       'game_admin',
       true
     );`,
  ], { timeout: 30_000, maxBuffer: 1_048_576 });

  const { stdout } = await executeLocalFile("psql", [
    databaseUrl,
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `select jsonb_build_object(
       'permissionVersion', permission_version,
       'securityVersion', security_version
     )::text
     from public.staff_users
     where supabase_auth_user_id = ${sqlLiteral(authUserId)}::uuid;`,
  ], { timeout: 30_000, maxBuffer: 1_048_576 });
  const security = JSON.parse(String(stdout || "").trim());
  const permissionVersion = Number(security.permissionVersion);
  const securityVersion = Number(security.securityVersion);
  if (
    !Number.isSafeInteger(permissionVersion) || permissionVersion < 1 ||
    !Number.isSafeInteger(securityVersion) || securityVersion < 1
  ) {
    throw new Error("Disposable local Staff security state is invalid.");
  }

  const metadataResponse = await fetch(
    `${apiUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        app_metadata: {
          econovaria_role: "game_admin",
          permission_version: permissionVersion,
          security_version: securityVersion,
        },
        user_metadata: { display_name: "Browser E2E Teacher" },
      }),
      cache: "no-store",
      redirect: "error",
    },
  );
  await metadataResponse.body?.cancel().catch(() => undefined);
  if (!metadataResponse.ok) {
    throw new Error(`Disposable local Auth metadata returned ${metadataResponse.status}.`);
  }
  evidence.localIdentityFixtureCreated = true;
}

async function executeAuthenticatedAdminOnboardingJourney() {
  await page.goto(`${BASE_URL}/?mode=admin`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.locator("#adminForm").waitFor({ state: "visible", timeout: 30_000 });

  const brokenImages = await page.locator("img").evaluateAll((images) => images
    .filter((image) => image.complete && image.naturalWidth === 0)
    .map((image) => image.getAttribute("src") || "[missing-src]"));
  if (brokenImages.length) {
    throw new Error(`Login page has broken images: ${brokenImages.join(", ")}`);
  }

  await page.locator("#adminEmail").fill(ADMIN_EMAIL);
  await page.locator("#adminAccessCode").fill(ADMIN_PASSWORD);
  const requestIndex = evidence.requests.length;
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/login") &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.locator("#adminForm button[type='submit']").click();
  const loginResponse = await loginResponsePromise;
  if (!loginResponse.ok()) {
    const body = sanitize(await loginResponse.text().catch(() => ""));
    throw new Error(`Rendered Admin sign-in returned ${loginResponse.status()}: ${body.slice(0, 500)}`);
  }

  await completeMfaEnrollmentIfRequired();
  await page.locator("#adminGamesStep:not(.hidden)").waitFor({
    state: "visible",
    timeout: 60_000,
  });
  await page.locator("#createNewAdminGame").click();
  await page.locator("#adminNewLicenseCode").fill(LICENSE_CODE);
  await page.locator("#adminNewGameName").fill(GAME_NAME);
  await page.locator("#adminNewGameTimeZone").selectOption("Asia/Seoul");
  await page.locator("#adminNewGameDifficulty").selectOption("moderate");

  const provisionResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        "/functions/v1/web-session-api/proxy/games",
      ) && response.request().method() === "POST",
    { timeout: 180_000 },
  );
  const refreshedStatusPromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/status") &&
      response.request().method() === "GET" && response.status() === 200,
    { timeout: 180_000 },
  );
  await page.locator("#adminCreateGameForm button[type='submit']").click();
  const [provisionResponse, refreshedStatusResponse] = await Promise.all([
    provisionResponsePromise,
    refreshedStatusPromise,
  ]);
  if (provisionResponse.status() !== 201) {
    const body = sanitize(await provisionResponse.text().catch(() => ""));
    throw new Error(
      `Rendered authenticated game creation returned ${provisionResponse.status()}: ${body.slice(0, 500)}`,
    );
  }
  const provisionPayload = await provisionResponse.json().catch(() => null);
  const gameId = String(
    provisionPayload?.data?.game?.id || provisionPayload?.data?.game?.gameId || "",
  ).trim();
  if (!gameId) {
    throw new Error("Rendered authenticated game creation returned no game scope.");
  }
  const refreshedStatus = await refreshedStatusResponse.json().catch(() => null);
  const games = Array.isArray(refreshedStatus?.activeGameSessions)
    ? refreshedStatus.activeGameSessions
    : [];
  if (!games.some((game) => String(game?.id || "") === gameId)) {
    throw new Error("Refreshed Admin status omitted the newly provisioned game.");
  }

  const gameRow = page.locator("#adminGameList .game-row", { hasText: GAME_NAME }).first();
  await gameRow.waitFor({ state: "visible", timeout: 30_000 });
  await gameRow.click();
  await waitForAdminConsole();
  evidence.createdThroughRenderedUi = true;
  return requestIndex;
}

let source = await readFile(CORE_URL, "utf8");
source = replaceExactlyOnce(
  source,
  "In-card MFA enrollment journey",
  `async function completeMfaEnrollmentIfRequired() {
  const dialog = page.locator(".econovaria-mfa-dialog");
  await dialog.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  if (!await dialog.isVisible().catch(() => false)) return;

  const secretNode = dialog.locator(".econovaria-mfa-secret");
  await secretNode.waitFor({ state: "visible", timeout: 20_000 });
  const secret = String(await secretNode.textContent() || "").trim();

  const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remainingSeconds < 5) {
    await page.waitForTimeout((remainingSeconds + 1) * 1000);
  }
  const code = generateTotp(secret);

  const verifyResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/mfa/verify") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await dialog.locator(".econovaria-mfa-code").fill(code);
  await dialog.locator(".econovaria-mfa-submit").click();
  const verifyResponse = await verifyResponsePromise;
  if (!verifyResponse.ok()) {
    const body = sanitize(await verifyResponse.text().catch(() => ""));
    throw new Error(\`Rendered MFA verification returned \${verifyResponse.status()}: \${body.slice(0, 500)}\`);
  }
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
}`,
  `async function completeMfaEnrollmentIfRequired() {
  const host = page.locator("#econovariaAdminMfaStep:not(.hidden)");
  await host.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  if (!await host.isVisible().catch(() => false)) return;

  const secretNode = host.locator(".econovaria-mfa-secret");
  await secretNode.waitFor({ state: "visible", timeout: 20_000 });
  const secret = String(await secretNode.textContent() || "").trim();

  const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remainingSeconds < 5) {
    await page.waitForTimeout((remainingSeconds + 1) * 1000);
  }
  const code = generateTotp(secret);

  await host.locator(".econovaria-mfa-setup-continue").click();
  const form = host.locator(".econovaria-mfa-form:not(.hidden)");
  await form.waitFor({ state: "visible", timeout: 20_000 });
  const verifyResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/mfa/verify") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator(".econovaria-mfa-code").fill(code);
  await form.locator(".econovaria-mfa-submit").click();
  const verifyResponse = await verifyResponsePromise;
  if (!verifyResponse.ok()) {
    const body = sanitize(await verifyResponse.text().catch(() => ""));
    throw new Error(\`Rendered MFA verification returned \${verifyResponse.status()}: \${body.slice(0, 500)}\`);
  }
  await page.locator("#econovariaAdminMfaStep").waitFor({ state: "hidden", timeout: 30_000 });
}`,
);
source = replaceExactlyOnce(
  source,
  "Share modal settlement",
  `async function closeShareModal(modal) {
  await page.keyboard.press("Escape");
  if (await modal.isVisible().catch(() => false)) {
    const close = modal.locator('[data-admin-terminal-modal-close], button[aria-label*="Close"]:visible').first();
    if (await close.count()) await close.click();
  }
}`,
  `async function closeShareModal(modal) {
  await page.keyboard.press("Escape");
  if (await modal.isVisible().catch(() => false)) {
    const close = modal.locator('[data-admin-terminal-modal-close], button[aria-label*="Close"]:visible').first();
    if (await close.count()) await close.click();
  }
  await modal.waitFor({ state: "hidden", timeout: 10_000 });
}`,
);
source = replaceExactlyOnce(
  source,
  "Player creation BFF route",
  `(candidate) => /\\/functions\\/v1\\/admin-api\\/games\\/[^/]+\\/players$/.test(new URL(candidate.url()).pathname) &&`,
  `(candidate) => /\\/functions\\/v1\\/web-session-api\\/proxy\\/games\\/[^/]+\\/players$/.test(new URL(candidate.url()).pathname) &&`,
);
source = replaceExactlyOnce(
  source,
  "Logout revocation evidence",
  `  assertNoFailedRequests("Logout", logoutRequestIndex);

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(\`Browser emitted errors: \${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}\`);
  }`,
  `  const logoutRequests = evidence.requests.slice(logoutRequestIndex);
  const expectedRevocationProbe = logoutRequests.find((request) =>
    request.method === "GET" &&
    request.status === 401 &&
    request.url.endsWith("/functions/v1/web-session-api/status")
  );
  if (!expectedRevocationProbe) {
    throw new Error("Logout did not prove the revoked Admin session was rejected by the status boundary.");
  }
  const unexpectedLogoutFailures = logoutRequests.filter((request) =>
    request.status >= 400 && request !== expectedRevocationProbe
  );
  if (unexpectedLogoutFailures.length) {
    throw new Error(\`Logout observed unexpected failed requests: \${JSON.stringify(unexpectedLogoutFailures)}\`);
  }
  evidence.logout.statusRejected = true;

  const expectedUnauthorizedConsoleError =
    "Failed to load resource: the server responded with a status of 401 (Unauthorized)";
  const unexpectedConsoleErrors = evidence.consoleErrors.filter((message) =>
    message !== expectedUnauthorizedConsoleError
  );
  if (unexpectedConsoleErrors.length || evidence.pageErrors.length) {
    throw new Error(\`Browser emitted errors: \${JSON.stringify({ consoleErrors: unexpectedConsoleErrors, pageErrors: evidence.pageErrors })}\`);
  }`,
);

const setupHelpers = [
  parseSupabaseStatusEnv,
  executeLocalFile,
  localSupabaseAdminRuntime,
  sqlLiteral,
  createConnectedAdminFixture,
  executeAuthenticatedAdminOnboardingJourney,
].map((value) => value.toString()).join("\n\n");
source = replaceExactlyOnce(
  source,
  "Inject local verified identity helpers",
  "let failure;",
  `${setupHelpers}\n\nlet failure;`,
);
source = replaceSection(
  source,
  "Replace retired public Create Game journey",
  'try {\n  await page.goto(`${BASE_URL}/?mode=create`, { waitUntil: "domcontentloaded", timeout: 120_000 });',
  `  for (const section of ["Attendance", "Players", "Contracts", "Store", "Marketplace", "Settings", "Logs", "Overview"]) {`,
  `try {
  await createConnectedAdminFixture();
  const authenticatedRequestIndex = await executeAuthenticatedAdminOnboardingJourney();
  evidence.adminConsoleRendered = true;
  assertNoFailedRequests("Initial Admin bootstrap", authenticatedRequestIndex);

`,
);

if (
  source.includes("#licenseCode") ||
  source.includes("Rendered Create Game returned") ||
  source.includes("/functions/v1/bootstrap-api/staff/signup") ||
  !source.includes("createConnectedAdminFixture()") ||
  !source.includes("executeAuthenticatedAdminOnboardingJourney()") ||
  !source.includes("#adminCreateGameForm button[type='submit']")
) {
  throw new Error(
    "Admin browser authenticated verification/MFA/game-selector adaptation did not materialize exactly.",
  );
}

const materializedDirectory = await mkdtemp(join(fileURLToPath(SOURCE_DIRECTORY), ".admin-browser-materialized-"));
const materializedPath = join(materializedDirectory, "admin-browser-reconnaissance.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
