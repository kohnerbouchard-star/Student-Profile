#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs/operations/contracts/phase15-production-runtime-fixture-v1.json",
);
const EXPECTED_PROJECT_REF = "cgiukdjwicykrmtkhudh";
const DENIED_PROJECT_REF = "eecvbssdvarfcykcfrny";
const EXPECTED_ORIGIN = "https://www.econovaria.com";
const FIXTURE_GAME_NAME = "[SYSTEM] Phase 15 Production Runtime Probe";
const FIXTURE_PLAYER_IDENTIFIER = "PHASE15-RUNTIME-PROBE";
const FIXTURE_PLAYER_NAME = "Phase 15 Runtime Probe";
const FIXTURE_PACK_ID = "econovaria.beta-seed-pack.v1";
const REQUEST_TIMEOUT_MS = 30_000;
const READ_PATHS = Object.freeze([
  "/players/me",
  "/players/me/capabilities",
  "/players/me/game/dashboard",
  "/players/me/world-runtime",
  "/players/me/ledger?limit=10",
  "/players/me/inventory",
  "/players/me/progression",
]);
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;
const GAME_CODE_PATTERN = /\bECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}\b/gu;
const ACCESS_CODE_PATTERN = /\bPHASE15-PROBE-[A-F0-9]{24,}\b/gu;
const COOKIE_PATTERN = /(?:__Host-)?econovaria_player_session=[^;\s]+/giu;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/gu;
const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s"']+/giu;

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function sanitize(value) {
  return String(value?.message || value || "Unknown production runtime probe error")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(GAME_CODE_PATTERN, "[game-code-redacted]")
    .replace(ACCESS_CODE_PATTERN, "[credential-redacted]")
    .replace(COOKIE_PATTERN, "[cookie-redacted]")
    .replace(JWT_PATTERN, "[token-redacted]")
    .replace(DATABASE_URL_PATTERN, "[database-url-redacted]")
    .replaceAll(FIXTURE_PLAYER_IDENTIFIER, "[fixture-player-redacted]")
    .replaceAll(FIXTURE_GAME_NAME, "[fixture-game-redacted]")
    .slice(0, 4000);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJsonLine(output, label) {
  const lines = String(output || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  requireCondition(lines.length > 0, `${label} returned no JSON.`);
  try {
    return JSON.parse(lines.at(-1));
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

async function runSql(databaseUrl, sql, label) {
  const sqlPath = path.join(os.tmpdir(), `econovaria-phase15-runtime-${randomUUID()}.sql`);
  await writeFile(sqlPath, `${sql.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    const result = spawnSync(
      "psql",
      [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PGOPTIONS: "-c statement_timeout=60000 -c lock_timeout=5000" },
      },
    );
    if (result.error || result.status !== 0) {
      throw new Error(`${label} failed: ${sanitize(result.stderr || result.error || `psql exited ${result.status}`)}`);
    }
    return String(result.stdout || "").trim();
  } finally {
    await unlink(sqlPath).catch(() => {});
  }
}

function serviceRoleTransaction(body) {
  return `
    begin;
    select set_config('request.jwt.claim.role', 'service_role', true);
    ${body}
    commit;
  `;
}

export function validateBindings({ databaseUrl, origin, projectRef, sourceCommit }) {
  requireCondition(projectRef === EXPECTED_PROJECT_REF, "Production project ref mismatch.");
  requireCondition(projectRef !== DENIED_PROJECT_REF, "Staging project is denied.");
  requireCondition(origin === EXPECTED_ORIGIN, "Canonical production origin mismatch.");
  requireCondition(/^[0-9a-f]{40}$/u.test(sourceCommit), "Source commit must be a full lowercase SHA.");
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Production database URL is invalid.");
  }
  requireCondition(["postgres:", "postgresql:"].includes(parsed.protocol), "Production database protocol is invalid.");
  const binding = `${parsed.hostname}|${decodeURIComponent(parsed.username)}`;
  requireCondition(binding.includes(projectRef), "Database URL is not bound to the production project.");
  requireCondition(!binding.includes(DENIED_PROJECT_REF), "Database URL is bound to denied staging.");
  return true;
}

async function validateContract(projectRef, origin) {
  const contract = JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
  requireCondition(contract.schemaVersion === 1, "Runtime fixture contract schema mismatch.");
  requireCondition(
    contract.contractId === "econovaria.phase15.production-runtime-fixture.v1",
    "Runtime fixture contract identity mismatch.",
  );
  requireCondition(contract.environment === "production", "Runtime fixture contract environment mismatch.");
  requireCondition(contract.projectRef === projectRef, "Runtime fixture contract project mismatch.");
  requireCondition(contract.canonicalOrigin === origin, "Runtime fixture contract origin mismatch.");
  requireCondition(contract.fixture?.gameName === FIXTURE_GAME_NAME, "Runtime fixture game binding mismatch.");
  requireCondition(
    contract.fixture?.playerIdentifier === FIXTURE_PLAYER_IDENTIFIER,
    "Runtime fixture Player binding mismatch.",
  );
  for (const [field, expected] of Object.entries({
    maximumPlayers: 1,
    purgeProtected: true,
    realUserDataPermitted: false,
    credentialPersistencePermitted: false,
    joinableOutsideProbePermitted: false,
    activeOutsideProbePermitted: false,
  })) requireCondition(contract.fixture?.[field] === expected, `Runtime fixture policy mismatch: ${field}.`);
  requireCondition(contract.directEconomicMutationPermitted === false, "Direct economic mutation must remain denied.");
  requireCondition(contract.evidenceMayContainSecrets === false, "Secret-bearing evidence must remain denied.");
  requireCondition(
    contract.evidenceMayContainRawInternalIdentifiers === false,
    "Internal-identifier evidence must remain denied.",
  );
  return contract;
}

async function readFixtureState(databaseUrl) {
  return parseJsonLine(await runSql(databaseUrl, `
    with owner_row as (
      select id
      from public.staff_users
      where email = ${sqlLiteral("canonical-source@econovaria.internal")}
    ), fixture_rows as (
      select game_row.*
      from public.game_sessions as game_row
      join owner_row on owner_row.id = game_row.owner_staff_user_id
      where game_row.name = ${sqlLiteral(FIXTURE_GAME_NAME)}
    )
    select jsonb_build_object(
      'ownerCount', (select count(*) from owner_row),
      'ownerId', (select id from owner_row limit 1),
      'gameCount', (select count(*) from fixture_rows),
      'gameId', (select id from fixture_rows limit 1),
      'lifecycleState', (select lifecycle_state from fixture_rows limit 1),
      'operationalStatus', (select status from fixture_rows limit 1),
      'provisioningStatus', (select provisioning_status from fixture_rows limit 1),
      'purgeProtected', (select data_purge_protected from fixture_rows limit 1)
    )::text;
  `, "runtime fixture state"), "runtime fixture state");
}

async function transitionFixture(databaseUrl, fixture, action, key) {
  const result = parseJsonLine(await runSql(databaseUrl, serviceRoleTransaction(`
    select row_to_json(transition_row)::text
    from public.transition_game_lifecycle_atomic_v1(
      ${sqlLiteral(fixture.gameId)}::uuid,
      ${sqlLiteral(fixture.ownerId)}::uuid,
      ${sqlLiteral(action)},
      ${sqlLiteral(key)},
      null
    ) as transition_row;
  `), `runtime fixture ${action}`), `runtime fixture ${action}`);
  requireCondition(["applied", "already_current", "replayed"].includes(result.transition_outcome),
    `Runtime fixture ${action} returned an invalid outcome.`);
  return result;
}

async function provisionFixture(databaseUrl, runNonce) {
  let fixture = await readFixtureState(databaseUrl);
  requireCondition(fixture.ownerCount === 1, "Canonical production fixture owner is unavailable or ambiguous.");
  requireCondition(fixture.gameCount <= 1, "Production runtime fixture game is ambiguous.");
  let created = false;
  if (fixture.gameCount === 0) {
    const result = parseJsonLine(await runSql(databaseUrl, serviceRoleTransaction(`
      select public.create_provisioned_game_v2(
        ${sqlLiteral(fixture.ownerId)}::uuid,
        ${sqlLiteral(FIXTURE_GAME_NAME)},
        '{"difficulty_preset":"moderate","stock_market_window":{"timezone":"UTC"}}'::jsonb,
        'phase15.production.authenticated-runtime.v1',
        ${sqlLiteral(FIXTURE_PACK_ID)}
      )::text;
    `), "production runtime fixture provisioning"), "production runtime fixture provisioning");
    requireCondition(["created", "replayed"].includes(result.outcome), "Runtime fixture provisioning failed.");
    requireCondition(result.provisioningStatus === "ready", "Runtime fixture provisioning is not ready.");
    created = result.outcome === "created";
    fixture = await readFixtureState(databaseUrl);
  }
  requireCondition(fixture.gameCount === 1, "Production runtime fixture was not resolved exactly.");
  requireCondition(fixture.provisioningStatus === "ready", "Production runtime fixture is not provisioned.");
  requireCondition(!["ended", "archived"].includes(fixture.lifecycleState), "Production runtime fixture is not reusable.");

  if (fixture.lifecycleState === "paused") {
    await transitionFixture(databaseUrl, fixture, "resume", `${runNonce}.resume`);
  } else if (fixture.lifecycleState === "draft") {
    await transitionFixture(databaseUrl, fixture, "start", `${runNonce}.start`);
  } else {
    requireCondition(fixture.lifecycleState === "active", "Production runtime fixture lifecycle is invalid.");
  }

  await runSql(databaseUrl, `
    update public.game_sessions
    set data_purge_protected = true
    where id = ${sqlLiteral(fixture.gameId)}::uuid
      and owner_staff_user_id = ${sqlLiteral(fixture.ownerId)}::uuid
      and name = ${sqlLiteral(FIXTURE_GAME_NAME)}
      and provisioning_status = 'ready';
  `, "runtime fixture purge protection");

  const verified = parseJsonLine(await runSql(databaseUrl, serviceRoleTransaction(`
    select public.verify_provisioned_game_v1(
      ${sqlLiteral(fixture.gameId)}::uuid,
      ${sqlLiteral(fixture.ownerId)}::uuid
    )::text;
  `), "runtime fixture verification"), "runtime fixture verification");
  requireCondition(verified.ready === true, "Production runtime fixture verification failed.");

  const issued = parseJsonLine(await runSql(databaseUrl, serviceRoleTransaction(`
    select row_to_json(join_row)::text
    from public.issue_game_join_code_v1(
      ${sqlLiteral(fixture.gameId)}::uuid,
      ${sqlLiteral(fixture.ownerId)}::uuid
    ) as join_row;
  `), "runtime fixture join-code issuance"), "runtime fixture join-code issuance");
  requireCondition(GAME_CODE_PATTERN.test(String(issued.game_join_code || "")), "Runtime fixture join code is invalid.");
  GAME_CODE_PATTERN.lastIndex = 0;
  return { ...fixture, created, gameJoinCode: issued.game_join_code };
}

async function provisionPlayer(databaseUrl, fixture, accessCode) {
  const accessCodeHash = createHash("sha256").update(accessCode).digest("hex");
  let player = parseJsonLine(await runSql(databaseUrl, `
    select jsonb_build_object(
      'totalCount', count(*),
      'count', count(*) filter (
        where player_identifier_normalized = ${sqlLiteral(FIXTURE_PLAYER_IDENTIFIER)}
      ),
      'playerId', min(id::text) filter (
        where player_identifier_normalized = ${sqlLiteral(FIXTURE_PLAYER_IDENTIFIER)}
      ),
      'activeCount', count(*) filter (
        where player_identifier_normalized = ${sqlLiteral(FIXTURE_PLAYER_IDENTIFIER)}
          and status = 'active'
      )
    )::text
    from public.players
    where game_session_id = ${sqlLiteral(fixture.gameId)}::uuid;
  `, "runtime fixture Player state"), "runtime fixture Player state");
  requireCondition(player.totalCount <= 1, "Production runtime fixture contains an unexpected Player.");
  requireCondition(player.count <= 1, "Production runtime fixture Player is ambiguous.");
  let created = false;
  if (player.count === 0) {
    player = parseJsonLine(await runSql(databaseUrl, serviceRoleTransaction(`
      select jsonb_build_object('playerId', player_id, 'playerStatus', player_status)::text
      from public.create_player_with_identity_and_credential(
        ${sqlLiteral(fixture.gameId)}::uuid,
        ${sqlLiteral(FIXTURE_PLAYER_NAME)},
        ${sqlLiteral(FIXTURE_PLAYER_NAME)},
        ${sqlLiteral(FIXTURE_PLAYER_IDENTIFIER)},
        ${sqlLiteral(FIXTURE_PLAYER_IDENTIFIER)},
        ${sqlLiteral(accessCodeHash)},
        '{"fixture":"phase15-production-runtime-v1","synthetic":true}'::jsonb
      );
    `), "runtime fixture Player creation"), "runtime fixture Player creation");
    requireCondition(player.playerStatus === "active", "Runtime fixture Player was not created active.");
    created = true;
  } else {
    requireCondition(player.activeCount === 1, "Production runtime fixture Player is not active.");
    player = parseJsonLine(await runSql(databaseUrl, serviceRoleTransaction(`
      select jsonb_build_object('playerId', player_id, 'playerStatus', player_status)::text
      from public.set_player_identity_and_access_code(
        ${sqlLiteral(fixture.gameId)}::uuid,
        ${sqlLiteral(player.playerId)}::uuid,
        ${sqlLiteral(FIXTURE_PLAYER_IDENTIFIER)},
        ${sqlLiteral(FIXTURE_PLAYER_IDENTIFIER)},
        ${sqlLiteral(accessCodeHash)}
      );
    `), "runtime fixture Player credential rotation"), "runtime fixture Player credential rotation");
    requireCondition(player.playerStatus === "active", "Runtime fixture Player credential rotation failed.");
  }
  return { playerId: player.playerId, created };
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function updateCookieJar(jar, headers) {
  for (const value of readSetCookies(headers)) {
    const first = String(value).split(";", 1)[0];
    const separator = first.indexOf("=");
    if (separator <= 0) continue;
    const name = first.slice(0, separator).trim();
    const cookieValue = first.slice(separator + 1).trim();
    if (cookieValue) jar.set(name, cookieValue);
    else jar.delete(name);
  }
}

function cookieHeader(jar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function requestJson(origin, jar, pathname, {
  method = "GET",
  body,
  csrfToken = "",
  idempotencyKey = "",
  deviceId,
  expectedStatuses = [200],
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = {
    Accept: "application/json",
    Origin: origin,
    "x-econovaria-device-id": deviceId,
    "x-request-id": randomUUID(),
  };
  const cookie = cookieHeader(jar);
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["x-econovaria-csrf-token"] = csrfToken;
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const startedAt = performance.now();
  try {
    const response = await fetch(`${origin}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    updateCookieJar(jar, response.headers);
    requireCondition(expectedStatuses.includes(response.status),
      `Canonical request ${method} ${pathname} returned ${response.status}: ${sanitize(payload?.error?.code || "unexpected response")}`);
    const cacheControl = String(response.headers.get("cache-control") || "");
    requireCondition(cacheControl.includes("no-store"), `Canonical request ${method} ${pathname} was cacheable.`);
    return {
      status: response.status,
      payload,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Canonical request ${method} ${pathname} returned invalid JSON.`);
    if (error?.name === "AbortError") throw new Error(`Canonical request ${method} ${pathname} timed out.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function balanceSnapshot(databaseUrl, fixture, player) {
  const result = parseJsonLine(await runSql(databaseUrl, `
    with balances as (
      select account_type, currency_code, balance
      from public.account_balances
      where game_session_id = ${sqlLiteral(fixture.gameId)}::uuid
        and player_id = ${sqlLiteral(player.playerId)}::uuid
        and account_type in ('checking', 'savings')
    )
    select jsonb_build_object(
      'rowCount', count(*),
      'currencyCount', count(distinct currency_code),
      'checking', max(balance::text) filter (where account_type = 'checking'),
      'savings', max(balance::text) filter (where account_type = 'savings')
    )::text
    from balances;
  `, "runtime fixture balance snapshot"), "runtime fixture balance snapshot");
  requireCondition(result.rowCount === 2 && result.currencyCount === 1, "Runtime fixture banking accounts are incomplete.");
  return result;
}

export function moneyToCents(value) {
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/u);
  if (!match) throw new Error("Invalid exact money value.");
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

function assertForwardBalances(before, after) {
  const beforeChecking = moneyToCents(before.checking);
  const beforeSavings = moneyToCents(before.savings);
  const afterChecking = moneyToCents(after.checking);
  const afterSavings = moneyToCents(after.savings);
  requireCondition(beforeChecking >= 1n, "Runtime fixture has insufficient canonical funds for the bounded transfer.");
  requireCondition(afterChecking === beforeChecking - 1n, "Checking debit was not exactly one cent.");
  requireCondition(afterSavings === beforeSavings + 1n, "Savings credit was not exactly one cent.");
  requireCondition(afterChecking + afterSavings === beforeChecking + beforeSavings, "Economic conservation failed.");
}

function assertRestoredBalances(before, after) {
  requireCondition(moneyToCents(after.checking) === moneyToCents(before.checking), "Checking balance was not restored.");
  requireCondition(moneyToCents(after.savings) === moneyToCents(before.savings), "Savings balance was not restored.");
}

function balancesMatch(left, right) {
  return moneyToCents(left.checking) === moneyToCents(right.checking) &&
    moneyToCents(left.savings) === moneyToCents(right.savings);
}

function isOneCentForwardState(before, current) {
  return moneyToCents(current.checking) === moneyToCents(before.checking) - 1n &&
    moneyToCents(current.savings) === moneyToCents(before.savings) + 1n;
}

async function runAuthenticatedProbe(databaseUrl, origin, fixture, player, accessCode) {
  const jar = new Map();
  const deviceId = randomUUID();
  const login = await requestJson(origin, jar, "/api/player-session/login", {
    method: "POST",
    body: {
      gameJoinCode: fixture.gameJoinCode,
      playerIdentifier: FIXTURE_PLAYER_IDENTIFIER,
      accessCode,
    },
    deviceId,
  });
  requireCondition(login.payload?.ok === true, "Canonical Player login did not succeed.");
  requireCondition(login.payload?.session?.authenticated === true, "Canonical Player session is not authenticated.");
  requireCondition(!login.payload?.session?.token, "Canonical Player login exposed an upstream token.");
  const csrfToken = String(login.payload?.csrfToken || "");
  requireCondition(/^[A-Za-z0-9_-]{43}$/u.test(csrfToken), "Canonical Player CSRF token is invalid.");
  requireCondition(jar.size === 1, "Canonical Player session cookie was not set exactly.");

  const status = await requestJson(origin, jar, "/api/player-session/status", { deviceId });
  requireCondition(status.payload?.ok === true && status.payload?.session?.authenticated === true,
    "Canonical Player session status did not succeed.");
  requireCondition(status.payload?.csrfToken === csrfToken, "Canonical Player session CSRF binding changed unexpectedly.");

  const routeResults = [];
  let worldRuntime = null;
  for (const route of READ_PATHS) {
    const result = await requestJson(origin, jar, `/api/player${route}`, { deviceId });
    requireCondition(result.payload && typeof result.payload === "object", `Authenticated route returned no JSON object: ${route}.`);
    routeResults.push({ path: route, status: result.status, durationMs: result.durationMs });
    if (route === "/players/me/world-runtime") worldRuntime = result.payload;
  }

  let arrival = "already-present";
  const worldContext = worldRuntime?.context;
  requireCondition(worldContext && typeof worldContext === "object", "World runtime context is missing.");
  if (worldContext.arrival?.required === true) {
    const questions = worldContext.arrival?.questionnaire?.questions;
    requireCondition(Array.isArray(questions) && questions.length === 8, "Arrival questionnaire shape is invalid.");
    const answers = questions.map((question) => {
      requireCondition(typeof question?.questionId === "string", "Arrival question identity is invalid.");
      requireCondition(Array.isArray(question.options) && question.options.length >= 2, "Arrival question options are invalid.");
      requireCondition(typeof question.options[0]?.optionId === "string", "Arrival option identity is invalid.");
      return { questionId: question.questionId, optionId: question.options[0].optionId };
    });
    const assigned = await requestJson(origin, jar, "/api/player/players/me/arrival-class", {
      method: "POST",
      body: { answers },
      csrfToken,
      idempotencyKey: `phase15-arrival-${randomUUID()}`,
      deviceId,
    });
    requireCondition(assigned.payload?.ok === true && assigned.payload?.arrival?.assignment,
      "Canonical arrival assignment did not succeed.");
    arrival = "assigned";
  } else {
    requireCondition(worldContext.arrival?.assignment, "Arrival runtime is neither required nor assigned.");
  }

  const before = await balanceSnapshot(databaseUrl, fixture, player);
  requireCondition(moneyToCents(before.checking) >= 1n, "Arrival grant did not provide one cent of checking funds.");
  const forwardKey = `phase15-savings-forward-${randomUUID()}`;
  const forwardBody = {
    fromAccount: "checking",
    toAccount: "savings",
    amount: 0.01,
    note: "Phase 15 isolated runtime verification",
    idempotencyKey: forwardKey,
  };
  const reverseTransfer = async (key, note) => requestJson(
    origin,
    jar,
    "/api/player/players/me/banking/savings/transfers",
    {
      method: "POST",
      body: {
        fromAccount: "savings",
        toAccount: "checking",
        amount: 0.01,
        note,
        idempotencyKey: key,
      },
      csrfToken,
      idempotencyKey: key,
      deviceId,
    },
  );
  let forwardPosted = false;
  let exactReplayRecognized = false;
  let reversalPosted = false;
  let economicFailure = null;
  try {
    const forward = await requestJson(origin, jar, "/api/player/players/me/banking/savings/transfers", {
      method: "POST",
      body: forwardBody,
      csrfToken,
      idempotencyKey: forwardKey,
      deviceId,
    });
    requireCondition(forward.payload?.ok === true && forward.payload?.result?.replayed === false,
      "Canonical savings transfer did not post freshly.");
    const afterForward = await balanceSnapshot(databaseUrl, fixture, player);
    assertForwardBalances(before, afterForward);
    forwardPosted = true;

    const replay = await requestJson(origin, jar, "/api/player/players/me/banking/savings/transfers", {
      method: "POST",
      body: forwardBody,
      csrfToken,
      idempotencyKey: forwardKey,
      deviceId,
    });
    requireCondition(replay.payload?.ok === true && replay.payload?.result?.replayed === true,
      "Canonical savings replay was not recognized as an exact replay.");
    const afterReplay = await balanceSnapshot(databaseUrl, fixture, player);
    requireCondition(balancesMatch(afterReplay, afterForward), "Exact replay changed balances.");
    exactReplayRecognized = true;

    const reverseKey = `phase15-savings-reverse-${randomUUID()}`;
    const reverse = await reverseTransfer(
      reverseKey,
      "Phase 15 isolated runtime verification reversal",
    );
    requireCondition(reverse.payload?.ok === true && reverse.payload?.result?.replayed === false,
      "Canonical savings reversal did not post freshly.");
    const afterReverse = await balanceSnapshot(databaseUrl, fixture, player);
    assertRestoredBalances(before, afterReverse);
    reversalPosted = true;
  } catch (error) {
    economicFailure = error;
  } finally {
    const current = await balanceSnapshot(databaseUrl, fixture, player);
    if (!balancesMatch(before, current)) {
      requireCondition(
        isOneCentForwardState(before, current),
        "Runtime fixture balances entered an unexpected state during compensation.",
      );
      const compensationKey = `phase15-savings-compensate-${randomUUID()}`;
      const compensation = await reverseTransfer(
        compensationKey,
        "Phase 15 isolated runtime failure compensation",
      );
      requireCondition(
        compensation.payload?.ok === true && compensation.payload?.result?.replayed === false,
        "Canonical runtime failure compensation did not post freshly.",
      );
      assertRestoredBalances(before, await balanceSnapshot(databaseUrl, fixture, player));
    }
  }
  if (economicFailure) throw economicFailure;
  requireCondition(forwardPosted && exactReplayRecognized && reversalPosted,
    "Authenticated economic verification did not complete all assertions.");

  const logout = await requestJson(origin, jar, "/api/player-session/logout", {
    method: "POST",
    body: {},
    csrfToken,
    deviceId,
  });
  requireCondition(logout.payload?.ok === true, "Canonical Player logout did not succeed.");
  requireCondition(jar.size === 0, "Canonical Player cookie was not cleared on logout.");
  const rejected = await requestJson(origin, jar, "/api/player-session/status", {
    deviceId,
    expectedStatuses: [401],
  });
  requireCondition(rejected.payload?.ok === false, "Logged-out Player status was not rejected.");

  return {
    login: { status: login.status, durationMs: login.durationMs, upstreamTokenExposed: false },
    sessionStatus: { status: status.status, authenticated: true },
    routes: routeResults,
    arrival,
    economics: {
      action: "checking-to-savings-and-reversal",
      amount: "0.01",
      forwardPosted,
      exactReplayRecognized,
      replayChangedBalances: false,
      reversalPosted,
      valueConserved: true,
      balancesRestored: true,
      directEconomicMutation: false,
    },
    logout: { status: logout.status, cookieCleared: true, revokedStatus: rejected.status },
  };
}

async function containFixture(databaseUrl, fixture, player, runNonce) {
  const result = {
    attempted: Boolean(fixture?.gameId && fixture?.ownerId),
    sessionsRevoked: false,
    credentialsRevoked: false,
    joinCodeCleared: false,
    paused: false,
    purgeProtected: false,
  };
  if (!result.attempted) return result;
  await transitionFixture(databaseUrl, fixture, "revoke_sessions", `${runNonce}.revoke-sessions`);
  const refreshed = await readFixtureState(databaseUrl);
  if (refreshed.lifecycleState === "active") {
    await transitionFixture(databaseUrl, fixture, "pause", `${runNonce}.pause`);
  }
  const verification = parseJsonLine(await runSql(databaseUrl, serviceRoleTransaction(`
    update public.player_access_credentials
    set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
    where game_session_id = ${sqlLiteral(fixture.gameId)}::uuid
      and player_id in (
        select id
        from public.players
        where game_session_id = ${sqlLiteral(fixture.gameId)}::uuid
          and player_identifier_normalized = ${sqlLiteral(FIXTURE_PLAYER_IDENTIFIER)}
      )
      and status = 'active';

    update public.game_sessions
    set game_join_code = null,
        game_join_code_hash = null,
        game_join_code_status = 'revoked',
        data_purge_protected = true,
        updated_at = now()
    where id = ${sqlLiteral(fixture.gameId)}::uuid
      and owner_staff_user_id = ${sqlLiteral(fixture.ownerId)}::uuid
      and name = ${sqlLiteral(FIXTURE_GAME_NAME)};

    select jsonb_build_object(
      'activeSessions', (select count(*) from public.player_sessions where game_session_id = ${sqlLiteral(fixture.gameId)}::uuid and status = 'active'),
      'activeCredentials', (select count(*) from public.player_access_credentials where game_session_id = ${sqlLiteral(fixture.gameId)}::uuid and status = 'active'),
      'joinCodeCleared', game_join_code is null and game_join_code_hash is null and game_join_code_status = 'revoked',
      'paused', lifecycle_state = 'paused' and status = 'disabled',
      'purgeProtected', data_purge_protected
    )::text
    from public.game_sessions
    where id = ${sqlLiteral(fixture.gameId)}::uuid
      and owner_staff_user_id = ${sqlLiteral(fixture.ownerId)}::uuid
      and name = ${sqlLiteral(FIXTURE_GAME_NAME)};
  `), "runtime fixture containment"), "runtime fixture containment");
  result.sessionsRevoked = verification.activeSessions === 0;
  result.credentialsRevoked = verification.activeCredentials === 0;
  result.joinCodeCleared = verification.joinCodeCleared === true;
  result.paused = verification.paused === true;
  result.purgeProtected = verification.purgeProtected === true;
  requireCondition(Object.entries(result).every(([key, value]) => key === "attempted" || value === true),
    "Production runtime fixture containment is incomplete.");
  return result;
}

export function evidenceHasSensitiveMaterial(serialized) {
  for (const pattern of [UUID_PATTERN, GAME_CODE_PATTERN, ACCESS_CODE_PATTERN, COOKIE_PATTERN, JWT_PATTERN, DATABASE_URL_PATTERN]) {
    pattern.lastIndex = 0;
    if (pattern.test(serialized)) return true;
  }
  return serialized.includes(FIXTURE_PLAYER_IDENTIFIER) || serialized.includes(FIXTURE_GAME_NAME);
}

export async function main() {
  const databaseUrl = required("PHASE15_REMOTE_DATABASE_URL");
  const origin = required("ECONOVARIA_PRODUCTION_ORIGIN").replace(/\/+$/u, "");
  const projectRef = required("PRODUCTION_PROJECT_REF");
  const sourceCommit = required("SOURCE_COMMIT").toLowerCase();
  const outputPath = path.resolve(required("PHASE15_PRODUCTION_RUNTIME_EVIDENCE"));
  validateBindings({ databaseUrl, origin, projectRef, sourceCommit });
  const contract = await validateContract(projectRef, origin);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const runNonce = `phase15-runtime-${randomUUID()}`;
  const evidence = {
    schemaVersion: 1,
    evidenceId: "econovaria.phase15.production-authenticated-runtime.v1",
    status: "FAIL",
    environment: "production",
    projectRef,
    canonicalOrigin: origin,
    sourceCommit,
    fixtureContractId: contract.contractId,
    fixture: {
      isolated: true,
      synthetic: true,
      maximumPlayers: 1,
      realUserDataTouched: false,
      purgeProtected: true,
      retainedForBoundedReuse: true,
      createdThisRun: false,
      playerCreatedThisRun: false,
    },
    authenticatedRuntime: null,
    containment: null,
    secretsRecorded: false,
    rawInternalIdentifiersRecorded: false,
    completedAt: null,
  };
  let fixture = null;
  let player = null;
  let failure = null;
  const accessCode = `PHASE15-PROBE-${randomBytes(20).toString("hex").toUpperCase()}`;
  try {
    fixture = await provisionFixture(databaseUrl, runNonce);
    evidence.fixture.createdThisRun = fixture.created;
    player = await provisionPlayer(databaseUrl, fixture, accessCode);
    evidence.fixture.playerCreatedThisRun = player.created;
    evidence.authenticatedRuntime = await runAuthenticatedProbe(
      databaseUrl,
      origin,
      fixture,
      player,
      accessCode,
    );
  } catch (error) {
    failure = error;
    evidence.failure = sanitize(error?.stack || error);
  } finally {
    try {
      evidence.containment = await containFixture(databaseUrl, fixture, player, runNonce);
    } catch (error) {
      failure ||= error;
      evidence.containment = { attempted: Boolean(fixture), complete: false };
      evidence.containmentFailure = sanitize(error?.stack || error);
    }
    evidence.completedAt = new Date().toISOString();
    evidence.status = failure ? "FAIL" : "PASS";
    let serialized = JSON.stringify(evidence, null, 2);
    evidence.secretsRecorded = evidenceHasSensitiveMaterial(serialized);
    evidence.rawInternalIdentifiersRecorded = evidence.secretsRecorded;
    if (evidence.secretsRecorded) {
      failure ||= new Error("Sanitized runtime evidence contains sensitive fixture material.");
      evidence.status = "FAIL";
      delete evidence.failure;
      delete evidence.containmentFailure;
      evidence.failure = "Sanitized runtime evidence failed its disclosure guard.";
      serialized = JSON.stringify(evidence, null, 2);
    }
    await writeFile(outputPath, `${serialized}\n`, { encoding: "utf8", mode: 0o600 });
  }
  if (failure) throw new Error(sanitize(failure));
  console.log(JSON.stringify({
    ok: true,
    sourceCommit,
    routeCount: evidence.authenticatedRuntime.routes.length,
    economicConservation: evidence.authenticatedRuntime.economics.valueConserved,
    exactReplayRecognized: evidence.authenticatedRuntime.economics.exactReplayRecognized,
    containmentComplete: Object.values(evidence.containment).every(Boolean),
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(sanitize(error));
    process.exitCode = 1;
  });
}
