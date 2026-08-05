import {
  GameJoinCodeReadPersistenceError,
} from "../application/readGameJoinCode.ts";
import {
  createSupabaseGameJoinCodeReadRepository,
} from "./supabaseGameJoinCodeReadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";

Deno.test("Supabase join-code repository applies both owner scope predicates", async () => {
  const client = fixtureClient({
    id: GAME_ID,
    owner_staff_user_id: STAFF_ID,
    name: "Period 4 Economy",
    status: "active",
    game_join_code: "ECO-ALPHA-042",
    game_join_code_status: "active",
    updated_at: "2026-08-04T04:30:00.000Z",
  });
  const repository = createSupabaseGameJoinCodeReadRepository(client);
  const result = await repository.readOwnedGameJoinCode({
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
  });

  assertEquals(client.calls, [
    ["from", "game_sessions"],
    [
      "select",
      "id,owner_staff_user_id,game_join_code,game_join_code_status,updated_at",
    ],
    ["eq", "id", GAME_ID],
    ["eq", "owner_staff_user_id", STAFF_ID],
    ["maybeSingle"],
  ]);
  assertEquals(result, {
    gameSessionId: GAME_ID,
    ownerStaffUserId: STAFF_ID,
    gameJoinCode: "ECO-ALPHA-042",
    joinCodeStatus: "active",
    updatedAt: "2026-08-04T04:30:00.000Z",
  });
});

Deno.test("Supabase join-code repository returns null for a non-owned row", async () => {
  const repository = createSupabaseGameJoinCodeReadRepository(
    fixtureClient(null),
  );
  const result = await repository.readOwnedGameJoinCode({
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
  });
  assertEquals(result, null);
});

Deno.test("Supabase join-code repository hides query and malformed-row details", async () => {
  for (
    const client of [
      fixtureClient(null, { message: "relation game_sessions missing" }),
      fixtureClient({ id: GAME_ID }),
    ]
  ) {
    try {
      await createSupabaseGameJoinCodeReadRepository(client)
        .readOwnedGameJoinCode({
          gameSessionId: GAME_ID,
          staffUserId: STAFF_ID,
        });
    } catch (error) {
      if (error instanceof GameJoinCodeReadPersistenceError) continue;
      throw error;
    }
    throw new Error("Expected a sanitized persistence error.");
  }
});

function fixtureClient(
  data: Record<string, unknown> | null,
  error: { readonly message: string } | null = null,
) {
  const calls: unknown[] = [];
  const builder = {
    select(columns: string) {
      calls.push(["select", columns]);
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return builder;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve({ data, error });
    },
  };
  return {
    calls,
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
  };
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
