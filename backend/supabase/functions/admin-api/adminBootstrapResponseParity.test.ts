import { ensureOwnedGame, gameDto, selectGame } from "./common.ts";
import { handleAdminBootstrapGlobalRoute } from "./adminBootstrapRoutes.ts";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { handleGameRead } from "./gameRoutes.ts";

const STAFF_ID = "staff-route-fixture-id";
const AUTH_USER_ID = "auth-route-fixture-id";
const INTERNAL_OWNER = "internal-owner-must-not-leak";
const INTERNAL_REQUEST_ID = "internal-request-id-must-not-leak";
const BEARER_SECRET = "bearer-secret-must-not-leak";
const SERVICE_SECRET = "service-secret-must-not-leak";
const EXPIRES_AT_SECONDS = 1_780_000_000;

const FIRST_GAME = gameRow({
  id: "first-game",
  name: "First",
  status: "archived",
  game_join_code: null,
});
const ACTIVE_GAME = gameRow({
  id: "active-game",
  name: "Active",
  status: "active",
  game_join_code: "ACTIVE7",
});

Deno.test("Admin game DTO remains byte-shape exact after hydration", () => {
  assertEquals(gameDto(FIRST_GAME), {
    id: "first-game",
    gameId: "first-game",
    name: "First",
    status: "archived",
    joinCodeStatus: "unknown",
    joinCode: "",
    gameCode: "",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  });
  assertEquals(gameDto(ACTIVE_GAME), {
    id: "active-game",
    gameId: "active-game",
    name: "Active",
    status: "active",
    joinCodeStatus: "ready",
    joinCode: "ACTIVE7",
    gameCode: "ACTIVE7",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  });
});

Deno.test("Admin zero, one, and multi-game selection behavior remains exact", () => {
  assertEquals(selectGame({ games: [] }, request()), null);
  assert(
    selectGame({ games: [FIRST_GAME] }, request("not-owned")) === FIRST_GAME,
  );

  const games = [FIRST_GAME, ACTIVE_GAME];
  assert(
    selectGame({ games }, request("first-game")) === FIRST_GAME,
    "An exact owned header must win even for an inactive game.",
  );
  assert(
    selectGame({ games }, request("not-owned")) === ACTIVE_GAME,
    "An invalid header must select the first active game.",
  );
  assert(
    selectGame({ games }, request(), "first-game") === FIRST_GAME,
    "A server-selected ID must take precedence over the header.",
  );
  assert(
    selectGame(
      { games: [FIRST_GAME, { ...ACTIVE_GAME, status: "paused" }] },
      request(),
    ) === FIRST_GAME,
    "When no game is active, discovery order must choose the first game.",
  );
});

Deno.test("Admin ownership checks preserve exact hydrated row references", () => {
  const games = [FIRST_GAME, ACTIVE_GAME];
  assert(ensureOwnedGame({ games }, "active-game") === ACTIVE_GAME);
  assertEquals(ensureOwnedGame({ games }, "not-owned"), null);
});

Deno.test("Admin bootstrap route preserves its exact multi-game envelope and privacy", async () => {
  const context = routeContext();
  const response = handleAdminBootstrapGlobalRoute(
    new Request("https://example.test/admin-api/session/bootstrap", {
      headers: { "x-econovaria-game-id": "not-owned" },
    }),
    context,
    "/session/bootstrap",
  );
  assert(response !== null);
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store");
  assertEquals(
    body,
    bootstrapEnvelope(
      gameDto(ACTIVE_GAME),
      [gameDto(FIRST_GAME), gameDto(ACTIVE_GAME)],
    ),
  );
  assertBootstrapPrivacy(body);
});

