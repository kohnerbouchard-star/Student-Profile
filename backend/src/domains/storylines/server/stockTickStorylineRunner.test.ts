import { createStockTickStorylineRunner } from "./stockTickStorylineRunner.ts";
import { runDueStorylineEvents } from "../services/storylineRunner.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock-tick Story factory is lazy and reads each game before Story work", async () => {
  const reads: { table: string; filters: [string, unknown][] }[] = [];
  const client = {
    from(table: string) {
      const read = { table, filters: [] as [string, unknown][] };
      reads.push(read);
      const query = {
        select(_columns: string) {
          return query;
        },
        eq(column: string, value: unknown) {
          read.filters.push([column, value]);
          return query;
        },
        order(_column: string, _options?: unknown) {
          return query;
        },
        then(resolve: (result: { data: never[]; error: null }) => unknown) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc() {
      throw new Error("No effects should be written without a Story event.");
    },
  };
  let contractFactoryCalls = 0;
  const hook = createStockTickStorylineRunner(
    client as never,
    (received) => {
      if (received !== client as unknown) {
        throw new Error("Contract adapter received another client");
      }
      contractFactoryCalls += 1;
      return {
        createGameSessionContract() {
          return Promise.reject(new Error("Unexpected Contract write"));
        },
      };
    },
    runDueStorylineEvents,
  );
  assertEquals(contractFactoryCalls, 1);
  assertEquals(reads, []);

  const tables = [
    "players",
    "player_country_assignments",
    "account_balances",
    "game_session_stock_assets",
    "stock_holdings",
    "game_session_contracts",
    "player_contract_progress",
    "player_story_relationships",
    "game_session_story_flags",
    "game_session_storylines",
    "game_session_story_flags",
  ];
  for (const gameSessionId of ["game-1", "game-2"]) {
    const start = reads.length;
    await hook({
      gameSessionId,
      currentMarketTick: 4,
      generatedAt: "2026-08-10T00:15:00.000Z",
    });
    const gameReads = reads.slice(start);
    assertEquals(gameReads.map(({ table }) => table), tables);
    for (const read of gameReads) {
      assertEquals(
        read.filters.some(([key, value]) =>
          key === "game_session_id" && value === gameSessionId
        ),
        true,
      );
    }
  }
  assertEquals(contractFactoryCalls, 1);
});

Deno.test("stock-tick Story factory preserves context and adapter failures", async () => {
  const readFailure = new Error("context transport unavailable");
  const tables: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      throw readFailure;
    },
    rpc() {
      throw new Error(
        "Story effects must not run after a failed context read.",
      );
    },
  };
  const hook = createStockTickStorylineRunner(
    client as never,
    () => ({
      createGameSessionContract() {
        return Promise.reject(new Error("Unexpected Contract write"));
      },
    }),
    runDueStorylineEvents,
  );
  let caught: unknown;
  try {
    await hook({
      gameSessionId: "game-1",
      currentMarketTick: 4,
      generatedAt: "2026-08-10T00:15:00.000Z",
    });
  } catch (error) {
    caught = error;
  }
  if (caught !== readFailure) {
    throw new Error("Context failure identity changed");
  }
  assertEquals(tables, [
    "players",
    "player_country_assignments",
    "account_balances",
    "game_session_stock_assets",
    "stock_holdings",
    "game_session_contracts",
    "player_contract_progress",
    "player_story_relationships",
    "game_session_story_flags",
  ]);

  const factoryFailure = new Error("Contract adapter unavailable");
  let factoryCaught: unknown;
  try {
    createStockTickStorylineRunner(
      client as never,
      () => {
        throw factoryFailure;
      },
      runDueStorylineEvents,
    );
  } catch (error) {
    factoryCaught = error;
  }
  if (factoryCaught !== factoryFailure) {
    throw new Error("Contract adapter failure identity changed");
  }
  assertEquals(tables.length, 9);
});

