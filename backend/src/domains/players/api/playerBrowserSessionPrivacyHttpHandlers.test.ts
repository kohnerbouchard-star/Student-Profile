import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { normalizeJoinCode } from "../../game-sessions/index.ts";
import {
  normalizePlayerIdentifier,
  normalizeStudentCode,
} from "../identifiers.ts";
import { normalizePlayerIdentifier as canonicalPlayerIdentifier } from "../domain/playerIdentifiers.ts";
import { normalizeStudentCode as canonicalStudentCode } from "../domain/playerAccessCodes.ts";
import { handlePlayerLoginRequest } from "./playerLoginHttpHandler.ts";
import { handlePlayerSessionBootstrapRequest } from "./playerSessionBootstrapHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const CREDENTIAL = "00000000-0000-4000-8000-000000000031";
const NOW = Date.parse("2026-07-18T09:00:00.000Z");
const EXPIRES_AT = "2026-07-18T21:00:00.000Z";
const THROTTLE_BUCKETS = [
  { dimension: "account" as const, keyHash: "a".repeat(64) },
  { dimension: "device" as const, keyHash: "b".repeat(64) },
  { dimension: "ip" as const, keyHash: "c".repeat(64) },
];

Deno.test("public identifier normalizers preserve canonical identity and validation", () => {
  assertEquals(normalizePlayerIdentifier === canonicalPlayerIdentifier, true);
  assertEquals(normalizeStudentCode === canonicalStudentCode, true);
  assertEquals(normalizeJoinCode("  ab cd-1234  "), "ABCD-1234");
  assertEquals(normalizeStudentCode("  se cret-4826  "), "SECRET-4826");
  assertEquals(normalizePlayerIdentifier("  rfid: ab_12-3  "), "RFID:AB_12-3");

  for (const [normalize, value, code] of [
    [normalizeJoinCode, " ", "game_join_code_required"],
    [normalizeJoinCode, "a!", "invalid_game_join_code"],
    [normalizeStudentCode, " ", "student_code_required"],
    [normalizeStudentCode, "a!", "invalid_student_code"],
    [normalizePlayerIdentifier, " ", "player_identifier_required"],
    [normalizePlayerIdentifier, "a!", "invalid_player_identifier"],
    [normalizePlayerIdentifier, "a".repeat(129), "player_identifier_too_long"],
  ] as const) {
    let caught: unknown;
    try {
      normalize(value);
    } catch (error) {
      caught = error;
    }
    assertEquals(caught instanceof EdgeActivationError, true);
    assertEquals((caught as EdgeActivationError).code, code);
    assertEquals((caught as EdgeActivationError).status, 400);
    assertEquals((caught as EdgeActivationError).retryable, false);
  }
});

Deno.test("player login returns a one-time token without internal UUIDs", async () => {
  const verifiedCodes: string[] = [];
  const fake = fakeClient(
    {
      game_sessions: [row({
        id: GAME,
        name: "Period 2",
        status: "active",
        game_join_code_status: "active",
      })],
      players: [row({
        id: PLAYER,
        display_name: "Alex Rivera",
        roster_label: "Table 4",
        player_identifier: "CARD-200",
        status: "active",
      })],
      player_access_credentials: [row({
        id: CREDENTIAL,
        player_id: PLAYER,
        status: "active",
        normalized_student_code_hash: "d".repeat(64),
        credential_version: "pbkdf2-sha256-v2",
        credential_salt: "A".repeat(22),
        credential_verifier: "B".repeat(43),
        credential_iterations: 600_000,
      })],
    },
    {
      create_player_session_v2: rowList([{
        session_id: SESSION,
        expires_at: EXPIRES_AT,
      }]),
    },
  );

  const response = await handlePlayerLoginRequest(
    new Request("https://example.test/player-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameJoinCode: "  ab cd-1234  ",
        playerIdentifier: "  ca rd-200  ",
        accessCode: "  938 204  ",
      }),
    }),
    {
      ...dependencies(fake.client, {
        generateSessionToken: () => "ps_one_time_authenticated_token",
      }),
      verifyCredential: async (normalizedCode: string) => {
        verifiedCodes.push(normalizedCode);
        return true;
      },
    },
  );

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  const body = await response.json();
  assertEquals(body, {
    ok: true,
    gameSession: { name: "Period 2", status: "active" },
    player: {
      displayName: "Alex Rivera",
      rosterLabel: "Table 4",
      playerIdentifier: "CARD-200",
      status: "active",
    },
    session: {
      token: "ps_one_time_authenticated_token",
      status: "active",
      expiresAt: EXPIRES_AT,
    },
  });
  assertNoUuid(JSON.stringify(body));
  assertEquals(verifiedCodes, ["938204"]);
  assertEquals(fake.filters.includes(JSON.stringify(["game_sessions", "game_join_code_hash", "hash:ABCD-1234"])), true);
  assertEquals(fake.filters.includes(JSON.stringify(["players", "game_session_id", GAME])), true);
  assertEquals(fake.filters.includes(JSON.stringify(["players", "player_identifier_normalized", "CARD-200"])), true);
  assertEquals(fake.filters.includes(JSON.stringify(["player_access_credentials", "game_session_id", GAME])), true);
  assertEquals(fake.filters.includes(JSON.stringify(["player_access_credentials", "player_id", PLAYER])), true);
  assertEquals(fake.rpcs, [{
    functionName: "create_player_session_v2",
    args: {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_session_token_hash: "hash:ps_one_time_authenticated_token",
      p_expires_at: EXPIRES_AT,
    },
  }]);
});

