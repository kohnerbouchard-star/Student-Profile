#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const coreUrl = new URL("./player-multiplayer-browser-acceptance-core.mjs", import.meta.url);
const source = await readFile(coreUrl, "utf8");
const legacyNeedle = 'response.url().includes("/functions/v1/player-api/players/login") &&';
const bffNeedle = 'response.url().includes("/functions/v1/player-web-session-api/login") &&';
const failedRequestNeedle = "const failed = requests.slice(startIndex).filter((entry) => entry.status >= 400);";
const failedRequestReplacement = `const failed = requests.slice(startIndex).filter((entry) => {
    if (entry.status < 400) return false;
    return !(
      label === "Admin bootstrap" &&
      entry.method === "GET" &&
      entry.status === 401 &&
      entry.url.endsWith("/functions/v1/web-session-api/status")
    );
  });`;
const legacySetupStart = "async function browserRuntimeConfig() {";
const legacySetupEnd = "function instrumentPage(page, target) {";
const legacyAdminStart = "async function signInAdmin(page, expectedGameId) {";
const legacyAdminEnd = "async function navigateAdminSection(page, name) {";
const legacyMainSetup = "const setup = await createConnectedGame();";
const authenticatedMainSetup = "await createConnectedStaffFixture();";
const legacyMainSignIn = "const authenticatedRequestStart = await signInAdmin(adminPage, setup.gameId);";
const authenticatedMainSignIn = "const { gameId, requestAuditStart: authenticatedRequestStart } = await signInAdminAndCreateGame(adminPage);";

for (const [needle, label] of [
  [legacyNeedle, "legacy Player login wait"],
  [failedRequestNeedle, "failed-request filter"],
  [legacySetupStart, "legacy public signup setup"],
  [legacySetupEnd, "instrument-page boundary"],
  [legacyAdminStart, "legacy Admin sign-in"],
  [legacyAdminEnd, "Admin navigation boundary"],
  [legacyMainSetup, "legacy connected-game setup"],
  [legacyMainSignIn, "legacy expected-game sign-in"],
]) {
  const occurrences = source.split(needle).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Player multiplayer adapter expected one ${label}, found ${occurrences}.`,
    );
  }
}

function replaceSection(input, startNeedle, endNeedle, replacement) {
  const start = input.indexOf(startNeedle);
  const end = input.indexOf(endNeedle, start);
  if (start < 0 || end <= start) {
    throw new Error(`Could not replace materialized section: ${startNeedle}`);
  }
  return `${input.slice(0, start)}${replacement}\n\n${input.slice(end)}`;
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

async function localSupabaseAdminRuntime() {
  const { stdout } = await execFileAsync(
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

async function createConnectedStaffFixture() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required for disposable local Staff setup.");
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
      user_metadata: { display_name: "Multiplayer Browser Teacher" },
    }),
    cache: "no-store",
    redirect: "error",
  });
  evidence.connectedSetup.signupStatus = authResponse.status;
  const authPayload = await authResponse.json().catch(() => null);
  const authUserId = String(authPayload?.id || authPayload?.user?.id || "").trim();
  if (
    !authResponse.ok ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(authUserId)
  ) {
    throw new Error(`Disposable local Auth identity returned ${authResponse.status}.`);
  }

  await execFileAsync("psql", [
    DATABASE_URL,
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
       'Multiplayer Browser Teacher',
       'active',
       'game_admin',
       false
     );`,
  ], { timeout: 30_000, maxBuffer: 1_048_576 });

  const { stdout } = await execFileAsync("psql", [
    DATABASE_URL,
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
        user_metadata: { display_name: "Multiplayer Browser Teacher" },
      }),
      cache: "no-store",
      redirect: "error",
    },
  );
  await metadataResponse.body?.cancel().catch(() => undefined);
  if (!metadataResponse.ok) {
    throw new Error(`Disposable local Auth metadata returned ${metadataResponse.status}.`);
  }

  evidence.connectedSetup.localMfaExemptionApplied = true;
  evidence.connectedSetup.identityFixtureCreated = true;
}

