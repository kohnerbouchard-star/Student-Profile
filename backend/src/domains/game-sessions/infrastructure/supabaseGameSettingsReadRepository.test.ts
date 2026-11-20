import {
  GameSettingsReadPersistenceError,
} from "../application/readGameSettings.ts";
import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import {
  createSupabaseGameSettingsReadRepository,
  GAME_SETTINGS_READ_COLUMNS,
} from "./supabaseGameSettingsReadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";

Deno.test("Supabase settings read repository alone projects shared-read scope", async () => {
  const row = {
    difficulty_preset: "hard",
    attendance_window: {},
    business_market_window: {},
    stock_market_window: {},
    news_schedule: {},
    updated_at: "2026-08-05T02:45:00.000Z",
  };
  const client = fixtureClient({ game_settings: response(row) });
  const repository = createSupabaseGameSettingsReadRepository(client);
  const applicationContext = context();

  const result = await repository.readGameSettings({ applicationContext });

  assertSame(result, row);
  assertEquals(client.calls, [
    ["from", "game_settings"],
    ["select", "game_settings", GAME_SETTINGS_READ_COLUMNS],
    ["eq", "game_settings", "game_session_id", GAME_ID],
    ["maybeSingle", "game_settings"],
  ]);
  const serializedCalls = JSON.stringify(client.calls);
  assertEquals(serializedCalls.includes(STAFF_ID), false);
  assertEquals(serializedCalls.includes(applicationContext.requestId), false);
});

Deno.test("Supabase settings repository preserves Admin dual-table star reads", async () => {
  const settings = { game_session_id: GAME_ID, difficulty_preset: "moderate" };
  const difficultyPolicy = {
    game_session_id: GAME_ID,
    source: "preset",
  };
  const client = fixtureClient({
    game_settings: response(settings),
    game_difficulty_policy_settings: response(difficultyPolicy),
  });
  const repository = createSupabaseGameSettingsReadRepository(client);

  const result = await repository.readAdminGameSettingsView({
    applicationContext: context(),
  });

  assertSame(result.settings, settings);
  assertSame(result.difficultyPolicy, difficultyPolicy);
  assertEquals(client.calls, [
    ["from", "game_settings"],
    ["select", "game_settings", "*"],
    ["eq", "game_settings", "game_session_id", GAME_ID],
    ["maybeSingle", "game_settings"],
    ["from", "game_difficulty_policy_settings"],
    ["select", "game_difficulty_policy_settings", "*"],
    [
      "eq",
      "game_difficulty_policy_settings",
      "game_session_id",
      GAME_ID,
    ],
    ["maybeSingle", "game_difficulty_policy_settings"],
  ]);
});

Deno.test("Supabase settings repository preserves null rows for both read shapes", async () => {
  const client = fixtureClient({
    game_settings: response(null),
    game_difficulty_policy_settings: response(null),
  });
  const repository = createSupabaseGameSettingsReadRepository(client);

  assertEquals(
    await repository.readGameSettings({ applicationContext: context() }),
    null,
  );
  assertEquals(
    await repository.readAdminGameSettingsView({
      applicationContext: context(),
    }),
    { settings: null, difficultyPolicy: null },
  );
});

Deno.test("Supabase settings repository sanitizes query and malformed-row failures", async () => {
  for (
    const client of [
      fixtureClient({
        game_settings: response(null, {
          message: "private game_settings schema detail",
        }),
      }),
      fixtureClient({
        game_settings: response(
          [] as unknown as Record<string, unknown>,
        ),
      }),
      fixtureClient({
        game_settings: response({}),
        game_difficulty_policy_settings: response(null, {
          message: "private policy schema detail",
        }),
      }),
    ]
  ) {
    let failure: Error | null = null;
    try {
      if (client.responses.game_difficulty_policy_settings) {
        await createSupabaseGameSettingsReadRepository(client)
          .readAdminGameSettingsView({ applicationContext: context() });
      } else {
        await createSupabaseGameSettingsReadRepository(client)
          .readGameSettings({ applicationContext: context() });
      }
    } catch (error) {
      failure = error instanceof Error ? error : null;
    }
    assertEquals(failure instanceof GameSettingsReadPersistenceError, true);
    assertEquals(failure?.message, "Game settings persistence read failed.");
  }
});

interface FixtureResponse {
  readonly data: Record<string, unknown> | null;
  readonly error: { readonly message?: string } | null;
}

function response(
  data: Record<string, unknown> | null,
  error: { readonly message?: string } | null = null,
): FixtureResponse {
  return { data, error };
}

function fixtureClient(responses: Record<string, FixtureResponse>) {
  const calls: unknown[] = [];
  return {
    calls,
    responses,
    from(table: string) {
      calls.push(["from", table]);
      const builder = {
        select(columns: string) {
          calls.push(["select", table, columns]);
          return builder;
        },
        eq(column: string, value: unknown) {
          calls.push(["eq", table, column, value]);
          return builder;
        },
        maybeSingle() {
          calls.push(["maybeSingle", table]);
          return Promise.resolve(
            responses[table] ?? response(null, { message: "missing fixture" }),
          );
        },
      };
      return builder;
    },
  };
}

function context(): GameSessionsStaffApplicationContext {
  return Object.freeze({
    gameSessionId: GAME_ID,
    actor: Object.freeze({ kind: "staff" as const, staffUserId: STAFF_ID }),
    role: "game_admin" as const,
    permissions: Object.freeze(["settings.manage"]),
    requestId: "server-request-settings-read-001",
    assuranceLevel: "aal2" as const,
  });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error("Expected identical references.");
}
