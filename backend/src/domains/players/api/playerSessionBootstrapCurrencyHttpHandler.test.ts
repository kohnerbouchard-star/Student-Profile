import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { handlePlayerSessionBootstrapRequest } from "./playerSessionBootstrapHttpHandler.ts";

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const COUNTRY = "00000000-0000-4000-8000-000000000041";
const NOW = Date.parse("2026-08-08T07:00:00.000Z");
const EXPIRES_AT = "2026-08-08T19:00:00.000Z";

Deno.test(
  "player bootstrap resolves assigned local currency when Checking has multiple currencies",
  async () => {
    const fake = fakeClient({
      player_sessions: [row({
        id: SESSION,
        game_session_id: GAME,
        player_id: PLAYER,
        status: "active",
        expires_at: EXPIRES_AT,
        revoked_at: null,
      })],
      game_sessions: [row({
        id: GAME,
        name: "Period 2",
        status: "active",
      })],
      players: [row({
        id: PLAYER,
        display_name: "Alex Rivera",
        roster_label: "Table 4",
        player_identifier: "CARD-200",
        status: "active",
      })],
      account_balances: [rowList([
        { account_type: "checking", balance: "400.00", currency_code: "ECO" },
        { account_type: "checking", balance: "125.50", currency_code: "SYN" },
        { account_type: "savings", balance: "25.00", currency_code: "SYN" },
      ])],
      player_country_assignments: [row({
        country_profile_id: COUNTRY,
      })],
      country_profiles: [row({
        currency_code: "SYN",
      })],
    });

    const response = await handlePlayerSessionBootstrapRequest(
      new Request("https://example.test/players/me", {
        headers: { "x-player-session-token": "ps_authenticated" },
      }),
      {
        createServiceClient: () => fake.client,
        readEnvironment: environment,
        hashSessionToken: (value: string) => Promise.resolve(`hash:${value}`),
        now: () => NOW,
      },
    );

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.player.currencyCode, "SYN");
    assertEquals(body.balances, [
      { accountType: "checking", balance: 400, currencyCode: "ECO" },
      { accountType: "checking", balance: 125.5, currencyCode: "SYN" },
      { accountType: "savings", balance: 25, currencyCode: "SYN" },
    ]);
    assertEquals(fake.tables, [
      "player_sessions",
      "game_sessions",
      "players",
      "account_balances",
      "player_country_assignments",
      "country_profiles",
    ]);
    assertNoUuid(JSON.stringify(body));
  },
);

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
  const tables: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      const response = responses[table]?.shift();
      if (!response) throw new Error(`Unexpected query for ${table}`);
      return new FakeQuery(response);
    },
  } as unknown as EdgeSupabaseClient;
  return { client, tables };
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  constructor(
    private readonly response: { data: unknown; error: null },
  ) {}

  select(): this {
    return this;
  }

  eq(): this {
    return this;
  }

  order(): this {
    return this;
  }

  maybeSingle(): Promise<{ data: unknown; error: null }> {
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
