import type {
  PlayerSessionLogoutRecord,
  PlayerSessionLogoutRepository,
} from "../contracts/playerSessionLogoutContracts.ts";
import { PlayerSessionLogoutPersistenceError } from "../contracts/playerSessionLogoutContracts.ts";
import { handlePlayerSessionLogoutRequest } from "./playerSessionLogoutHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = new Date("2026-07-18T09:00:00.000Z");

Deno.test("player logout revokes the token-owned active session without UUID leakage", async () => {
  const response = await handlePlayerSessionLogoutRequest(
    request(),
    { kind: "logout" },
    dependencies(statefulRepository(activeRecord())),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assertEquals(body, {
    ok: true,
    message: "Player session logged out.",
    alreadyLoggedOut: false,
    status: "revoked",
    revokedAt: NOW.toISOString(),
  });
  assertNoUuid(JSON.stringify(body));
});

Deno.test("player logout is idempotent for an already revoked token", async () => {
  const response = await handlePlayerSessionLogoutRequest(
    request(),
    { kind: "logout" },
    dependencies(statefulRepository({
      ...activeRecord(),
      status: "revoked",
      revokedAt: "2026-07-18T08:30:00.000Z",
    })),
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.alreadyLoggedOut, true);
  assertEquals(body.revokedAt, "2026-07-18T08:30:00.000Z");
});

Deno.test("player logout rejects missing token, browser scope, fields, and unsupported methods", async () => {
  const missing = await handlePlayerSessionLogoutRequest(
    request({ token: null }),
    { kind: "logout" },
    dependencies(statefulRepository(activeRecord())),
  );
  assertEquals(missing.status, 401);

  const query = await handlePlayerSessionLogoutRequest(
    request({ path: "/players/me/session/logout?gameSessionId=x" }),
    { kind: "logout" },
    dependencies(statefulRepository(activeRecord())),
  );
  assertEquals(query.status, 400);

  const body = await handlePlayerSessionLogoutRequest(
    request({ body: { sessionId: SESSION } }),
    { kind: "logout" },
    dependencies(statefulRepository(activeRecord())),
  );
  assertEquals(body.status, 400);

  const method = await handlePlayerSessionLogoutRequest(
    request({ method: "GET" }),
    { kind: "logout" },
    dependencies(statefulRepository(activeRecord())),
  );
  assertEquals(method.status, 405);
});

Deno.test("player logout maps concurrent conflicts and persistence failures", async () => {
  const conflictRepo: PlayerSessionLogoutRepository = {
    findByTokenHash: () => Promise.resolve(activeRecord()),
    revokeActiveSession: () => Promise.resolve(null),
  };
  const conflict = await handlePlayerSessionLogoutRequest(
    request(),
    { kind: "logout" },
    dependencies(conflictRepo),
  );
  assertEquals(conflict.status, 409);
  assertEquals((await conflict.json()).error.retryable, true);

  const unavailableRepo: PlayerSessionLogoutRepository = {
    findByTokenHash: () => Promise.reject(
      new PlayerSessionLogoutPersistenceError("unavailable"),
    ),
    revokeActiveSession: () => Promise.resolve(null),
  };
  const unavailable = await handlePlayerSessionLogoutRequest(
    request(),
    { kind: "logout" },
    dependencies(unavailableRepo),
  );
  assertEquals(unavailable.status, 503);
  assertEquals((await unavailable.json()).error.retryable, true);
});

function dependencies(repository: PlayerSessionLogoutRepository) {
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
    resolvePlayerSession: () => Promise.resolve(activeResolution()),
    createRepository: () => repository,
    now: () => NOW,
  };
}

function statefulRepository(
  initial: PlayerSessionLogoutRecord,
): PlayerSessionLogoutRepository {
  let record = { ...initial };
  return {
    findByTokenHash: () => Promise.resolve({ ...record }),
    revokeActiveSession: (input) => {
      if (record.status !== "active" || record.revokedAt !== null) {
        return Promise.resolve(null);
      }
      record = {
        ...record,
        status: "revoked",
        revokedAt: input.revokedAt,
      };
      return Promise.resolve({ ...record });
    },
  };
}

function activeRecord(): PlayerSessionLogoutRecord {
  return {
    internalSessionUuid: SESSION,
    gameId: GAME,
    playerUuid: PLAYER,
    status: "active",
    expiresAt: "2026-07-19T00:00:00.000Z",
    revokedAt: null,
  };
}

function activeResolution() {
  return {
    ok: true as const,
    session: {
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: "2026-07-19T00:00:00.000Z",
      revoked_at: null,
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
  readonly body?: unknown;
} = {}): Request {
  const headers = new Headers();
  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(
    `https://example.test${options.path ?? "/players/me/session/logout"}`,
    {
      method: options.method ?? "POST",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
  );
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