Deno.test("invalid login identifiers fail before a service client is created", async () => {
  const fake = fakeClient({});
  let clientCreations = 0;
  for (const [field, value, code] of [
    ["gameJoinCode", "invalid!", "invalid_game_join_code"],
    ["playerIdentifier", "invalid!", "invalid_player_identifier"],
    ["accessCode", "invalid!", "invalid_student_code"],
  ] as const) {
    const response = await handlePlayerLoginRequest(
      new Request("https://example.test/player-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameJoinCode: "ABCD-1234",
          playerIdentifier: "CARD-200",
          accessCode: "938204",
          [field]: value,
        }),
      }),
      {
        ...dependencies(fake.client),
        createServiceClient: () => {
          clientCreations += 1;
          return fake.client;
        },
      },
    );
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error.code, code);
  }
  assertEquals(clientCreations, 0);
  assertEquals(fake.rpcs, []);
});

Deno.test("player login fails closed when a legacy player lacks a public identifier", async () => {
  const fake = fakeClient({
    game_sessions: [row({
      id: GAME,
      name: "Period 2",
      status: "active",
      game_join_code_status: "active",
    })],
    players: [row({
      id: PLAYER,
      display_name: "Alex Rivera",
      roster_label: null,
      player_identifier: "",
      status: "active",
    })],
  });

  const response = await handlePlayerLoginRequest(
    loginRequest(),
    dependencies(fake.client),
  );

  assertEquals(response.status, 401);
  const serialized = JSON.stringify(await response.json());
  assertEquals(serialized.includes(PLAYER), false);
  assertEquals(serialized.includes("CARD-200"), false);
  assertEquals(fake.rpcs, []);
});

Deno.test("player bootstrap derives scope from token and returns no token or UUID", async () => {
  const fake = fakeClient({
    player_sessions: [row({
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: EXPIRES_AT,
      revoked_at: null,
    })],
    game_sessions: [row({ id: GAME, name: "Period 2", status: "active" })],
    players: [row({
      id: PLAYER,
      display_name: "Alex Rivera",
      roster_label: "Table 4",
      player_identifier: "CARD-200",
      status: "active",
    })],
    account_balances: [rowList([
      { account_type: "checking", balance: "125.50", currency_code: "ECO" },
    ])],
  });

  const response = await handlePlayerSessionBootstrapRequest(
    new Request("https://example.test/players/me", {
      headers: { "x-player-session-token": "ps_authenticated" },
    }),
    bootstrapDependencies(fake.client),
  );

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  const body = await response.json();
  assertEquals(body.gameSession, { name: "Period 2", status: "active" });
  assertEquals(body.player.playerIdentifier, "CARD-200");
  assertEquals(body.session, { status: "active", expiresAt: EXPIRES_AT });
  assertEquals(body.balances[0].balance, 125.5);
  const serialized = JSON.stringify(body);
  assertNoUuid(serialized);
  assertEquals(serialized.includes("ps_authenticated"), false);
});

