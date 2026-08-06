import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

export const ADMIN_V2_FIXTURE_GAME_ID = "10000000-0000-4000-8000-000000000001";
export const ADMIN_V2_FIXTURE_OPAQUE_GAME_ID = "phase1reviewgame0001";
export const ADMIN_V2_FIXTURE_ADMIN_ID = "20000000-0000-4000-8000-000000000002";
export const ADMIN_V2_FIXTURE_CSRF = "C".repeat(43);
export const ADMIN_V2_FIXTURE_LONG_ADMIN_NAME =
  "Dr. Alexandria Montgomery-Rivera — International Economics Program Administrator";
export const ADMIN_V2_FIXTURE_LONG_GAME_NAME =
  "Northreach Intercontinental Cooperative Classroom Economy — Semester Four Extended Cohort";
export const ADMIN_V2_FIXTURE_LONG_PLAYER_NAME =
  "Avery Jean-Baptiste-Wojciechowski — Cooperative Markets Research Fellowship";
export const ADMIN_V2_RAW_BACKEND_DIAGNOSTIC =
  "SELECT * FROM private.staff_users; SUPABASE_SERVICE_ROLE_KEY; service_role; backend/supabase/functions/admin-api/index.ts:99";

export const ADMIN_V2_FIXTURE_PERMISSIONS = Object.freeze([
  "account.read",
  "audit.read",
  "attendance.manage",
  "business.manage",
  "contracts.manage",
  "economy.adjust",
  "game.create",
  "game.read",
  "game.switch",
  "game.update",
  "inventory.redeem",
  "market.manage",
  "marketplace.moderate",
  "messaging.moderate",
  "players.manage",
  "progression.review",
  "settings.manage",
  "store.manage",
  "world.manage",
]);

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});
const VERCEL_REPORT_ONLY_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob: https:; media-src 'self'; font-src 'self' data:; form-action 'self' https://*.supabase.co; manifest-src 'self'; worker-src 'self' blob:; require-trusted-types-for 'script'; trusted-types econovaria";

function fixtureGame(gameId = ADMIN_V2_FIXTURE_GAME_ID) {
  return {
    id: gameId,
    gameSessionId: gameId,
    ownerId: ADMIN_V2_FIXTURE_ADMIN_ID,
    name: ADMIN_V2_FIXTURE_LONG_GAME_NAME,
    title: ADMIN_V2_FIXTURE_LONG_GAME_NAME,
    status: "active",
    gameCode: "NORTH7",
    joinCode: "NORTH7",
  };
}

function fixtureUser() {
  return {
    id: ADMIN_V2_FIXTURE_ADMIN_ID,
    email: "alexandria.admin@example.test",
    displayName: ADMIN_V2_FIXTURE_LONG_ADMIN_NAME,
    role: "game_admin",
  };
}

function permissionsForScenario(scenario) {
  return scenario === "permission"
    ? ADMIN_V2_FIXTURE_PERMISSIONS.filter((permission) => permission !== "game.read")
    : [...ADMIN_V2_FIXTURE_PERMISSIONS];
}

function sessionTimes({ expired = false } = {}) {
  const direction = expired ? -1 : 1;
  return {
    expiresAt: new Date(Date.now() + direction * 60 * 60 * 1000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + direction * 8 * 60 * 60 * 1000).toISOString(),
  };
}

export function createAdminV2FixtureSession(scenario = "ready") {
  const expired = new Set([
    "expired",
    "revoked",
    "security-version-invalid",
  ]).has(scenario);
  const gameId = scenario === "legacy-handoff"
    ? ADMIN_V2_FIXTURE_OPAQUE_GAME_ID
    : ADMIN_V2_FIXTURE_GAME_ID;
  return {
    authenticated: true,
    ...sessionTimes({ expired }),
    assuranceLevel: "aal2",
    mfaRequired: true,
    user: fixtureUser(),
    csrfToken: ADMIN_V2_FIXTURE_CSRF,
    activeGameSessions: [fixtureGame(gameId)],
    permissions: permissionsForScenario(scenario),
    roles: ["game_admin"],
    adminRole: "game_admin",
    refreshedAt: new Date().toISOString(),
  };
}

