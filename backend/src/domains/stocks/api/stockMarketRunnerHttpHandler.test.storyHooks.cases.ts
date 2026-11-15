import { handleStockMarketRunnerRequest } from "./stockMarketRunnerHttpHandler.ts";
import {
  assertEquals,
  dependencies,
  GAME_SESSION_ID,
  MockRunnerRepository,
  readJson,
  request,
  SECRET,
  WALL_CLOCK_TIME,
} from "./stockMarketRunnerHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock market runner creates storyline hook from factory after successful tick", async () => {
  const serviceClient = { source: "test-client" };
  const calls: unknown[] = [];
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      createServiceClient: () => serviceClient,
      createStorylineRunnerAfterTick: (client) => async (input) => {
        calls.push({ client, input });
      },
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(calls, [{
    client: serviceClient,
    input: {
      gameSessionId: GAME_SESSION_ID,
      currentMarketTick: 4,
      generatedAt: WALL_CLOCK_TIME,
    },
  }]);
});

Deno.test("stock market runner invokes storyline hook with wall-clock time after successful tick", async () => {
  const calls: unknown[] = [];
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      now: () => new Date("2026-08-10T00:15:00.000Z"),
      runStorylineEventsAfterTick: async (input) => {
        calls.push(input);
      },
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.generatedAt, "tick-4");
  assertEquals(calls, [{
    gameSessionId: GAME_SESSION_ID,
    currentMarketTick: 4,
    generatedAt: "2026-08-10T00:15:00.000Z",
  }]);
});

Deno.test("stock market runner rejects invalid wall-clock timestamps", async () => {
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({ now: () => new Date(Number.NaN) }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "stock_market_clock_invalid");
});

Deno.test("stock market runner keeps successful tick response when storyline hook fails", async () => {
  const failures: unknown[] = [];
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      runStorylineEventsAfterTick: async () => {
        throw new Error("storyline repository unavailable");
      },
      logStorylineRunnerFailure: (failure) => failures.push(failure),
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.tickIndex, 4);
  assertEquals(failures, [{
    code: "storyline_runner_after_stock_tick_failed",
    message: "storyline repository unavailable",
    retryable: true,
  }]);
});

Deno.test("default Story hook reads only after tick persistence and stops effects on context failure", async () => {
  const repository = new MockRunnerRepository();
  const reads: { table: string; applied: number }[] = [];
  const failures: unknown[] = [];
  const failure = new Error("context transport unavailable");
  const client = {
    from(table: string) {
      reads.push({ table, applied: repository.applyCalls });
      throw failure;
    },
    rpc() { throw new Error("Story effects must not start after a failed context read."); },
  };
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    {
      ...dependencies({
        repository,
        createServiceClient: () => client,
        logStorylineRunnerFailure: (entry) => failures.push(entry),
      }),
      createStorylineRunnerAfterTick: undefined,
    },
  );

  assertEquals(response.status, 200);
  assertEquals(repository.applyCalls, 1);
  assertEquals(reads, [
    "players", "player_country_assignments", "account_balances",
    "game_session_stock_assets", "stock_holdings", "game_session_contracts",
    "player_contract_progress", "player_story_relationships", "game_session_story_flags",
  ].map((table) => ({ table, applied: 1 })));
  assertEquals(failures, [{
    code: "storyline_runner_after_stock_tick_failed",
    message: failure.message,
    retryable: true,
  }]);
});

Deno.test("default Story hook reads scoped contexts before Story work after the tick", async () => {
  const repository = new MockRunnerRepository();
  const reads: { table: string; applied: number; filters: [string, unknown][] }[] = [];
  const failures: unknown[] = [];
  const client = {
    from(table: string) {
      const read = { table, applied: repository.applyCalls, filters: [] as [string, unknown][] };
      reads.push(read);
      const query = {
        select(_columns: string) { return query; },
        eq(column: string, value: unknown) { read.filters.push([column, value]); return query; },
        order(_column: string, _options?: unknown) { return query; },
        then(resolve: (result: { data: never[]; error: null }) => unknown) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc() { throw new Error("No Story effect should be written without an event."); },
  };
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    {
      ...dependencies({
        repository,
        createServiceClient: () => client,
        logStorylineRunnerFailure: (entry) => failures.push(entry),
      }),
      createStorylineRunnerAfterTick: undefined,
    },
  );
  assertEquals(response.status, 200);
  assertEquals(repository.applyCalls, 1);
  assertEquals(failures, []);
  assertEquals(reads.map(({ table }) => table), [
    "players", "player_country_assignments", "account_balances",
    "game_session_stock_assets", "stock_holdings", "game_session_contracts",
    "player_contract_progress", "player_story_relationships", "game_session_story_flags",
    "game_session_storylines", "game_session_story_flags",
  ]);
  for (const read of reads) {
    assertEquals(read.applied, 1);
    assertEquals(read.filters.some(([key, value]) => key === "game_session_id" && value === GAME_SESSION_ID), true);
  }
});
