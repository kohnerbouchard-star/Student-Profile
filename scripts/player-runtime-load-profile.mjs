#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const DATABASE_URL = process.env.DATABASE_URL || "";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_LOAD_OUTPUT_DIR || "/tmp/econovaria-player-load";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const EXPECTED_PLAYERS = 30;
const MAX_PLAYERS = 40;
const REQUEST_TIMEOUT_MS = 30_000;
const LOGIN_P95_LIMIT_MS = 15_000;
const READ_P95_LIMIT_MS = 8_000;
const READ_SCHEDULING = "sequential-per-player";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const GAME_CODE_PATTERN = /ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g;
const CREDENTIAL_PATTERN = /(?:BROWSER|LOAD)-(?:PLAYER|ACCESS)-[A-Z0-9-]+/g;
const READ_PATHS = Object.freeze([
  "/players/me",
  "/players/me/capabilities",
  "/players/me/game/dashboard",
  "/players/me/world-runtime",
  "/players/me/ledger?limit=10",
  "/players/me/inventory",
  "/players/me/progression",
]);

await mkdir(OUTPUT_DIR, { recursive: true });

function playerAt(index) {
  if (index === 1) {
    return {
      displayName: "Browser Player Alpha",
      playerIdentifier: "BROWSER-PLAYER-ALPHA",
      accessCode: "BROWSER-ALPHA-ACCESS-001",
    };
  }
  if (index === 2) {
    return {
      displayName: "Browser Player Beta",
      playerIdentifier: "BROWSER-PLAYER-BETA",
      accessCode: "BROWSER-BETA-ACCESS-002",
    };
  }
  const suffix = String(index).padStart(3, "0");
  return {
    displayName: `Load Player ${suffix}`,
    playerIdentifier: `LOAD-PLAYER-${suffix}`,
    accessCode: `LOAD-ACCESS-${suffix}-2026`,
  };
}

const players = Object.freeze(
  Array.from({ length: MAX_PLAYERS }, (_, index) => playerAt(index + 1)),
);

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return Math.round(sorted[position] * 100) / 100;
}