async function signInAdminAndCreateGame(page) {
  const consoleErrorStart = evidence.adminConsoleErrors.length;
  await page.goto(`${BASE_URL}/?mode=admin`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.locator("#adminEmail").fill(ADMIN_EMAIL);
  await page.locator("#adminAccessCode").fill(ADMIN_PASSWORD);
  const requestAuditStart = evidence.adminRequests.length;
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/login") &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  const statusResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/status") &&
      response.request().method() === "GET" && response.status() === 200,
    { timeout: 120_000 },
  );
  await page.locator("#adminForm button[type='submit']").click();
  const [loginResponse, statusResponse] = await Promise.all([
    loginResponsePromise,
    statusResponsePromise,
  ]);
  evidence.connectedSetup.signInStatus = loginResponse.status();
  evidence.connectedSetup.bootstrapStatus = statusResponse.status();
  if (loginResponse.status() !== 200 || statusResponse.status() !== 200) {
    throw new Error(
      `Connected Admin web session returned ${loginResponse.status()}/${statusResponse.status()}.`,
    );
  }
  const initialStatus = await statusResponse.json().catch(() => null);
  const initialGames = Array.isArray(initialStatus?.activeGameSessions)
    ? initialStatus.activeGameSessions
    : [];
  if (initialGames.length !== 0) {
    throw new Error("Disposable local Staff unexpectedly owned a game before selector provisioning.");
  }

  await page.locator("#createNewAdminGame").waitFor({
    state: "visible",
    timeout: 30_000,
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
  evidence.connectedSetup.gameProvisionStatus = provisionResponse.status();
  if (provisionResponse.status() !== 201) {
    throw new Error(`Authenticated game selector returned ${provisionResponse.status()}.`);
  }
  const provisionPayload = await provisionResponse.json().catch(() => null);
  const gameId = String(
    provisionPayload?.data?.game?.id || provisionPayload?.data?.game?.gameId || "",
  ).trim();
  if (!gameId) {
    throw new Error("Authenticated game selector did not return a game scope.");
  }
  const refreshedStatus = await refreshedStatusResponse.json().catch(() => null);
  const activeGames = Array.isArray(refreshedStatus?.activeGameSessions)
    ? refreshedStatus.activeGameSessions
    : [];
  if (!activeGames.some((game) => String(game?.id || "") === gameId)) {
    throw new Error("Refreshed Admin status did not contain the selector-provisioned game.");
  }

  const gameRow = page.locator("#adminGameList .game-row", { hasText: GAME_NAME }).first();
  await gameRow.waitFor({ state: "visible", timeout: 30_000 });
  await gameRow.click();
  await waitForAdminConsole(page);

  const selectedGameId = await page.evaluate(() =>
    sessionStorage.getItem("econovaria.admin.selected-game.v1") || ""
  );
  if (selectedGameId !== gameId) {
    throw new Error("Connected Admin selected the wrong game scope.");
  }
  const storage = await page.evaluate(() =>
    sessionStorage.getItem("econovaria.admin.auth.v1") || ""
  );
  if (/accessToken|refreshToken|eyJ[A-Za-z0-9_-]+\./.test(storage)) {
    throw new Error("Admin browser storage exposed Staff credentials.");
  }

  const retainedErrors = evidence.adminConsoleErrors.slice(0, consoleErrorStart).concat(
    evidence.adminConsoleErrors.slice(consoleErrorStart).filter((entry) =>
      !/Failed to load resource: the server responded with a status of 401/i.test(entry)
    ),
  );
  evidence.adminConsoleErrors.splice(
    0,
    evidence.adminConsoleErrors.length,
    ...retainedErrors,
  );
  evidence.adminUsesHttpOnlyBff = true;
  return { gameId, requestAuditStart };
}

const fixtureReplacement = [
  parseSupabaseStatusEnv,
  localSupabaseAdminRuntime,
  sqlLiteral,
  createConnectedStaffFixture,
].map((value) => value.toString()).join("\n\n");

let materialized = source
  .replace(legacyNeedle, bffNeedle)
  .replace(failedRequestNeedle, failedRequestReplacement)
  .replace(legacyMainSetup, authenticatedMainSetup)
  .replace(legacyMainSignIn, authenticatedMainSignIn);
materialized = replaceSection(
  materialized,
  legacySetupStart,
  legacySetupEnd,
  fixtureReplacement,
);
materialized = replaceSection(
  materialized,
  legacyAdminStart,
  legacyAdminEnd,
  signInAdminAndCreateGame.toString(),
);

if (
  materialized.includes(legacyNeedle) ||
  !materialized.includes(bffNeedle) ||
  materialized.includes(failedRequestNeedle) ||
  materialized.includes("purchaseCode: LICENSE_CODE") ||
  materialized.includes("createConnectedGame()") ||
  !materialized.includes("createConnectedStaffFixture()") ||
  !materialized.includes("signInAdminAndCreateGame(adminPage)") ||
  !materialized.includes("#adminCreateGameForm button[type='submit']")
) {
  throw new Error(
    "Player multiplayer authenticated game-selector adaptation did not materialize exactly.",
  );
}

const scriptsDirectory = dirname(fileURLToPath(coreUrl));
const directory = await mkdtemp(join(scriptsDirectory, ".tmp-player-multiplayer-"));
const target = join(directory, "player-multiplayer-browser-acceptance.mjs");
try {
  await writeFile(target, materialized, "utf8");
  await import(`${pathToFileURL(target).href}?source=${encodeURIComponent(fileURLToPath(coreUrl))}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
