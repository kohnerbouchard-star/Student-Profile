import { handlePlayerCapabilityManifestRequest } from "./playerCapabilityManifestHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = new Date("2026-07-18T10:00:00.000Z");

Deno.test("player capability manifest authenticates and returns a UUID-private no-store contract", async () => {
  const response = await handlePlayerCapabilityManifestRequest(
    request(),
    { kind: "manifest" },
    dependencies(activeResolution()),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(
    response.headers.get("vary"),
    "authorization, x-player-session-token",
  );
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(body.schemaVersion, 1);
  assertEquals(body.service, "classroom-api");
  assertEquals(body.capabilities.routes.market, true);
  assertEquals(body.capabilities.routes.portfolio, true);
  assertEquals(body.capabilities.actions.marketOrder, true);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("player capability manifest rejects unsupported methods, malformed paths, and browser scope injection", async () => {
  const deps = dependencies(activeResolution());
  const method = await handlePlayerCapabilityManifestRequest(
    request({ method: "POST" }),
    { kind: "manifest" },
    deps,
  );
  assertError(method, 405, "method_not_allowed");

  const malformed = await handlePlayerCapabilityManifestRequest(
    request({ path: "/players/me/capabilities/extra" }),
    { kind: "malformed" },
    deps,
  );
  assertError(malformed, 400, "invalid_player_capability_request");

  const query = await handlePlayerCapabilityManifestRequest(
    request({ path: "/players/me/capabilities?gameSessionId=x" }),
    { kind: "manifest" },
    deps,
  );
  assertError(query, 400, "invalid_player_capability_request");

  const header = await handlePlayerCapabilityManifestRequest(
    request({ gameScopeHeader: GAME }),
    { kind: "manifest" },
    deps,
  );
  assertError(header, 400, "invalid_player_capability_request");

  const ownershipHeader = await handlePlayerCapabilityManifestRequest(
    request({ playerUuidHeader: PLAYER }),
    { kind: "manifest" },
    deps,
  );
  assertError(ownershipHeader, 400, "invalid_player_request");
});

Deno.test("player capability manifest rejects missing, expired, revoked, and wrong-game sessions", async () => {
  const missing = await handlePlayerCapabilityManifestRequest(
    request({ token: null }),
    { kind: "manifest" },
    dependencies(activeResolution()),
  );
  assertError(missing, 401, "missing_player_session");

  const expired = await handlePlayerCapabilityManifestRequest(
    request(),
    { kind: "manifest" },
    dependencies(activeResolution({
      status: "expired",
      expiresAt: "2026-07-18T09:00:00.000Z",
    })),
  );
  assertError(expired, 401, "player_session_expired");

  const revoked = await handlePlayerCapabilityManifestRequest(
    request(),
    { kind: "manifest" },
    dependencies(activeResolution({
      status: "revoked",
      revokedAt: "2026-07-18T09:30:00.000Z",
    })),
  );
  assertError(revoked, 401, "player_session_revoked");

  const wrongGame = await handlePlayerCapabilityManifestRequest(
    request(),
    { kind: "manifest" },
    dependencies({
      ...activeResolution(),
      gameSession: {
        id: "00000000-0000-4000-8000-000000000099",
        name: "Other game",
        status: "active",
      },
    }),
  );
  assertError(wrongGame, 401, "invalid_player_session_scope");
});

Deno.test("player capability manifest fails closed when runtime configuration is unavailable", async () => {
  const response = await handlePlayerCapabilityManifestRequest(
    request(),
    { kind: "manifest" },
    {
      ...dependencies(activeResolution()),
      readSupabaseEnv: () => ({
        ok: false as const,
        missing: ["SUPABASE_URL"],
      }),
    },
  );
  assertError(response, 500, "missing_edge_runtime_config");
});

function dependencies(resolution: ReturnType<typeof activeResolution>) {
  return {
    createServiceClient: () => ({}) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost:54321",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(resolution),
    now: () => NOW,
  };
}

function activeResolution(overrides: {
  readonly status?: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string | null;
} = {}) {
  return {
    ok: true as const,
    session: {
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: overrides.status ?? "active",
      expires_at: overrides.expiresAt ?? "2026-07-19T00:00:00.000Z",
      revoked_at: overrides.revokedAt ?? null,
    },
    gameSession: {
      id: GAME,
      name: "Game",
      status: "active",
    },
    player: {
      id: PLAYER,
      display_name: "Player",
      roster_label: null,
      status: "active",
    },
  };
}

function request(options: {
  readonly token?: string | null;
  readonly path?: string;
  readonly method?: string;
  readonly gameScopeHeader?: string;
  readonly playerUuidHeader?: string;
} = {}): Request {
  const headers = new Headers();
  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }
  if (options.gameScopeHeader) {
    headers.set("x-econovaria-game-id", options.gameScopeHeader);
  }
  if (options.playerUuidHeader) {
    headers.set("x-player-uuid", options.playerUuidHeader);
  }
  return new Request(
    `https://example.test${options.path ?? "/players/me/capabilities"}`,
    { method: options.method ?? "GET", headers },
  );
}

async function assertError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  assertEquals(response.status, status);
  assertEquals((await response.json()).error.code, code);
}

function assertNoUuid(value: string): void {
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(value)
  ) {
    throw new Error(`UUID leaked: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