function responseEnvelope(data, requestId) {
  return {
    data,
    error: null,
    meta: {
      requestId,
      fixture: "admin-v2-phase1",
    },
  };
}

function dashboardData({ empty = false, gameId = ADMIN_V2_FIXTURE_GAME_ID } = {}) {
  return {
    game: fixtureGame(gameId),
    totalPlayers: empty ? 0 : 32,
    attendanceDate: "2026-08-06",
    attendanceLocked: false,
    attendanceCounts: empty
      ? { present: 0, late: 0, absent: 0, excused: 0, total: 0 }
      : { present: 24, late: 3, absent: 4, excused: 1, total: 32 },
    attendanceSummary: empty
      ? { presentCount: 0, lateCount: 0, absentCount: 0, excusedCount: 0, activePlayerCount: 0 }
      : { presentCount: 24, lateCount: 3, absentCount: 4, excusedCount: 1, activePlayerCount: 32 },
    attendance: empty
      ? []
      : [
        {
          id: "30000000-0000-4000-8000-000000000003",
          playerId: "40000000-0000-4000-8000-000000000004",
          displayName: ADMIN_V2_FIXTURE_LONG_PLAYER_NAME,
          rosterLabel: "Research cohort A",
          status: "present",
          clockedInAt: "2026-08-06T08:01:00.000Z",
          source: "scanner",
        },
      ],
    leaderboardBasis: "net-worth",
    leaderboard: empty
      ? []
      : [
        {
          id: "40000000-0000-4000-8000-000000000004",
          playerId: "40000000-0000-4000-8000-000000000004",
          rank: 1,
          displayName: ADMIN_V2_FIXTURE_LONG_PLAYER_NAME,
          netWorth: 12850.75,
          cashBalance: 4250.25,
          currencyCode: "ECO",
          online: true,
        },
        {
          id: "50000000-0000-4000-8000-000000000005",
          playerId: "50000000-0000-4000-8000-000000000005",
          rank: 2,
          displayName: "Jordan Kim",
          netWorth: 11040,
          cashBalance: 3900,
          currencyCode: "ECO",
          online: false,
        },
      ],
    contracts: empty
      ? []
      : [
        {
          id: "60000000-0000-4000-8000-000000000006",
          ownerId: ADMIN_V2_FIXTURE_ADMIN_ID,
          title: "Regional Supply Chain Resilience Briefing",
          description: "Prepare an evidence-backed response to the current logistics disruption.",
          status: "active",
          category: "World Economy",
          deadlineAt: "2026-08-14T15:00:00.000Z",
          submittedCount: 14,
          completedCount: 9,
          targeting: {
            playerId: "40000000-0000-4000-8000-000000000004",
            cohort: "All active players",
          },
        },
      ],
    notifications: empty
      ? []
      : [
        {
          id: "70000000-0000-4000-8000-000000000007",
          title: "Attendance review recommended",
          description: "Four players have not checked in.",
          type: "attendance",
          priority: "medium",
          read: false,
          createdAt: "2026-08-06T08:30:00.000Z",
        },
      ],
    notificationCount: empty ? 0 : 2,
  };
}

function notificationsData({ empty = false } = {}) {
  return {
    notifications: empty
      ? []
      : [
        {
          id: "70000000-0000-4000-8000-000000000007",
          ownerId: ADMIN_V2_FIXTURE_ADMIN_ID,
          title: "Attendance review recommended",
          message: "Four players have not checked in.",
          type: "attendance",
          priority: "medium",
          read: false,
          createdAt: "2026-08-06T08:30:00.000Z",
        },
        {
          id: "80000000-0000-4000-8000-000000000008",
          title: "Contract submissions ready",
          message: "Nine submissions are ready for review.",
          type: "contracts",
          priority: "normal",
          read: false,
          createdAt: "2026-08-06T08:22:00.000Z",
        },
      ],
    notificationCount: empty ? 0 : 2,
    notificationPreferences: { inConsole: true },
    implementationStatus: "available",
  };
}

