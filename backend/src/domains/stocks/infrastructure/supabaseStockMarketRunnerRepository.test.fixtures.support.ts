import { StockMarketRunnerError } from "../contracts/stockMarketRunnerContracts.ts";

export const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export const OTHER_SESSION_ID = "00000000-0000-4000-8000-000000000002";

export const ASSET_ID = "00000000-0000-4000-8000-000000000101";

export const OTHER_ASSET_ID = "00000000-0000-4000-8000-000000000102";

export const SOLVEND_PROFILE_ID = "00000000-0000-4000-8000-000000000201";

export const ELDORAN_PROFILE_ID = "00000000-0000-4000-8000-000000000202";

export function gameSession(id = GAME_SESSION_ID) {
  return { id };
}

export function stockAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    game_session_id: GAME_SESSION_ID,
    ticker: "AURA",
    company_name: "Aurora Works",
    sector_key: "TECHNOLOGY",
    country_code: "SOLVEND",
    current_price: 100,
    previous_close: 99,
    open_price: 100,
    day_high: 101,
    day_low: 98,
    market_cap: 100000000,
    shares_outstanding: 1000000,
    beta: 1.1,
    liquidity: 0.8,
    current_volatility: 0.05,
    long_run_volatility: 0.04,
    fair_value_anchor: 105,
    recent_returns: [0.01, -0.005],
    chart_history: [{
      gameSessionId: GAME_SESSION_ID,
      tickIndex: 1,
      timestamp: "tick-1",
      label: "Tick 1",
      price: 100,
      volume: 1000,
    }],
    fundamentals: {},
    country_exposure: {},
    sector_exposure: {},
    commodity_exposure: {},
    is_active: true,
    ...overrides,
  };
}

export function stockEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    game_session_id: GAME_SESSION_ID,
    shock_id: "shock-1",
    scope: "global",
    target_key: null,
    magnitude: 0.01,
    decay: 0.5,
    confidence: 0.8,
    volatility_impact: 0.02,
    volume_impact: 1.1,
    headline: "Market event",
    explanation: "A modeled event affected the market.",
    created_tick: 1,
    expires_tick: null,
    is_active: true,
    ...overrides,
  };
}

export function stockRegime(overrides: Record<string, unknown> = {}) {
  return {
    id: "regime-1",
    game_session_id: GAME_SESSION_ID,
    regime: "sideways",
    starts_tick: 1,
    ends_tick: null,
    drift_bias: 0,
    volatility_multiplier: 1,
    news_sensitivity: 1,
    volume_multiplier: 1,
    beta_multiplier: 1,
    sector_rotation: { technology: 0.1 },
    student_label: null,
    is_active: true,
    ...overrides,
  };
}

export function countryProfile(countryCode: string, id: string) {
  return {
    id,
    country_code: countryCode,
    status: "active",
  };
}

export function countrySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "snapshot-1",
    game_session_id: GAME_SESSION_ID,
    country_profile_id: SOLVEND_PROFILE_ID,
    snapshot_sequence: 1,
    effective_at: "2026-06-01T00:00:00.000Z",
    gdp_growth_rate: 0.01,
    inflation_rate: 0.02,
    unemployment_rate: 0.05,
    interest_rate: 0.03,
    consumer_confidence_index: 100,
    business_confidence_index: 100,
    trade_balance_index: 0,
    export_strength_index: 1,
    market_risk_index: 1,
    political_stability_index: 1,
    infrastructure_index: 1,
    energy_security_index: 1,
    supply_constraint_index: 1,
    import_dependency_index: 1,
    ...overrides,
  };
}

export async function assertRejectsWithCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StockMarketRunnerError) {
      assertEquals(error.code, code);
      return;
    }

    throw error;
  }

  throw new Error(`Expected StockMarketRunnerError with code ${code}.`);
}

export class FakeSupabaseClient {
  readonly operations: string[] = [];
  readonly tableErrors = new Map<
    string,
    { readonly code?: string; readonly message: string }
  >();
  readonly rpcCalls: { readonly functionName: string; readonly args: any }[] =
    [];
  rpcResult: {
    readonly assets_updated: number;
    readonly ticks_inserted: number;
  } | null = null;
  rpcError: { readonly code?: string; readonly message: string } | null = null;
  private readonly queries: FakeQueryBuilder[] = [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    const query = new FakeQueryBuilder(this, tableName);
    this.queries.push(query);
    return query;
  }

  async rpc(functionName: string, args: any) {
    this.operations.push(`rpc:${functionName}`);
    this.rpcCalls.push({ functionName, args });
    if (functionName === "consume_business_market_events_v1") {
      return {
        data: { schemaVersion: 1, consumed: 0, listed: 0 },
        error: this.rpcError,
      };
    }

    return {
      data: this.rpcResult ? [this.rpcResult] : null,
      error: this.rpcError,
    };
  }

  readRows(tableName: string): readonly Record<string, unknown>[] {
    return this.tables[tableName] ?? [];
  }

  filtersFor(tableName: string, column: string): readonly unknown[] {
    return this.queries
      .filter((query) => query.tableName === tableName)
      .flatMap((query) => query.filters)
      .filter((filter) => filter.kind === "eq" && filter.column === column)
      .map((filter) => filter.value);
  }
}

export class FakeQueryBuilder
  implements
    PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
  readonly filters: {
    readonly kind: "eq" | "in";
    readonly column: string;
    readonly value: unknown;
  }[] = [];
  private readonly orderings: {
    readonly column: string;
    readonly ascending: boolean;
  }[] = [];
  private limitCount: number | null = null;

  constructor(
    private readonly client: FakeSupabaseClient,
    readonly tableName: string,
  ) {}

  select(): FakeQueryBuilder {
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, value: readonly unknown[]): FakeQueryBuilder {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  order(
    column: string,
    options: { readonly ascending?: boolean } = {},
  ): FakeQueryBuilder {
    this.orderings.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.limitCount = count;
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();

    return {
      data: result.data?.[0] ?? null,
      error: result.error,
    };
  }

  then<
    TResult1 = { readonly data: unknown[] | null; readonly error: unknown },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
        value: { readonly data: unknown[] | null; readonly error: unknown },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<
    { readonly data: unknown[] | null; readonly error: unknown }
  > {
    this.client.operations.push(`read:${this.tableName}`);
    const tableError = this.client.tableErrors.get(this.tableName);

    if (tableError) {
      return { data: null, error: tableError };
    }

    let rows = [...this.client.readRows(this.tableName)];

    for (const filter of this.filters) {
      if (filter.kind === "eq") {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      } else {
        rows = rows.filter((row) =>
          (filter.value as readonly unknown[]).includes(row[filter.column])
        );
      }
    }

    for (const ordering of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const leftValue = left[ordering.column];
        const rightValue = right[ordering.column];
        const comparison = compareValues(leftValue, rightValue);

        return ordering.ascending ? comparison : -comparison;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }
}

export function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed.\nActual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
