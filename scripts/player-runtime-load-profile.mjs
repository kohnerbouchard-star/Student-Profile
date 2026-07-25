#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_LOAD_OUTPUT_DIR || "/tmp/econovaria-player-load";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const EXPECTED_PLAYERS = 30;
const MAX_PLAYERS = 40;
const CREATE_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const LOGIN_P95_LIMIT_MS = 15_000;
const READ_P95_LIMIT_MS = 8_000;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
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

const players = Object.freeze(Array.from({ length: MAX_PLAYERS }, (_, index) => playerAt(index + 1)));

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return Math.round(sorted[position] * 100) / 100;
}

function summarize(values) {
  if (!values.length) return { count: 0, minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, meanMs: 0 };
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
    .replace(/ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g, "[game-code-redacted]")
    .replace(/(?:BROWSER|LOAD)-(?:PLAYER|ACCESS)-[A-Z0-9-]+/g, "[credential-redacted]")
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
    return { ok: response.ok, status: response.status, elapsedMs, payload };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: performance.now() - startedAt,
      payload: null,
      networkError: error?.name === "AbortError" ? "timeout" : sanitize(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function platformHeaders(publishableKey, token = publishableKey) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
  };
}

async function adminSession(publishableKey) {
  const signIn = await requestJson("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(publishableKey),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!signIn.ok || !signIn.payload?.access_token) {
    throw new Error(`Admin sign-in failed with status ${signIn.status}.`);
  }
  const accessToken = signIn.payload.access_token;
  const bootstrap = await requestJson("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(publishableKey, accessToken),
  });
  if (!bootstrap.ok || bootstrap.payload?.ok !== true) {
    throw new Error(`Staff bootstrap failed with status ${bootstrap.status}.`);
  }
  const game = (bootstrap.payload.activeGameSessions || []).find((item) => item?.name === GAME_NAME) ||
    bootstrap.payload.activeGameSessions?.[0];
  if (!game?.id || !game?.gameCode) throw new Error("The load-test game or readable Game Code is unavailable.");
  return { accessToken, gameId: game.id, gameCode: game.gameCode };
}

