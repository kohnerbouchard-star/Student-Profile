import {
  SupabaseStockMarketNewsRepository,
  toMarketNewsRealtimePayload,
} from "./supabaseStockMarketNewsRepository.ts";
import {
  StockMarketNewsError,
  type StockMarketNewsInsertInput,
} from "../contracts/stockMarketNewsContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("market news repository inserts stock market event row", async () => {
  const client = new FakeClient({
    game_sessions: [{ id: "game-1" }],
    stock_price_ticks: [{ game_session_id: "game-1", tick_index: 14 }],
    stock_market_events: [],
  });
  const repository = new SupabaseStockMarketNewsRepository(client as any);

  const result = await repository.create({
    ...baseInput(),
    shockId: "news-war-1",
    createdTick: 15,
  });

  assertEquals(result.news.shockId, "news-war-1");
  assertEquals(result.news.category, "war_conflict");
  assertEquals(result.news.sentiment, "positive");
  assertEquals(result.news.scope, "sector");
  assertEquals(result.news.targetKey, "ENERGY");

  const inserted = client.tables.stock_market_events[0] as Record<string, unknown>;
  assertEquals(inserted.game_session_id, "game-1");
  assertEquals(inserted.shock_id, "news-war-1");
  assertEquals(inserted.category, "war_conflict");
  assertEquals(inserted.visibility, "public");
  assertEquals(inserted.is_active, true);
  assertEquals(inserted.created_tick, 15);
  assertEquals(inserted.expires_tick, 20);
});

Deno.test("market news repository reads latest tick", async () => {
  const client = new FakeClient({
    game_sessions: [{ id: "game-1" }],
    stock_price_ticks: [
      { game_session_id: "game-1", tick_index: 3 },
      { game_session_id: "game-1", tick_index: 12 },
    ],
    stock_market_events: [],
  });
  const repository = new SupabaseStockMarketNewsRepository(client as any);

  assertEquals(await repository.readCurrentTick("game-1"), 12);
});

Deno.test("market news repository defaults current tick to zero when no ticks exist", async () => {
  const client = new FakeClient({
    game_sessions: [{ id: "game-1" }],
    stock_price_ticks: [],
    stock_market_events: [],
  });
  const repository = new SupabaseStockMarketNewsRepository(client as any);

  assertEquals(await repository.readCurrentTick("game-1"), 0);
});

Deno.test("market news repository rejects missing game session", async () => {
  const client = new FakeClient({
    game_sessions: [],
    stock_price_ticks: [],
    stock_market_events: [],
  });
  const repository = new SupabaseStockMarketNewsRepository(client as any);

  const error = await assertRejects(
    () => repository.create({ ...baseInput(), shockId: "news-1", createdTick: 1 }),
    StockMarketNewsError,
  );

  assertEquals(error.code, "market_news_game_session_not_found");
});

Deno.test("market news realtime payload contains public fields only", () => {
  const payload = toMarketNewsRealtimePayload({
    id: "event-1",
    shockId: "news-1",
    category: "natural_disaster",
    sentiment: "negative",
    source: "runner",
    scope: "sector",
    targetKey: "AGRICULTURE_COMMODITIES",
    headline: "Flooding damages grain fields",
    explanation: "Crop supply tightens.",
    createdTick: 10,
    expiresTick: 16,
    createdAt: "2026-01-01T00:00:00Z",
  });

  assertEquals(payload, {
    id: "event-1",
    headline: "Flooding damages grain fields",
    explanation: "Crop supply tightens.",
    category: "natural_disaster",
    sentiment: "negative",
    source: "runner",
    scope: "sector",
    targetKey: "AGRICULTURE_COMMODITIES",
    createdTick: 10,
    expiresTick: 16,
    createdAt: "2026-01-01T00:00:00Z",
  });
});

function baseInput(): StockMarketNewsInsertInput {
  return {
    gameSessionId: "game-1",
    shockId: "news-war-1",
    headline: "War raises emergency energy demand",
    explanation: "Government demand raises oil and logistics pressure.",
    category: "war_conflict",
    scope: "sector",
    targetKey: "ENERGY",
    sentiment: "positive",
    impactStrength: "medium",
    durationTicks: 5,
    source: "runner",
    metadata: {
      affectedResources: ["oil", "steel"],
    },
    createdTick: 15,
  };
}

interface FakeTables {
  readonly game_sessions: unknown[];
  readonly stock_price_ticks: unknown[];
  readonly stock_market_events: unknown[];
}

class FakeClient {
  readonly tables: FakeTables;

  constructor(tables: FakeTables) {
    this.tables = tables;
  }

  from(tableName: keyof FakeTables): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables, tableName);
  }
}

class FakeQueryBuilder {
  private readonly filters: { readonly column: string; readonly value: unknown }[] = [];
  private orderColumn: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;

  constructor(
    private readonly tables: FakeTables,
    private readonly tableName: keyof FakeTables,
  ) {}

  select(_columns: string): FakeQueryBuilder {
    return this;
  }

  insert(row: unknown): FakeInsertBuilder {
    const stored = {
      ...(row as Record<string, unknown>),
      id: "event-1",
      created_at: "2026-01-01T00:00:00Z",
    };
    (this.tables[this.tableName] as unknown[]).push(stored);
    return new FakeInsertBuilder(stored);
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { readonly ascending?: boolean }): FakeQueryBuilder {
    this.orderColumn = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.limitCount = count;
    return this;
  }

  maybeSingle(): Promise<{ readonly data: unknown | null; readonly error: null }> {
    return Promise.resolve({
      data: this.readRows()[0] ?? null,
      error: null,
    });
  }

  then<TResult1 = { readonly data: unknown[]; readonly error: null }, TResult2 = never>(
    onfulfilled?: ((value: { readonly data: unknown[]; readonly error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.readRows(),
      error: null,
    }).then(onfulfilled ?? undefined);
  }

  private readRows(): unknown[] {
    let rows = [...this.tables[this.tableName]] as Record<string, unknown>[];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    if (this.orderColumn) {
      const column = this.orderColumn;
      const direction = this.orderAscending ? 1 : -1;
      rows.sort((left, right) => {
        const leftValue = Number(left[column] ?? 0);
        const rightValue = Number(right[column] ?? 0);
        return (leftValue - rightValue) * direction;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }
}

class FakeInsertBuilder {
  constructor(private readonly row: unknown) {}

  select(_columns: string): FakeInsertBuilder {
    return this;
  }

  maybeSingle(): Promise<{ readonly data: unknown; readonly error: null }> {
    return Promise.resolve({
      data: this.row,
      error: null,
    });
  }
}


function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}

async function assertRejects<TError extends Error>(
  run: () => Promise<unknown>,
  expectedErrorClass: new (...args: never[]) => TError,
): Promise<TError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof expectedErrorClass) {
      return error;
    }

    throw new Error(`Expected ${expectedErrorClass.name}, got ${String(error)}`);
  }

  throw new Error(`Expected ${expectedErrorClass.name} to be thrown.`);
}
