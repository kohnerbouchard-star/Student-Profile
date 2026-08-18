import { createStaffRequestApplicationContext } from "../../../shared/staffRequestApplicationContextFactory.ts";
import type { StaffRequestApplicationContext } from "../../../shared/staffRequestApplicationContext.ts";
import {
  StaffGameSessionBootstrapPersistenceError,
} from "../application/staffGameSessionBootstrap.ts";
import {
  createSupabaseStaffGameSessionBootstrapRepository,
  STAFF_BOOTSTRAP_PROFILE_COLUMNS,
  STAFF_GAME_SESSION_DISCOVERY_COLUMNS,
  STAFF_GAME_SESSION_HYDRATION_COLUMNS,
  type StaffGameSessionBootstrapSupabaseClient,
} from "./supabaseStaffGameSessionBootstrapRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const STAFF_ID = "staff-1";
const REQUEST_ID = "request-1";

Deno.test("Supabase Staff bootstrap discovers all owner IDs in created order", async () => {
  const client = fakeClient({
    game_sessions: [{
      data: [{ id: "game-new" }, { id: "game-old" }],
      error: null,
    }],
  });
  const repository = createSupabaseStaffGameSessionBootstrapRepository(client);

  const result = await repository.discoverOwnedGameSessionIds({
    staffUserId: STAFF_ID,
    visibility: "all",
  });

  assertEquals(result, ["game-new", "game-old"]);
  assertEquals(client.calls, [
    call("game_sessions", "from", "game_sessions"),
    call("game_sessions", "select", STAFF_GAME_SESSION_DISCOVERY_COLUMNS),
    call("game_sessions", "eq", "owner_staff_user_id", STAFF_ID),
    call("game_sessions", "order", "created_at", { ascending: false }),
    call("game_sessions", "execute"),
  ]);
});

Deno.test("Supabase Staff bootstrap discovery adds the active owner filter", async () => {
  const client = fakeClient({
    game_sessions: [{ data: [], error: null }],
  });
  const repository = createSupabaseStaffGameSessionBootstrapRepository(client);

  await repository.discoverOwnedGameSessionIds({
    staffUserId: STAFF_ID,
    visibility: "active",
  });

  assertEquals(client.calls, [
    call("game_sessions", "from", "game_sessions"),
    call("game_sessions", "select", STAFF_GAME_SESSION_DISCOVERY_COLUMNS),
    call("game_sessions", "eq", "owner_staff_user_id", STAFF_ID),
    call("game_sessions", "eq", "status", "active"),
    call("game_sessions", "order", "created_at", { ascending: false }),
    call("game_sessions", "execute"),
  ]);
});

Deno.test("Supabase Staff bootstrap reads the postguard Staff profile", async () => {
  const client = fakeClient({
    staff_users: [{
      data: {
        id: STAFF_ID,
        supabase_auth_user_id: "auth-1",
        email: "staff@example.test",
        display_name: "Staff One",
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      },
      error: null,
    }],
  });
  const repository = createSupabaseStaffGameSessionBootstrapRepository(client);

  const result = await repository.readStaffBootstrapProfile({
    staffUserId: STAFF_ID,
  });

  assertEquals(result, {
    id: STAFF_ID,
    supabaseAuthUserId: "auth-1",
    email: "staff@example.test",
    displayName: "Staff One",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  });
  assertEquals(client.calls, [
    call("staff_users", "from", "staff_users"),
    call("staff_users", "select", STAFF_BOOTSTRAP_PROFILE_COLUMNS),
    call("staff_users", "eq", "id", STAFF_ID),
    call("staff_users", "maybeSingle"),
  ]);
});

Deno.test("Supabase Staff bootstrap hydrates only the exact active context batch", async () => {
  const contexts = [context("game-new"), context("game-old")];
  const client = fakeClient({
    game_sessions: [{
      data: [row("game-old"), row("game-new")],
      error: null,
    }],
  });
  const repository = createSupabaseStaffGameSessionBootstrapRepository(client);

  const result = await repository.hydrateOwnedGameSessions({
    applicationContexts: contexts,
    visibility: "active",
  });

  assertEquals(result.map((game) => game.id), ["game-old", "game-new"]);
  assertEquals(result[0], {
    id: "game-old",
    ownerStaffUserId: STAFF_ID,
    name: "Game game-old",
    status: "active",
    gameJoinCode: "JOIN12",
    gameJoinCodeStatus: "active",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  });
  assertEquals(client.calls, [
    call("game_sessions", "from", "game_sessions"),
    call("game_sessions", "select", STAFF_GAME_SESSION_HYDRATION_COLUMNS),
    call("game_sessions", "in", "id", ["game-new", "game-old"]),
    call("game_sessions", "eq", "owner_staff_user_id", STAFF_ID),
    call("game_sessions", "eq", "status", "active"),
    call("game_sessions", "execute"),
  ]);
});

Deno.test("Supabase Staff bootstrap all visibility keeps owner revalidation", async () => {
  const client = fakeClient({
    game_sessions: [{
      data: [row("game-1", { status: "archived" })],
      error: null,
    }],
  });
  const repository = createSupabaseStaffGameSessionBootstrapRepository(client);

  const result = await repository.hydrateOwnedGameSessions({
    applicationContexts: [context("game-1")],
    visibility: "all",
  });

  assertEquals(result[0]?.status, "archived");
  assertEquals(
    client.calls.filter((entry) => entry.name === "eq"),
    [call("game_sessions", "eq", "owner_staff_user_id", STAFF_ID)],
  );
});