function storeData({ empty = false } = {}) {
  return {
    items: empty
      ? []
      : [
        {
          id: "90000000-0000-4000-8000-000000000009",
          ownerId: ADMIN_V2_FIXTURE_ADMIN_ID,
          key: "transit-pass",
          name: "Regional transit pass",
          status: "active",
          price: 45,
          currencyCode: "ECO",
          stockQuantity: 18,
          purchaseStats: { purchaseCount: 12, unitsSold: 15, revenue: 675 },
        },
      ],
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [decodeURIComponent(part), ""];
      return [
        decodeURIComponent(part.slice(0, separator)),
        decodeURIComponent(part.slice(separator + 1)),
      ];
    }));
}

function sendJson(response, status, payload, requestId = "", extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "cache-control": "private, no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
    ...(requestId ? { "x-request-id": requestId } : {}),
    ...extraHeaders,
  });
  response.end(body);
}

function sendRawFailure(response, requestId = "admin-v2-fixture-failure") {
  // A malformed successful transport response exercises the same safe failed
  // state without Chromium itself emitting a network-status console error. The
  // intentionally unsafe body must still be consumed and discarded by the API
  // adapter rather than reaching the UI.
  response.writeHead(200, {
    "cache-control": "private, no-store",
    "content-length": Buffer.byteLength(ADMIN_V2_RAW_BACKEND_DIAGNOSTIC),
    "content-type": "text/plain; charset=utf-8",
    "x-request-id": requestId,
  });
  response.end(ADMIN_V2_RAW_BACKEND_DIAGNOSTIC);
}

function sendFailure(response, status, code, {
  requestId = `admin-v2-fixture-${status}`,
  retryable = false,
  retryAfter = "",
} = {}) {
  sendJson(response, status, {
    error: {
      code,
      message: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
      details: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
      retryable,
      requestId,
    },
    requestId,
    diagnostic: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
  }, requestId, {
    "x-fixture-error-code": code,
    ...(retryAfter ? { "retry-after": retryAfter } : {}),
  });
}

function delayForResponse(milliseconds, response) {
  return new Promise((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      response.removeListener("close", done);
      resolve();
    }
    response.once("close", done);
  });
}

function runtimeConfigSource(origin) {
  return `window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({
    environment: "development",
    projectRef: "localdevelopment0000",
    supabaseUrl: origin,
    apiProxyUrl: origin,
    supabasePublishableKey: "sb_publishable_admin_v2_browser_fixture",
  })});\n`;
}

function sendHtml(response, body) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "text/html; charset=utf-8",
  });
  response.end(body);
}