Deno.test("Admin zero-game bootstrap and games routes preserve exact empty envelopes and privacy", async () => {
  const context = routeContext([]);
  const bootstrap = handleAdminBootstrapGlobalRoute(
    new Request("https://example.test/admin-api/session/bootstrap"),
    context,
    "/session/bootstrap",
  );
  assert(bootstrap !== null);
  const bootstrapBody = await bootstrap.json();
  assertEquals(bootstrap.status, 200);
  assertEquals(bootstrap.headers.get("cache-control"), "no-store");
  assertEquals(bootstrapBody, bootstrapEnvelope({}, []));
  assertBootstrapPrivacy(bootstrapBody);

  const games = handleAdminBootstrapGlobalRoute(
    new Request("https://example.test/admin-api/games"),
    context,
    "/games",
  );
  assert(games !== null);
  const gamesBody = await games.json();
  assertEquals(games.status, 200);
  assertEquals(games.headers.get("cache-control"), "no-store");
  assertEquals(gamesBody, { data: { games: [] } });
  assertBootstrapPrivacy(gamesBody);
});

Deno.test("Admin games route preserves all-status discovery order and join-code mapping", async () => {
  const response = handleAdminBootstrapGlobalRoute(
    new Request("https://example.test/admin-api/games"),
    routeContext(),
    "/games",
  );
  assert(response !== null);
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    data: { games: [gameDto(FIRST_GAME), gameDto(ACTIVE_GAME)] },
  });
  assertEquals(body.data.games[0].joinCode, "");
  assertEquals(body.data.games[1].joinCode, "ACTIVE7");
  assertBootstrapPrivacy(body);
});

Deno.test("Admin switch route preserves owned success and non-owned denial envelopes", async () => {
  const context = routeContext();
  const owned = handleAdminBootstrapGlobalRoute(
    new Request(
      "https://example.test/admin-api/games/first-game/switch",
      { method: "POST" },
    ),
    context,
    "/games/first-game/switch",
  );
  assert(owned !== null);
  const ownedBody = await owned.json();
  assertEquals(owned.status, 200);
  assertEquals(ownedBody, { data: { activeGame: gameDto(FIRST_GAME) } });
  assertBootstrapPrivacy(ownedBody);

  const denied = handleAdminBootstrapGlobalRoute(
    new Request(
      "https://example.test/admin-api/games/not-owned/switch",
      { method: "POST" },
    ),
    context,
    "/games/not-owned/switch",
  );
  assert(denied !== null);
  const deniedBody = await denied.json();
  assertEquals(denied.status, 404);
  assertEquals(deniedBody, {
    code: "game_not_found",
    message: "That game is not available to this administrator.",
  });
  assertBootstrapPrivacy(deniedBody);
});

Deno.test("Admin base game route preserves the hydrated game DTO and privacy", async () => {
  const context = routeContext();
  const request = new Request(
    "https://example.test/admin-api/games/first-game",
  );
  const response = await handleGameRead(
    request,
    context,
    new URL(request.url),
    FIRST_GAME,
    FIRST_GAME.id,
    "",
    context.gameBootstrapEntries[0].applicationContext,
  );
  assert(response !== null);
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, { data: { game: gameDto(FIRST_GAME) } });
  assertBootstrapPrivacy(body);
});

Deno.test("Admin dashboard route preserves its response and uses only injected read loaders", async () => {
  const context = routeContext();
  const request = new Request(
    "https://example.test/admin-api/games/active-game/dashboard",
  );
  const players: any[] = [];
  const attendance = {
    attendance: [],
    attendanceRows: [],
    attendanceSummary: {
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      excusedCount: 0,
      scannedCount: 0,
      missingCount: 0,
    },
  };
  const activeContract = { id: "contract-active", status: "active" };
  let playerReads = 0;
  let attendanceReads = 0;
  let contractReads = 0;
  const response = await handleGameRead(
    request,
    context,
    new URL(request.url),
    ACTIVE_GAME,
    ACTIVE_GAME.id,
    "/dashboard",
    context.gameBootstrapEntries[1].applicationContext,
    {
      async loadPlayers(service, gameId) {
        playerReads += 1;
        assert(service === context.service);
        assertEquals(gameId, ACTIVE_GAME.id);
        return players;
      },
      async loadAttendance(service, gameId, receivedPlayers) {
        attendanceReads += 1;
        assert(service === context.service);
        assertEquals(gameId, ACTIVE_GAME.id);
        assert(receivedPlayers === players);
        return attendance;
      },
      async loadContracts(service, gameId) {
        contractReads += 1;
        assert(service === context.service);
        assertEquals(gameId, ACTIVE_GAME.id);
        return [activeContract, { id: "contract-closed", status: "archived" }];
      },
    },
  );
  assert(response !== null);
  const body = await response.json();

  assertEquals(playerReads, 1);
  assertEquals(attendanceReads, 1);
  assertEquals(contractReads, 1);
  assertEquals(response.status, 200);
  assertEquals(body, {
    data: {
      game: gameDto(ACTIVE_GAME),
      leaderboard: [],
      leaderboardBasis: "net_worth",
      leaderboardRankScope: "currency",
      leaderboardComparison: "same_currency_only",
      overallScoreStatus: "not_configured",
      contracts: [activeContract],
      notifications: [],
      notificationCount: 0,
      ...attendance,
    },
  });
  assertBootstrapPrivacy(body);
});

