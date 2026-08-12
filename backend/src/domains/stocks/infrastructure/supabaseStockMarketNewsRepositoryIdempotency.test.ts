import { SupabaseStockMarketNewsRepository } from "./supabaseStockMarketNewsRepository.ts";
import type { StockMarketNewsInsertInput } from "../contracts/stockMarketNewsContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("market news repository returns existing row for duplicate game shock identity", async () => {
  const existing = {
    id: "event-existing",
    game_session_id: "game-1",
    shock_id: "story_market_news:game-1:event-1:shock-1",
    category: "supply_chain",
    sentiment: "negative",
    source: "system",
    scope: "global",
    target_key: null,
    headline: "Meridian verification records diverge",
    explanation: "Cargo and payment records no longer reconcile reliably.",
    created_tick: 13,
    expires_tick: 18,
    created_at: "2026-08-12T00:00:00.000Z",
  };
  const client = new DuplicateShockClient(existing);
  const repository = new SupabaseStockMarketNewsRepository(client as any);

  const result = await repository.create(baseInput());

  assertEquals(result.news.id, "event-existing");
  assertEquals(result.news.shockId, existing.shock_id);
  assertEquals(client.duplicateInsertAttempted, true);
  assertEquals(client.existingShockRead, true);
});

function baseInput(): StockMarketNewsInsertInput {
  return {
    gameSessionId: "game-1",
    shockId: "story_market_news:game-1:event-1:shock-1",
    headline: "Meridian verification records diverge",
    explanation: "Cargo and payment records no longer reconcile reliably.",
    category: "supply_chain",
    scope: "global",
    targetKey: null,
    sentiment: "negative",
    impactStrength: "medium",
    durationTicks: 5,
    source: "system",
    metadata: {},
    createdTick: 13,
  };
}

class DuplicateShockClient {
  duplicateInsertAttempted = false;
  existingShockRead = false;

  constructor(private readonly existing: Record<string, unknown>) {}

  from(tableName: string): any {
    if (tableName === "game_sessions") {
      return new ReadBuilder({ id: "game-1" });
    }

    if (tableName === "stock_market_events") {
      return new StockEventBuilder(this);
    }

    throw new Error(`Unexpected table ${tableName}`);
  }

  readExisting(): Record<string, unknown> {
    this.existingShockRead = true;
    return this.existing;
  }
}

class ReadBuilder {
  constructor(private readonly row: unknown) {}
  select(_columns: string): ReadBuilder { return this; }
  eq(_column: string, _value: unknown): ReadBuilder { return this; }
  maybeSingle(): Promise<{ data: unknown; error: null }> {
    return Promise.resolve({ data: this.row, error: null });
  }
}

class StockEventBuilder {
  constructor(private readonly client: DuplicateShockClient) {}
  insert(_row: unknown): DuplicateInsertBuilder {
    this.client.duplicateInsertAttempted = true;
    return new DuplicateInsertBuilder();
  }
  select(_columns: string): ExistingReadBuilder {
    return new ExistingReadBuilder(this.client);
  }
}

class DuplicateInsertBuilder {
  select(_columns: string): DuplicateInsertBuilder { return this; }
  maybeSingle(): Promise<{ data: null; error: { code: string; message: string } }> {
    return Promise.resolve({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
  }
}

class ExistingReadBuilder {
  constructor(private readonly client: DuplicateShockClient) {}
  eq(_column: string, _value: unknown): ExistingReadBuilder { return this; }
  maybeSingle(): Promise<{ data: unknown; error: null }> {
    return Promise.resolve({ data: this.client.readExisting(), error: null });
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
