import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
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

Deno.test("player login returns a one-time token without internal UUIDs", async () => {
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
      roster_label: "Table 4",
      player_identifier: "CARD-200",
      status: "active",
    })],
    player_access_credentials: [row({
      id: CREDENTIAL,
      player_id: PLAYER,
      status: "active",
    })],
    player_sessions: [row({ expires_at: EXPIRES_AT })],
  });

  const response = await handlePlayerLoginRequest(
    new Request("https://example.test/player-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameJoinCode: "ABCD-1234",
        playerIdentifier: "CARD-200",
        accessCode: "938204",
      }),
    }),
    dependencies(fake.client, {
      generateSessionToken: () => "ps_one_time_authenticated_token",
    }),
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
  assertEquals(fake.inserts.player_sessions, [{
    game_session_id: GAME,
    player_id: PLAYER,
    session_token_hash: "hash:ps_one_time_authenticated_token",
    status: "active",
    expires_at: EXPIRES_AT,
  }]);
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
  assertEquals(fake.inserts.player_sessions, undefined);
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
      { account_type: "cash", balance: "125.50", currency_code: "ECO" },
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
) {
  const inserts: Record<string, unknown[]> = {};
  const client = {
    from(table: string) {
      const response = responses[table]?.shift();
      if (!response) throw new Error(`Unexpected query for ${table}`);
      return new FakeQuery(table, response, inserts);
    },
  } as unknown as EdgeSupabaseClient;
  return { client, inserts };
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  constructor(
    private readonly table: string,
    private readonly response: { data: unknown; error: null },
    private readonly inserts: Record<string, unknown[]>,
  ) {}

  select(): this {
    return this;
  }

  eq(): this {
    return this;
  }

  insert(value: unknown): this {
    (this.inserts[this.table] ??= []).push(value);
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
      | ((
        value: { data: unknown; error: null },
      ) => TResult1 | PromiseLike<TResult1>)
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