async function runPool(items, concurrency, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function ensurePlayers({ publishableKey, accessToken, gameId }) {
  const additional = players.slice(2);
  return runPool(additional, CREATE_CONCURRENCY, async (player) => {
    const response = await requestJson(`/functions/v1/admin-api/games/${encodeURIComponent(gameId)}/players`, {
      method: "POST",
      headers: {
        ...platformHeaders(publishableKey, accessToken),
        "x-econovaria-game-id": gameId,
        "x-request-id": crypto.randomUUID(),
      },
      body: {
        displayName: player.displayName,
        rosterLabel: "Connected load profile",
        playerIdentifier: player.playerIdentifier,
        accessCode: player.accessCode,
      },
    });
    if (response.status === 201 || response.status === 409) return { ok: true, status: response.status };
    return { ok: false, status: response.status, error: sanitize(response.payload?.error?.message || response.networkError) };
  });
}

async function loginPlayer(player, gameCode, publishableKey) {
  const response = await requestJson("/functions/v1/classroom-api/players/login", {
    method: "POST",
    headers: {
      ...platformHeaders(publishableKey),
      "x-request-id": crypto.randomUUID(),
    },
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
    error: response.ok ? "" : sanitize(response.payload?.error?.message || response.networkError),
  };
}

async function readWave(sessions, publishableKey) {
  const startedAt = performance.now();
  const results = await Promise.all(sessions.flatMap((session, playerIndex) =>
    READ_PATHS.map(async (path) => {
      const response = await requestJson(`/functions/v1/classroom-api${path}`, {
        headers: {
          ...platformHeaders(publishableKey),
          "x-player-session-token": session.token,
          "x-econovaria-player-session-token": session.token,
          "x-request-id": crypto.randomUUID(),
        },
      });
      return {
        player: playerIndex + 1,
        path,
        ok: response.ok,
        status: response.status,
        elapsedMs: response.elapsedMs,
        error: response.ok ? "" : sanitize(response.payload?.error?.message || response.networkError),
      };
    })
  ));
  return { elapsedMs: performance.now() - startedAt, results };
}

function statuses(results) {
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
  return counts;
}

function assertPhase(label, results, latencyLimitMs) {
  const failures = results.filter((result) => !result.ok);
  const serverErrors = results.filter((result) => result.status >= 500);
  const p95 = percentile(results.map((result) => result.elapsedMs), 0.95);
  if (serverErrors.length) throw new Error(`${label} produced ${serverErrors.length} server errors.`);
  if (failures.length) {
    const summary = failures.slice(0, 5).map((failure) => ({ status: failure.status, error: failure.error }));
    throw new Error(`${label} produced ${failures.length} failed requests: ${JSON.stringify(summary)}`);
  }
  if (p95 > latencyLimitMs) throw new Error(`${label} p95 ${Math.round(p95)}ms exceeded ${latencyLimitMs}ms.`);
}

const evidence = {
  generatedAt: new Date().toISOString(),
  profile: {
    expectedConcurrentPlayers: EXPECTED_PLAYERS,
    maximumConcurrentPlayers: MAX_PLAYERS,
    readPathsPerPlayer: READ_PATHS.length,
  },
  players: { requested: MAX_PLAYERS, createdOrExisting: 0, createFailures: 0 },
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
  const creation = await ensurePlayers({ ...session, publishableKey });
  const createFailures = creation.filter((result) => !result.ok);
  evidence.players.createdOrExisting = creation.length - createFailures.length + 2;
  evidence.players.createFailures = createFailures.length;
  if (createFailures.length) throw new Error(`Could not create ${createFailures.length} load-test Players.`);

  const baselineStart = performance.now();
  const baselineLogins = await Promise.all(players.slice(0, EXPECTED_PLAYERS).map((player) =>
    loginPlayer(player, session.gameCode, publishableKey)
  ));
  assertPhase("30-player concurrent login", baselineLogins, LOGIN_P95_LIMIT_MS);
  const baselineSessions = baselineLogins.map(({ token }) => ({ token }));
  const baselineReads = await readWave(baselineSessions, publishableKey);
  assertPhase("30-player connected read wave", baselineReads.results, READ_P95_LIMIT_MS);
  evidence.baseline30 = {
    elapsedMs: Math.round((performance.now() - baselineStart) * 100) / 100,
    login: summarize(baselineLogins.map((result) => result.elapsedMs)),
    loginStatuses: statuses(baselineLogins),
    reads: summarize(baselineReads.results.map((result) => result.elapsedMs)),
    readStatuses: statuses(baselineReads.results),
    readWaveElapsedMs: Math.round(baselineReads.elapsedMs * 100) / 100,
    requestCount: baselineLogins.length + baselineReads.results.length,
  };

  const remainingLogins = await Promise.all(players.slice(EXPECTED_PLAYERS).map((player) =>
    loginPlayer(player, session.gameCode, publishableKey)
  ));
  assertPhase("10-player maximum-capacity login", remainingLogins, LOGIN_P95_LIMIT_MS);
  const allSessions = [...baselineSessions, ...remainingLogins.map(({ token }) => ({ token }))];
  const burstStart = performance.now();
  const burstReads = await readWave(allSessions, publishableKey);
  assertPhase("40-player connected read wave", burstReads.results, READ_P95_LIMIT_MS);
  evidence.burst40 = {
    elapsedMs: Math.round((performance.now() - burstStart) * 100) / 100,
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
  evidence.rawInternalIdentifiersRecorded = UUID_PATTERN.test(serialized);
  if (evidence.rawInternalIdentifiersRecorded) {
    failure ||= new Error("Load evidence contained a raw internal identifier.");
  }
  await writeFile(`${OUTPUT_DIR}/player-runtime-load-profile.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  expectedPlayers: EXPECTED_PLAYERS,
  maximumPlayers: MAX_PLAYERS,
  baselineLoginP95Ms: evidence.baseline30.login.p95Ms,
  baselineReadP95Ms: evidence.baseline30.reads.p95Ms,
  burstReadP95Ms: evidence.burst40.reads.p95Ms,
  serverErrors: 0,
}));
