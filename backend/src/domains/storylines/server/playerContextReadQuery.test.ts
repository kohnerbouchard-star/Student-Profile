import * as queryModule from "./playerContextReadQuery.ts";
import { SupabasePlayerStoryContextRepository } from "../infrastructure/supabasePlayerStoryContextRepository.ts";
import { PlayerStoryContextRepositoryError } from "../contracts/playerStoryContextRepositoryContracts.ts";

Deno.test("Story context query exposes only lazy read capability and preserves adapter queries", async () => {
  const client = new FakeReadClient();
  const query = queryModule.createPlayerStoryContextReadQuery(client as never);
  assertEquals(Object.keys(queryModule), ["createPlayerStoryContextReadQuery"]);
  assertEquals(Object.keys(query), ["listPlayerStoryContexts"]);
  assertEquals(client.reads, []);

  const directClient = new FakeReadClient();
  const expected = await new SupabasePlayerStoryContextRepository(
    directClient as never,
  )
    .listPlayerStoryContexts("game-1");
  assertEquals(await query.listPlayerStoryContexts("game-1"), expected);
  assertEquals(client.reads, directClient.reads);
  assertEquals(
    expected.map(({ playerId, gameSessionId }) => ({
      playerId,
      gameSessionId,
    })),
    [
      { playerId: "player-1", gameSessionId: "game-1" },
    ],
  );
  assertEquals(client.reads.length, 9);
  for (const read of client.reads) {
    assertEquals(
      read.operations.some((operation) =>
        JSON.stringify(operation) ===
          JSON.stringify(["eq", "game_session_id", "game-1"])
      ),
      true,
    );
  }
});

Deno.test("Story context query keeps fresh game-scoped reads on its original client", async () => {
  const client = new FakeReadClient();
  const query = queryModule.createPlayerStoryContextReadQuery(client as never);
  assertEquals(
    (await query.listPlayerStoryContexts("game-2")).map(({ playerId }) =>
      playerId
    ),
    ["player-2"],
  );
  await query.listPlayerStoryContexts("game-1");
  client.players.push({
    id: "player-3",
    game_session_id: "game-1",
    status: "active",
  });
  assertEquals(
    (await query.listPlayerStoryContexts("game-1")).map(({ playerId }) =>
      playerId
    ),
    ["player-1", "player-3"],
  );
  assertEquals(client.reads.length, 27);
});

Deno.test("Story context query preserves provider errors and thrown error identity", async () => {
  const client = new FakeReadClient();
  client.failedTable = "players";
  const error = await rejection(
    queryModule.createPlayerStoryContextReadQuery(client as never)
      .listPlayerStoryContexts("game-1"),
  );
  if (!(error instanceof PlayerStoryContextRepositoryError)) throw error;
  assertEquals({
    code: error.code,
    table: error.tableName,
    operation: error.operation,
  }, {
    code: "player_story_context_players_select_failed",
    table: "players",
    operation: "select",
  });
  const failure = new Error("context transport unavailable");
  const throwingClient = {
    from() {
      throw failure;
    },
  };
  assertEquals(
    await rejection(
      queryModule.createPlayerStoryContextReadQuery(throwingClient as never)
        .listPlayerStoryContexts("game-1"),
    ) === failure,
    true,
  );
});

type Row = Record<string, unknown>;
type Read = { table: string; operations: unknown[][] };
type Result = { data: Row[] | null; error: { message: string } | null };

class FakeReadClient {
  readonly reads: Read[] = [];
  readonly players: Row[] = [
    { id: "player-1", game_session_id: "game-1", status: "active" },
    { id: "player-2", game_session_id: "game-2", status: "active" },
    { id: "inactive", game_session_id: "game-1", status: "inactive" },
  ];
  failedTable?: string;

  from(table: string) {
    const read: Read = { table, operations: [] };
    this.reads.push(read);
    return new FakeReadQuery(
      read,
      () =>
        table === this.failedTable
          ? { data: null, error: { message: "provider unavailable" } }
          : { data: table === "players" ? this.players : [], error: null },
    );
  }
}

class FakeReadQuery implements PromiseLike<Result> {
  constructor(
    private readonly read: Read,
    private readonly result: () => Result,
  ) {}
  select(columns: string) {
    this.read.operations.push(["select", columns]);
    return this;
  }
  eq(column: string, value: unknown) {
    this.read.operations.push(["eq", column, value]);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.read.operations.push(["in", column, values]);
    return this;
  }
  order(column: string, options: unknown) {
    this.read.operations.push(["order", column, options]);
    return this;
  }
  then<T = Result, U = never>(
    fulfilled?: ((value: Result) => T | PromiseLike<T>) | null,
    rejected?: ((reason: unknown) => U | PromiseLike<U>) | null,
  ): Promise<T | U> {
    const result = this.result();
    const data =
      result.data?.filter((row) =>
        this.read.operations.every(([kind, column, value]) =>
          kind !== "eq" || row[column as string] === value
        )
      ) ?? null;
    return Promise.resolve({ ...result, data }).then(fulfilled, rejected);
  }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected a rejected context read.");
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