Deno.test("player bootstrap rejects UUID-shaped public identifier without internal fallback", async () => {
  const fake = fakeClient({
    player_sessions: [row({
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: EXPIRES_AT,
      revoked_at: null,
    })],
    game_sessions: [row({ id: GAME, name: "Period 2", status: "active" })],
    players: [row({
      id: PLAYER,
      display_name: "Alex Rivera",
      roster_label: null,
      player_identifier: PLAYER,
      status: "active",
    })],
  });

  const response = await handlePlayerSessionBootstrapRequest(
    new Request("https://example.test/players/me", {
      headers: { "x-player-session-token": "ps_authenticated" },
    }),
    bootstrapDependencies(fake.client),
  );

  assertEquals(response.status, 401);
  const serialized = JSON.stringify(await response.json());
  assertEquals(serialized.includes(PLAYER), false);
  assertEquals(serialized.includes("ps_authenticated"), false);
});

function loginRequest(): Request {
  return new Request("https://example.test/player-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      gameJoinCode: "ABCD-1234",
      playerIdentifier: "CARD-200",
      accessCode: "938204",
    }),
  });
}

function dependencies(
  client: EdgeSupabaseClient,
  overrides: { readonly generateSessionToken?: () => string } = {},
) {
  return {
    createServiceClient: () => client,
    readEnvironment: environment,
    hashValue: (value: string) => Promise.resolve(`hash:${value}`),
    generateSessionToken: overrides.generateSessionToken,
    now: () => NOW,
    buildThrottleBuckets: async () => THROTTLE_BUCKETS,
    checkThrottle: async () => ({
      allowed: true,
      retryAfterSeconds: 0,
      limitingDimension: null,
      failureCount: 0,
      lockedUntil: null,
    }),
    recordFailure: async () => ({
      allowed: false,
      retryAfterSeconds: 0,
      limitingDimension: null,
      failureCount: 1,
      lockedUntil: null,
    }),
    recordSuccess: async () => {},
    verifyCredential: async () => true,
  };
}

function bootstrapDependencies(client: EdgeSupabaseClient) {
  return {
    createServiceClient: () => client,
    readEnvironment: environment,
    hashSessionToken: (value: string) => Promise.resolve(`hash:${value}`),
    now: () => NOW,
  };
}

function environment() {
  return {
    ok: true as const,
    value: {
      supabaseUrl: "http://localhost:54321",
      supabaseAnonKey: "anon",
      supabaseServiceRoleKey: "service",
    },
  };
}

function row(data: unknown) {
  return { data, error: null };
}

function rowList(data: readonly unknown[]) {
  return { data, error: null };
}

function fakeClient(
  responses: Record<string, Array<{ data: unknown; error: null }>>,
  rpcResponses: Record<string, { data: unknown; error: null }> = {},
) {
  const rpcs: Array<{ functionName: string; args: unknown }> = [];
  const filters: string[] = [];
  const client = {
    from(table: string) {
      const response = responses[table]?.shift();
      if (!response) throw new Error(`Unexpected query for ${table}`);
      return new FakeQuery(response, table, filters);
    },
    rpc(functionName: string, args: unknown) {
      rpcs.push({ functionName, args });
      const response = rpcResponses[functionName];
      if (!response) throw new Error(`Unexpected RPC: ${functionName}`);
      return Promise.resolve(response);
    },
  } as unknown as EdgeSupabaseClient;
  return { client, rpcs, filters };
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  constructor(
    private readonly response: { data: unknown; error: null },
    private readonly table: string,
    private readonly filters: string[],
  ) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push(JSON.stringify([this.table, column, value]));
    return this;
  }

  order(): this {
    return this;
  }

  maybeSingle(): Promise<{ data: unknown; error: null }> {
    return Promise.resolve(this.response);
  }

  single(): Promise<{ data: unknown; error: null }> {
    return Promise.resolve(this.response);
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

function assertNoUuid(value: string): void {
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(value)
  ) {
    throw new Error(`Unexpected internal UUID in browser response: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