Deno.test("Supabase Staff bootstrap performs zero queries for an empty batch", async () => {
  const client = fakeClient({});
  const repository = createSupabaseStaffGameSessionBootstrapRepository(client);

  const result = await repository.hydrateOwnedGameSessions({
    applicationContexts: [],
    visibility: "active",
  });

  assertEquals(result, []);
  assertEquals(client.calls, []);
});

Deno.test("Supabase Staff bootstrap rejects an unknown visibility before querying", async () => {
  const client = fakeClient({});
  const repository = createSupabaseStaffGameSessionBootstrapRepository(client);

  await assertPersistenceFailure(() =>
    repository.discoverOwnedGameSessionIds({
      staffUserId: STAFF_ID,
      visibility: "unknown" as "all",
    })
  );
  await assertPersistenceFailure(() =>
    repository.hydrateOwnedGameSessions({
      applicationContexts: [],
      visibility: "unknown" as "all",
    })
  );
  assertEquals(client.calls, []);
});

Deno.test("Supabase Staff bootstrap rejects mixed context identity before querying", async () => {
  const batches: readonly (readonly StaffRequestApplicationContext[])[] = [
    [context("game-1"), context("game-2", { staffUserId: "staff-2" })],
    [context("game-1"), context("game-2", { requestId: "request-2" })],
    [context("game-1"), context("game-1")],
  ];

  for (const applicationContexts of batches) {
    const client = fakeClient({});
    const repository = createSupabaseStaffGameSessionBootstrapRepository(
      client,
    );
    await assertPersistenceFailure(() =>
      repository.hydrateOwnedGameSessions({
        applicationContexts,
        visibility: "all",
      })
    );
    assertEquals(client.calls, []);
  }
});

Deno.test("Supabase Staff bootstrap fails closed on query and row errors", async () => {
  const cases: readonly QueryResponse[] = [
    { data: [], error: { message: "unavailable" } },
    { data: [{ id: "" }], error: null },
    { data: null, error: null },
  ];

  for (const response of cases) {
    const client = fakeClient({ game_sessions: [response] });
    const repository = createSupabaseStaffGameSessionBootstrapRepository(
      client,
    );
    await assertPersistenceFailure(() =>
      repository.discoverOwnedGameSessionIds({
        staffUserId: STAFF_ID,
        visibility: "all",
      })
    );
  }

  const profileClient = fakeClient({
    staff_users: [{ data: { id: STAFF_ID }, error: null }],
  });
  await assertPersistenceFailure(() =>
    createSupabaseStaffGameSessionBootstrapRepository(profileClient)
      .readStaffBootstrapProfile({ staffUserId: STAFF_ID })
  );

  const gameClient = fakeClient({
    game_sessions: [{ data: [{ id: "game-1" }], error: null }],
  });
  await assertPersistenceFailure(() =>
    createSupabaseStaffGameSessionBootstrapRepository(gameClient)
      .hydrateOwnedGameSessions({
        applicationContexts: [context("game-1")],
        visibility: "active",
      })
  );
});

interface QueryResponse {
  readonly data: unknown;
  readonly error: { readonly message?: string } | null;
}

interface QueryCall {
  readonly table: string;
  readonly name: string;
  readonly args: readonly unknown[];
}

interface FakeClient extends StaffGameSessionBootstrapSupabaseClient {
  readonly calls: QueryCall[];
}

function fakeClient(
  queues: Readonly<Record<string, readonly QueryResponse[]>>,
): FakeClient {
  const calls: QueryCall[] = [];
  const mutableQueues = new Map(
    Object.entries(queues).map(([table, responses]) => [table, [...responses]]),
  );
  return {
    calls,
    from(table: string) {
      calls.push(call(table, "from", table));
      const response = mutableQueues.get(table)?.shift();
      if (!response) throw new Error(`No response queued for ${table}.`);
      return new FakeQueryBuilder(table, response, calls);
    },
  };
}

class FakeQueryBuilder {
  constructor(
    private readonly table: string,
    private readonly response: QueryResponse,
    private readonly calls: QueryCall[],
  ) {}

  select(columns: string): this {
    this.calls.push(call(this.table, "select", columns));
    return this;
  }

  eq(column: string, value: unknown): this {
    this.calls.push(call(this.table, "eq", column, value));
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.calls.push(call(this.table, "in", column, [...values]));
    return this;
  }

  order(
    column: string,
    options?: { readonly ascending?: boolean; readonly nullsFirst?: boolean },
  ): this {
    this.calls.push(call(this.table, "order", column, options));
    return this;
  }

  maybeSingle(): PromiseLike<QueryResponse> {
    this.calls.push(call(this.table, "maybeSingle"));
    return Promise.resolve(this.response);
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.calls.push(call(this.table, "execute"));
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

function context(
  gameSessionId: string,
  overrides: { readonly staffUserId?: string; readonly requestId?: string } =
    {},
): StaffRequestApplicationContext {
  return createStaffRequestApplicationContext({
    ownedGame: { id: gameSessionId },
    staff: {
      id: overrides.staffUserId ?? STAFF_ID,
      role: "game_admin",
    },
    assuranceLevel: "aal2",
    requestId: overrides.requestId ?? REQUEST_ID,
    permissions: ["game.read"],
  });
}

function row(
  id: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    owner_staff_user_id: STAFF_ID,
    name: `Game ${id}`,
    status: "active",
    game_join_code: "JOIN12",
    game_join_code_status: "active",
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

function call(table: string, name: string, ...args: unknown[]): QueryCall {
  return { table, name, args };
}

async function assertPersistenceFailure(
  run: () => Promise<unknown>,
): Promise<void> {
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof StaffGameSessionBootstrapPersistenceError);
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed.");
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