function routeContext(games = [FIRST_GAME, ACTIVE_GAME]) {
  const permissions = [
    "account.read",
    "game.read",
    "game.switch",
  ] as const;
  const security = {
    ok: true as const,
    assuranceLevel: "aal2" as const,
    permissions,
    requiredPermission: "game.read" as const,
  };
  const gameBootstrapEntries = games.map((game) => ({
    game,
    applicationContext: createAdminRequestApplicationContext({
      ownedGame: game,
      staffUserId: STAFF_ID,
      security,
      requestId: INTERNAL_REQUEST_ID,
    }),
  }));

  return {
    token: BEARER_SECRET,
    user: {
      id: AUTH_USER_ID,
      exp: EXPIRES_AT_SECONDS,
      app_metadata: { permission_version: 7, security_version: 9 },
    },
    staff: {
      id: STAFF_ID,
      supabase_auth_user_id: AUTH_USER_ID,
      email: "admin@example.test",
      display_name: "Admin",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-18T00:00:00.000Z",
    },
    games,
    gameBootstrapEntries,
    security,
    service: { credential: SERVICE_SECRET },
  };
}

function bootstrapEnvelope(
  activeGame: unknown,
  games: readonly unknown[],
): Record<string, unknown> {
  return {
    data: {
      admin: {
        id: STAFF_ID,
        accountId: STAFF_ID,
        displayName: "Admin",
        email: "admin@example.test",
        role: "game_admin",
        roles: ["game_admin"],
      },
      activeGame,
      games,
      permissions: ["account.read", "game.read", "game.switch"],
      permissionVersion: 7,
      securityVersion: 9,
      roles: ["game_admin"],
      csrfToken: "",
      session: {
        id: AUTH_USER_ID,
        csrfToken: "",
        assuranceLevel: "aal2",
        expiresAt: new Date(EXPIRES_AT_SECONDS * 1000).toISOString(),
      },
      capabilities: {
        notifications: false,
        securityHistory: "current_session_only",
        helpArticles: true,
        auditLogFlags: true,
        auditLogExport: true,
        overallScore: false,
        marketplaceAdminTrading: false,
        progressionReview: true,
        progressionCorrection: true,
        multiFactorAuthentication: true,
      },
    },
  };
}

function assertBootstrapPrivacy(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (
    const forbidden of [
      INTERNAL_OWNER,
      INTERNAL_REQUEST_ID,
      BEARER_SECRET,
      SERVICE_SECRET,
      '"owner_staff_user_id"',
      '"supabase_auth_user_id"',
      '"gameBootstrapEntries"',
      '"applicationContext"',
      '"requiredPermission"',
      '"requestId"',
    ]
  ) {
    assert(
      !serialized.includes(forbidden),
      `Admin bootstrap response leaked ${forbidden}.`,
    );
  }
}

function gameRow(overrides: {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly game_join_code: string | null;
}) {
  return {
    ...overrides,
    owner_staff_user_id: INTERNAL_OWNER,
    game_join_code_status: overrides.game_join_code ? "ready" : "",
    created_at: "2026-08-17T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
  };
}

function request(gameId = ""): Request {
  return new Request("https://example.test/admin-api/session/bootstrap", {
    headers: gameId ? { "x-econovaria-game-id": gameId } : {},
  });
}

function assert(value: boolean, message = "Assertion failed."): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}