function summarize(values) {
  if (!values.length) {
    return { count: 0, minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, meanMs: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    minMs: Math.round(Math.min(...values) * 100) / 100,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.round(Math.max(...values) * 100) / 100,
    meanMs: Math.round((total / values.length) * 100) / 100,
  };
}

function sanitize(value) {
  return String(value || "")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(GAME_CODE_PATTERN, "[game-code-redacted]")
    .replace(CREDENTIAL_PATTERN, "[credential-redacted]")
    .slice(0, 500);
}

async function runtimeConfig() {
  const source = await readFile(new URL("../runtime-config.env.js", import.meta.url), "utf8");
  const match = source.match(/Object\.freeze\((\{[\s\S]*\})\);?/);
  if (!match) throw new Error("Runtime configuration could not be parsed.");
  const config = JSON.parse(match[1]);
  const publishableKey = String(config.supabasePublishableKey || "").trim();
  if (!publishableKey || publishableKey.startsWith("sb_secret_")) {
    throw new Error("A browser-safe Supabase publishable key is required.");
  }
  return { publishableKey };
}

async function requestJson(path, {
  method = "GET",
  headers = {},
  body,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const elapsedMs = performance.now() - startedAt;
    const payload = await response.json().catch(() => null);
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    return { ok: response.ok, status: response.status, elapsedMs, payload, setCookies };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: performance.now() - startedAt,
      payload: null,
      setCookies: [],
      networkError: error?.name === "AbortError" ? "timeout" : sanitize(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function publicHeaders(publishableKey, deviceId, extras = {}) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: new URL(BASE_URL).origin,
    apikey: publishableKey,
    "x-econovaria-device-id": deviceId,
    ...extras,
  };
}

function cookieHeader(setCookies) {
  return setCookies
    .map((cookie) => String(cookie || "").split(";", 1)[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function adminSession(publishableKey) {
  const deviceId = crypto.randomUUID();
  const signIn = await requestJson("/functions/v1/web-session-api/login", {
    method: "POST",
    headers: publicHeaders(publishableKey, deviceId),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const cookie = cookieHeader(signIn.setCookies);
  if (!signIn.ok || signIn.payload?.ok !== true || !cookie) {
    throw new Error(`Admin web-session sign-in failed with status ${signIn.status}.`);
  }

  const status = await requestJson("/functions/v1/web-session-api/status", {
    headers: publicHeaders(publishableKey, deviceId, { Cookie: cookie }),
  });
  if (!status.ok || status.payload?.ok !== true || !status.payload?.csrfToken) {
    throw new Error(`Admin web-session status failed with status ${status.status}.`);
  }
  const game = (status.payload.activeGameSessions || []).find((item) => item?.name === GAME_NAME) ||
    status.payload.activeGameSessions?.[0];
  if (!game?.id || !game?.gameCode) {
    throw new Error("The load-test game or readable Game Code is unavailable.");
  }
  return { gameCode: game.gameCode };
}

function requireLoopbackDatabase() {
  let database;
  try {
    database = new URL(DATABASE_URL);
  } catch {
    throw new Error("A valid local DATABASE_URL is required for load fixtures.");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(database.hostname) ||
    database.port !== "54322"
  ) {
    throw new Error("Load fixtures may only be provisioned in the local Supabase database.");
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function seedLocalLoadFixtures() {
  requireLoopbackDatabase();
  const gameName = sqlLiteral(GAME_NAME);
  const sql = `
DO $load_fixture$
DECLARE
  v_game_id uuid;
  v_index integer;
  v_suffix text;
  v_identifier text;
  v_access_code text;
BEGIN
  SELECT id
  INTO STRICT v_game_id
  FROM public.game_sessions
  WHERE name = ${gameName};

  FOR v_index IN 3..40 LOOP
    v_suffix := lpad(v_index::text, 3, '0');
    v_identifier := 'LOAD-PLAYER-' || v_suffix;
    v_access_code := 'LOAD-ACCESS-' || v_suffix || '-2026';

    IF NOT EXISTS (
      SELECT 1
      FROM public.players
      WHERE game_session_id = v_game_id
        AND player_identifier_normalized = v_identifier
        AND status = 'active'
    ) THEN
      PERFORM 1
      FROM public.create_player_with_identity_and_credential(
        v_game_id,
        'Load Player ' || v_suffix,
        'Connected load profile',
        v_identifier,
        v_identifier,
        encode(extensions.digest(v_access_code, 'sha256'), 'hex'),
        jsonb_build_object(
          'route', 'local.connected.load.fixture',
          'fixtureOnly', true
        )
      );
    END IF;
  END LOOP;
END
$load_fixture$;

SELECT
  count(*) FILTER (WHERE p.status = 'active')::text || '|' ||
  count(*) FILTER (WHERE c.status = 'active')::text
FROM public.players p
JOIN public.game_sessions g ON g.id = p.game_session_id
LEFT JOIN public.player_access_credentials c
  ON c.game_session_id = p.game_session_id
 AND c.player_id = p.id
 AND c.status = 'active'
WHERE g.name = ${gameName};
`;

  const result = spawnSync(
    "psql",
    [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", maxBuffer: 1_048_576 },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`Local load fixture provisioning failed: ${sanitize(result.stderr || result.error?.message)}`);
  }
  const counts = String(result.stdout || "").trim().split("|").map(Number);
  if (counts.length !== 2 || counts[0] !== MAX_PLAYERS || counts[1] !== MAX_PLAYERS) {
    throw new Error(`Local load fixtures are incomplete: players=${counts[0] || 0}, credentials=${counts[1] || 0}.`);
  }
  return { players: counts[0], activeCredentials: counts[1] };
}

async function loginPlayer(player, gameCode, publishableKey) {
  const deviceId = crypto.randomUUID();
  const response = await requestJson("/functions/v1/player-api/players/login", {
    method: "POST",
    headers: publicHeaders(publishableKey, deviceId, {
      "x-request-id": crypto.randomUUID(),
    }),
    body: {
      gameJoinCode: gameCode,
      playerIdentifier: player.playerIdentifier,
      accessCode: player.accessCode,
    },
  });
  return {
    ok: response.ok && response.payload?.ok === true && Boolean(response.payload?.session?.token),
    status: response.status,
    elapsedMs: response.elapsedMs,
    token: response.payload?.session?.token || "",
    deviceId,
    error: response.ok ? "" : sanitize(response.payload?.error?.message || response.networkError),
  };
}

async function readWave(sessions, publishableKey) {
  const startedAt = performance.now();
  const perPlayerResults = await Promise.all(sessions.map(async (session, playerIndex) => {
    const results = [];
    for (const path of READ_PATHS) {
      const response = await requestJson(`/functions/v1/player-api${path}`, {
        headers: publicHeaders(publishableKey, session.deviceId, {
          "x-player-session-token": session.token,
          "x-request-id": crypto.randomUUID(),
        }),
      });
      results.push({
        player: playerIndex + 1,
        path,
        ok: response.ok,
        status: response.status,
        elapsedMs: response.elapsedMs,
        error: response.ok ? "" : sanitize(response.payload?.error?.message || response.networkError),
      });
    }
    return results;
  }));
  return {
    elapsedMs: performance.now() - startedAt,
    peakConcurrentRequests: sessions.length,
    results: perPlayerResults.flat(),
  };
}

function statuses(results) {
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
  return counts;
}

function assertReadWaveShape(label, wave, playerCount) {
  const expectedRequests = playerCount * READ_PATHS.length;
  if (wave.peakConcurrentRequests !== playerCount) {
    throw new Error(`${label} peak concurrency ${wave.peakConcurrentRequests} did not equal ${playerCount} Players.`);
  }
  if (wave.results.length !== expectedRequests) {
    throw new Error(`${label} executed ${wave.results.length} reads instead of ${expectedRequests}.`);
  }
  for (let player = 1; player <= playerCount; player += 1) {
    const paths = wave.results
      .filter((result) => result.player === player)
      .map((result) => result.path);
    if (JSON.stringify(paths) !== JSON.stringify(READ_PATHS)) {
      throw new Error(`${label} Player ${player} did not execute the reviewed read sequence exactly once.`);
    }
  }
}

function assertPhase(label, results, latencyLimitMs) {
  const failures = results.filter((result) => !result.ok);
  const serverErrors = results.filter((result) => result.status >= 500);
  const p95 = percentile(results.map((result) => result.elapsedMs), 0.95);
  if (serverErrors.length) throw new Error(`${label} produced ${serverErrors.length} server errors.`);
  if (failures.length) {
    const summary = failures.slice(0, 5).map((failure) => ({
      status: failure.status,
      path: failure.path,
      error: failure.error,
    }));
    throw new Error(`${label} produced ${failures.length} failed requests: ${JSON.stringify(summary)}`);
  }
  if (p95 > latencyLimitMs) {
    throw new Error(`${label} p95 ${Math.round(p95)}ms exceeded ${latencyLimitMs}ms.`);
  }
}

const evidence = {
  generatedAt: new Date().toISOString(),
  profile: {
    expectedConcurrentPlayers: EXPECTED_PLAYERS,
    maximumConcurrentPlayers: MAX_PLAYERS,
    readPathsPerPlayer: READ_PATHS.length,
    readScheduling: READ_SCHEDULING,
    adminControlTransport: "http-only-bff",
    fixtureProvisioning: "loopback-postgres-transactional-rpc",
    playerTransport: "player-api",
  },
  players: { requested: MAX_PLAYERS, provisioned: 0, activeCredentials: 0 },
  baseline30: null,
  burst40: null,
  secretsRecorded: false,
  plaintextGameCodeRecorded: false,
  rawInternalIdentifiersRecorded: false,
};

let failure;
try {
  const { publishableKey } = await runtimeConfig();
  const session = await adminSession(publishableKey);
  const fixtures = seedLocalLoadFixtures();
  evidence.players.provisioned = fixtures.players;
  evidence.players.activeCredentials = fixtures.activeCredentials;

  const baselineStart = performance.now();
  const baselineLogins = await Promise.all(
    players.slice(0, EXPECTED_PLAYERS).map((player) =>
      loginPlayer(player, session.gameCode, publishableKey)
    ),
  );
  assertPhase("30-player concurrent login", baselineLogins, LOGIN_P95_LIMIT_MS);
  const baselineSessions = baselineLogins.map(({ token, deviceId }) => ({ token, deviceId }));
  const baselineReads = await readWave(baselineSessions, publishableKey);
  assertReadWaveShape("30-player connected read wave", baselineReads, EXPECTED_PLAYERS);
  assertPhase("30-player connected read wave", baselineReads.results, READ_P95_LIMIT_MS);
  evidence.baseline30 = {
    elapsedMs: Math.round((performance.now() - baselineStart) * 100) / 100,
    peakConcurrentRequests: baselineReads.peakConcurrentRequests,
    login: summarize(baselineLogins.map((result) => result.elapsedMs)),
    loginStatuses: statuses(baselineLogins),
    reads: summarize(baselineReads.results.map((result) => result.elapsedMs)),
    readStatuses: statuses(baselineReads.results),
    readWaveElapsedMs: Math.round(baselineReads.elapsedMs * 100) / 100,
    requestCount: baselineLogins.length + baselineReads.results.length,
  };

  const remainingLogins = await Promise.all(
    players.slice(EXPECTED_PLAYERS).map((player) =>
      loginPlayer(player, session.gameCode, publishableKey)
    ),
  );
  assertPhase("10-player maximum-capacity login", remainingLogins, LOGIN_P95_LIMIT_MS);
  const allSessions = [
    ...baselineSessions,
    ...remainingLogins.map(({ token, deviceId }) => ({ token, deviceId })),
  ];
  const burstStart = performance.now();
  const burstReads = await readWave(allSessions, publishableKey);
  assertReadWaveShape("40-player connected read wave", burstReads, MAX_PLAYERS);
  assertPhase("40-player connected read wave", burstReads.results, READ_P95_LIMIT_MS);
  evidence.burst40 = {
    elapsedMs: Math.round((performance.now() - burstStart) * 100) / 100,
    peakConcurrentRequests: burstReads.peakConcurrentRequests,
    addedLogin: summarize(remainingLogins.map((result) => result.elapsedMs)),
    addedLoginStatuses: statuses(remainingLogins),
    reads: summarize(burstReads.results.map((result) => result.elapsedMs)),
    readStatuses: statuses(burstReads.results),
    readWaveElapsedMs: Math.round(burstReads.elapsedMs * 100) / 100,
    requestCount: remainingLogins.length + burstReads.results.length,
  };
} catch (error) {
  failure = error;
  evidence.failure = sanitize(error?.stack || error);
} finally {
  evidence.completedAt = new Date().toISOString();
  const serialized = JSON.stringify(evidence, null, 2);
  UUID_PATTERN.lastIndex = 0;
  GAME_CODE_PATTERN.lastIndex = 0;
  CREDENTIAL_PATTERN.lastIndex = 0;
  evidence.rawInternalIdentifiersRecorded = UUID_PATTERN.test(serialized);
  evidence.plaintextGameCodeRecorded = GAME_CODE_PATTERN.test(serialized);
  evidence.secretsRecorded = CREDENTIAL_PATTERN.test(serialized);
  if (
    evidence.rawInternalIdentifiersRecorded ||
    evidence.plaintextGameCodeRecorded ||
    evidence.secretsRecorded
  ) {
    failure ||= new Error("Load evidence contained sensitive fixture material.");
  }
  await writeFile(
    `${OUTPUT_DIR}/player-runtime-load-profile.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  expectedPlayers: EXPECTED_PLAYERS,
  maximumPlayers: MAX_PLAYERS,
  readScheduling: READ_SCHEDULING,
  baselineLoginP95Ms: evidence.baseline30.login.p95Ms,
  baselineReadP95Ms: evidence.baseline30.reads.p95Ms,
  burstReadP95Ms: evidence.burst40.reads.p95Ms,
  serverErrors: 0,
}));