function signInFixtureSource(reason = "") {
  const safeReason = String(reason || "").replace(/[^a-z0-9-]/gi, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Administrator sign in</title></head><body><main><h1>Administrator sign in</h1><p data-auth-reason="${safeReason}">Session boundary fixture</p></main></body></html>`;
}

function legacyHandoffFixtureSource() {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Existing Admin</title></head><body><main><h1>Existing Admin fixture target</h1></main></body></html>";
}

function safeStaticPath(repositoryRoot, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_error) {
    return null;
  }
  if (decoded === "/") decoded = "/index.html";
  if (decoded.endsWith("/")) decoded += "index.html";
  const candidate = path.resolve(repositoryRoot, `.${decoded}`);
  return candidate.startsWith(`${repositoryRoot}${path.sep}`) ? candidate : null;
}

function serveStatic(request, response, repositoryRoot, pathname) {
  const filePath = safeStaticPath(repositoryRoot, pathname);
  if (!filePath) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid path");
    return;
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch (_error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  if (!stats.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const headers = {
    "cache-control": "no-store",
    "content-length": stats.size,
    "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "content-security-policy-report-only": VERCEL_REPORT_ONLY_CSP,
    "x-content-type-options": "nosniff",
  };
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

function requestRecord(request, scenario, runId, pathname) {
  return Object.freeze({
    method: request.method,
    pathname,
    scenario,
    runId,
    apikey: String(request.headers.apikey || ""),
    authorization: String(request.headers.authorization || ""),
    deviceId: String(request.headers["x-econovaria-device-id"] || ""),
    gameId: String(request.headers["x-econovaria-game-id"] || ""),
  });
}

export async function startAdminV2FixtureServer({
  host = "127.0.0.1",
  port = 0,
  repositoryRoot = REPOSITORY_ROOT,
} = {}) {
  const requests = [];
  const requestCounts = new Map();
  let origin = "";

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", origin || `http://${host}`);
    const cookies = parseCookies(request.headers.cookie);
    const scenario = String(cookies["admin-v2-scenario"] || "ready");
    const runId = String(cookies["admin-v2-run"] || "unscoped");

    if (
      requestUrl.pathname === "/"
      && requestUrl.searchParams.get("mode") === "admin"
      && scenario !== "ready"
    ) {
      sendHtml(response, signInFixtureSource(requestUrl.searchParams.get("reason")));
      return;
    }

    if (requestUrl.pathname === "/admin/" && scenario === "legacy-handoff") {
      sendHtml(response, legacyHandoffFixtureSource());
      return;
    }

    if (requestUrl.pathname === "/runtime-config.env.js") {
      const body = runtimeConfigSource(origin);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(body),
        "content-type": "application/javascript; charset=utf-8",
      });
      response.end(body);
      return;
    }

    const webSessionPrefix = "/functions/v1/web-session-api";
    if (requestUrl.pathname === `${webSessionPrefix}/status`) {
      requests.push(requestRecord(request, scenario, runId, "/session/status"));
      if (scenario === "session-validating") {
        await delayForResponse(650, response);
        if (response.destroyed) return;
      }
      const statusFailures = {
        unauthenticated: [401, "auth_required"],
        expired: [401, "session_expired"],
        revoked: [401, "staff_session_revoked"],
        "security-version-invalid": [401, "staff_session_security_version_invalid"],
      };
      if (statusFailures[scenario]) {
        const [status, code] = statusFailures[scenario];
        sendFailure(response, status, code, { requestId: `admin-v2-${scenario}-status` });
        return;
      }
      const session = createAdminV2FixtureSession(scenario);
      sendJson(response, 200, {
        ok: true,
        session: {
          authenticated: true,
          expiresAt: session.expiresAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
          assuranceLevel: session.assuranceLevel,
          mfaRequired: session.mfaRequired,
        },
        user: session.user,
        activeGameSessions: session.activeGameSessions,
        csrfToken: session.csrfToken,
      });
      return;
    }

    const bffPrefix = `${webSessionPrefix}/proxy`;
    if (!requestUrl.pathname.startsWith(bffPrefix)) {
      serveStatic(request, response, repositoryRoot, requestUrl.pathname);
      return;
    }

    const upstreamPath = requestUrl.pathname.slice(bffPrefix.length) || "/";
    requests.push(requestRecord(request, scenario, runId, upstreamPath));
    const countKey = `${runId}:${upstreamPath}`;
    const requestCount = (requestCounts.get(countKey) || 0) + 1;
    requestCounts.set(countKey, requestCount);

    if (upstreamPath === "/session/bootstrap") {
      if (scenario === "session-validating") {
        await delayForResponse(350, response);
        if (response.destroyed) return;
      }
      const gameId = scenario === "legacy-handoff"
        ? ADMIN_V2_FIXTURE_OPAQUE_GAME_ID
        : ADMIN_V2_FIXTURE_GAME_ID;
      sendJson(response, 200, responseEnvelope({
        admin: fixtureUser(),
        activeGame: fixtureGame(gameId),
        games: [fixtureGame(gameId)],
        permissions: permissionsForScenario(scenario),
        roles: ["game_admin"],
        adminRole: "game_admin",
      }, "admin-v2-bootstrap"));
      return;
    }

    const gameId = scenario === "legacy-handoff"
      ? ADMIN_V2_FIXTURE_OPAQUE_GAME_ID
      : ADMIN_V2_FIXTURE_GAME_ID;
    const overviewPath = `/games/${gameId}/dashboard`;
    const storePath = `/games/${gameId}/store/items`;
    const isOverviewRead = upstreamPath === overviewPath
      || upstreamPath === "/games"
      || upstreamPath === "/notifications"
      || upstreamPath === storePath;

    if (!isOverviewRead || request.method !== "GET") {
      sendJson(response, 404, responseEnvelope(null, "admin-v2-unknown-route"));
      return;
    }

    if (scenario === "loading") {
      await delayForResponse(2_500, response);
      if (response.destroyed) return;
    }

    if (scenario === "stale" && requestCount > 1) {
      await delayForResponse(250, response);
      if (response.destroyed) return;
    }

    if (
      upstreamPath === overviewPath
      && (scenario === "failed" || (scenario === "stale" && requestCount > 1))
    ) {
      sendRawFailure(response, `admin-v2-${scenario}-dashboard`);
      return;
    }

    const overviewFailure = {
      "aal2-required": [403, "MFA_REQUIRED", false, ""],
      "api-401": [401, "SESSION_EXPIRED", false, ""],
      "permission-403": [403, "PERMISSION_DENIED", false, ""],
      "rate-limited-429": [429, "RATE_LIMIT_EXCEEDED", true, "7"],
      "retryable-5xx": [503, "UPSTREAM_UNAVAILABLE", true, ""],
    }[scenario];
    if (overviewFailure) {
      const [status, code, retryable, retryAfter] = overviewFailure;
      sendFailure(response, status, code, {
        requestId: `admin-v2-${scenario}`,
        retryable,
        retryAfter,
      });
      return;
    }

    const empty = scenario === "empty";
    if (upstreamPath === overviewPath) {
      sendJson(response, 200, responseEnvelope(dashboardData({ empty, gameId }), "admin-v2-dashboard"));
      return;
    }
    if (upstreamPath === "/games") {
      sendJson(response, 200, responseEnvelope({ games: [fixtureGame()] }, "admin-v2-games"));
      return;
    }
    if (upstreamPath === "/notifications") {
      sendJson(response, 200, responseEnvelope(notificationsData({ empty }), "admin-v2-notifications"));
      return;
    }
    if (upstreamPath === storePath) {
      sendJson(response, 200, responseEnvelope(storeData({ empty }), "admin-v2-store"));
      return;
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Admin v2 fixture server did not expose a TCP address.");
  }
  origin = `http://${host}:${address.port}`;

  return Object.freeze({
    origin,
    route: `${origin}/admin/v2.html?game=${ADMIN_V2_FIXTURE_GAME_ID}#overview`,
    requestsFor(runId) {
      return requests.filter((entry) => entry.runId === runId);
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections?.();
      });
    },
  });
}

async function runFixtureServerCli() {
  const requestedPort = Number(process.env.ADMIN_V2_FIXTURE_PORT || 4318);
  const fixture = await startAdminV2FixtureServer({
    port: Number.isSafeInteger(requestedPort) && requestedPort > 0 ? requestedPort : 4318,
  });
  process.stdout.write(`Admin v2 fixture: ${fixture.route}\n`);

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await fixture.close().catch(() => {});
    process.exit(0);
  }
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  await runFixtureServerCli();
}