Deno.test("stock-tick Story factory runs a due Contract effect with the injected writer", async () => {
  const events: string[] = [];
  const contractWrites: unknown[] = [];
  const at = "2026-08-12T03:00:00.000Z";
  let result: Awaited<ReturnType<typeof runDueStorylineEvents>> | undefined;
  const activation = {
    id: "activation-1",
    game_session_id: "game-1",
    storyline_id: "storyline-1",
    status: "active",
    story_started_at: "2026-08-10T00:00:00.000Z",
    paused_at: null,
    accumulated_pause_seconds: 0,
    time_scale: 1,
    created_at: "2026-08-10T00:00:00.000Z",
  };
  const storylineEvent = {
    id: "event-1",
    storyline_id: "storyline-1",
    event_key: "event.contract",
    title: "A Contract",
    description: "A due Story event",
    act: 1,
    sequence: 1,
    trigger_type: "market_tick",
    scheduled_offset_seconds: null,
    scheduled_at: null,
    scheduled_market_tick: 4,
    trigger_condition: {},
    reveal_payload: {},
    public_news_payload: {},
    player_rules: [{
      ruleKey: "eligible-player",
      condition: { type: "player_cash_below", amount: 100 },
      effects: [{
        type: "contract_unlock",
        contractKey: "contract.story-test",
        label: "Story Contract",
        reason: "Respond to the Story event.",
        payload: {},
      }],
    }],
    policy_payloads: [],
    flag_payloads: [],
    contract_unlock_payloads: [],
    priority: "normal",
    is_active: true,
    created_at: "2026-08-10T00:00:00.000Z",
  };
  const client = {
    from(table: string) {
      let inserted: Record<string, unknown> | undefined;
      events.push(`from:${table}`);
      const query = {
        select(_columns: string) {
          return query;
        },
        eq(_column: string, _value: unknown) {
          return query;
        },
        in(_column: string, _values: readonly unknown[]) {
          return query;
        },
        order(_column: string, _options?: unknown) {
          return query;
        },
        insert(row: Record<string, unknown>) {
          inserted = row;
          events.push(`insert:${table}`);
          return query;
        },
        maybeSingle() {
          if (table !== "story_event_resolutions" || !inserted) {
            throw new Error(`Unexpected insert in ${table}`);
          }
          return Promise.resolve({
            data: { id: "resolution-1", ...inserted, created_at: at },
            error: null,
          });
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          const data = table === "players"
            ? [{ id: "player-1" }]
            : table === "game_session_storylines"
            ? [activation]
            : table === "storyline_events"
            ? [storylineEvent]
            : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc() {
      throw new Error("No ledger effect is expected");
    },
  };
  const contractWriter = {
    createGameSessionContract(input: unknown) {
      events.push("contract-write");
      contractWrites.push(input);
      return Promise.resolve({ id: "contract-1" });
    },
  };
  const hook = createStockTickStorylineRunner(
    client as never,
    () => contractWriter,
    async (input) => {
      if (input.effectDependencies.contracts !== contractWriter) {
        throw new Error("Contract writer identity changed");
      }
      events.push("story-runner");
      result = await runDueStorylineEvents(input);
      return result;
    },
  );
  await hook({
    gameSessionId: "game-1",
    currentMarketTick: 4,
    generatedAt: at,
  });
  assertEquals(result?.resolvedCount, 1);
  assertEquals(result?.effectAppliedCount, 1);
  assertEquals(contractWrites.length, 1);
  const written = contractWrites[0] as {
    gameSessionId: string;
    sourceId: string;
    contractKey: string;
    publishedAt: string;
  };
  assertEquals(written.gameSessionId, "game-1");
  assertEquals(written.sourceId, "event-1");
  assertEquals(written.contractKey, "contract.story-test");
  assertEquals(written.publishedAt, at);
  if (
    events.indexOf("story-runner") < 9 ||
    events.indexOf("insert:story_event_resolutions") <
      events.indexOf("story-runner") ||
    events.indexOf("contract-write") <
      events.indexOf("insert:story_event_resolutions")
  ) {
    throw new Error(
      `Story context, resolution, and Contract write order changed: ${
        events.join(", ")
      }`,
    );
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
