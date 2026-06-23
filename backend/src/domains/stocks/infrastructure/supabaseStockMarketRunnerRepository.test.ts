import {
  SupabaseStockMarketRunnerRepository,
} from "./supabaseStockMarketRunnerRepository.ts";
import {
  StockMarketRunnerError,
} from "../contracts/stockMarketRunnerContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const ASSET_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_ASSET_ID = "00000000-0000-4000-8000-000000000102";
const SOLVEND_PROFILE_ID = "00000000-0000-4000-8000-000000000201";
const ELDORAN_PROFILE_ID = "00000000-0000-4000-8000-000000000202";

Deno.test("stock runner repository loads exactly one game session and defaults max tick plus one", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [
      { game_session_id: GAME_SESSION_ID, stock_asset_id: ASSET_ID, tick_index: 2 },
      { game_session_id: GAME_SESSION_ID, stock_asset_id: ASSET_ID, tick_index: 4 },
      { game_session_id: OTHER_SESSION_ID, stock_asset_id: OTHER_ASSET_ID, tick_index: 50 },
    ],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [],
    country_economic_snapshots: [],
  });
  const repository = new SupabaseStockMarketRunnerRepository(client as any);
  const state = await repository.load({ gameSessionId: GAME_SESSION_ID });

  assertEquals(state.tickIndex, 5);
  assertEquals(client.filtersFor("game_sessions", "id"), [GAME_SESSION_ID]);
  assertEquals(state.assets.length, 1);
  assertEquals(state.assets[0].gameSessionId, GAME_SESSION_ID);
});

Deno.test("stock runner repository defaults first tick to one", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [],
    country_economic_snapshots: [],
  }) as any);
  const state = await repository.load({ gameSessionId: GAME_SESSION_ID });

  assertEquals(state.tickIndex, 1);
});

Deno.test("stock runner repository respects explicit tick and rejects duplicates before calculation", async () => {
  const duplicateRepository = new SupabaseStockMarketRunnerRepository(
    new FakeSupabaseClient({
      game_sessions: [gameSession()],
      game_session_stock_assets: [stockAsset()],
      stock_price_ticks: [
        { game_session_id: GAME_SESSION_ID, stock_asset_id: ASSET_ID, tick_index: 7 },
      ],
      stock_market_events: [],
      stock_market_regimes: [],
      country_profiles: [],
      country_economic_snapshots: [],
    }) as any,
  );

  await assertRejectsWithCode(
    () => duplicateRepository.load({ gameSessionId: GAME_SESSION_ID, tickIndex: 7 }),
    "stock_tick_already_exists",
  );

  const repository = new SupabaseStockMarketRunnerRepository(new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [],
    country_economic_snapshots: [],
  }) as any);
  const state = await repository.load({ gameSessionId: GAME_SESSION_ID, tickIndex: 7 });

  assertEquals(state.tickIndex, 7);
});

Deno.test("stock runner repository returns domain errors for missing sessions and empty assets", async () => {
  await assertRejectsWithCode(
    () =>
      new SupabaseStockMarketRunnerRepository(new FakeSupabaseClient({
        game_sessions: [],
        game_session_stock_assets: [],
        stock_price_ticks: [],
        stock_market_events: [],
        stock_market_regimes: [],
        country_profiles: [],
        country_economic_snapshots: [],
      }) as any).load({ gameSessionId: GAME_SESSION_ID }),
    "game_session_not_found",
  );

  await assertRejectsWithCode(
    () =>
      new SupabaseStockMarketRunnerRepository(new FakeSupabaseClient({
        game_sessions: [gameSession()],
        game_session_stock_assets: [],
        stock_price_ticks: [],
        stock_market_events: [],
        stock_market_regimes: [],
        country_profiles: [],
        country_economic_snapshots: [],
      }) as any).load({ gameSessionId: GAME_SESSION_ID }),
    "no_active_stock_assets",
  );
});

Deno.test("stock runner repository maps active assets, events, regimes, countries, and macro", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset({
      fundamentals: {
        revenueGrowth: 0.08,
        profitMargin: 0.12,
        debtLevel: 0.2,
        cashReserves: 0.7,
        innovationScore: 0.9,
        supplyChainRisk: 0.1,
        politicalExposure: 0.2,
        commodityExposure: 0.3,
      },
      country_exposure: { eldoran: 0.25 },
      sector_exposure: { technology: 0.4 },
    })],
    stock_price_ticks: [],
    stock_market_events: [
      stockEvent({ shock_id: "active-shock", created_tick: 2, expires_tick: 5 }),
      stockEvent({ shock_id: "expired-shock", created_tick: 1, expires_tick: 2 }),
    ],
    stock_market_regimes: [
      stockRegime({ regime: "bear", starts_tick: 1 }),
      stockRegime({ regime: "bull", starts_tick: 3, student_label: "Recovery bid" }),
    ],
    country_profiles: [countryProfile("SOLVEND", SOLVEND_PROFILE_ID)],
    country_economic_snapshots: [
      countrySnapshot({
        country_profile_id: SOLVEND_PROFILE_ID,
        snapshot_sequence: 1,
        effective_at: "2026-06-01T00:00:00.000Z",
        gdp_growth_rate: 0.01,
      }),
      countrySnapshot({
        country_profile_id: SOLVEND_PROFILE_ID,
        snapshot_sequence: 2,
        effective_at: "2026-06-02T00:00:00.000Z",
        gdp_growth_rate: 0.04,
        consumer_confidence_index: 120,
        business_confidence_index: 110,
        export_strength_index: 1.2,
      }),
    ],
  }) as any);
  const state = await repository.load({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 });

  assertEquals(state.assets[0].fundamentals?.revenueGrowth, 0.08);
  assertEquals(state.assets[0].countryExposure?.ELDORAN, 0.25);
  assertEquals(state.assets[0].sectorExposure?.TECHNOLOGY, 0.4);
  assertEquals(state.shocks.map((shock) => shock.shockId), ["active-shock"]);
  assertEquals(state.regime?.regime, "bull");
  assertEquals(state.regime?.studentLabel, "Recovery bid");
  assertEquals(state.countries.length, 1);
  assertEquals(state.countries[0].countryCode, "SOLVEND");
  assertEquals(state.countries[0].gdpGrowthRate, 0.04);
  assertEquals(state.macro.gdpGrowthRate, 0.04);
  assertEquals(state.macro.globalDemandIndex, 77.066667);
  assertEquals(state.sectors, []);
});

Deno.test("stock runner repository averages macro from latest represented-country snapshots", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [
      stockAsset({ country_code: "SOLVEND" }),
      stockAsset({ id: OTHER_ASSET_ID, ticker: "FARM", country_code: "ELDORAN" }),
    ],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [
      countryProfile("SOLVEND", SOLVEND_PROFILE_ID),
      countryProfile("ELDORAN", ELDORAN_PROFILE_ID),
    ],
    country_economic_snapshots: [
      countrySnapshot({
        country_profile_id: SOLVEND_PROFILE_ID,
        snapshot_sequence: 1,
        gdp_growth_rate: 0.2,
      }),
      countrySnapshot({
        country_profile_id: SOLVEND_PROFILE_ID,
        snapshot_sequence: 2,
        gdp_growth_rate: 0.04,
        inflation_rate: 0.02,
        consumer_confidence_index: 120,
        business_confidence_index: 110,
        export_strength_index: 1.2,
      }),
      countrySnapshot({
        country_profile_id: ELDORAN_PROFILE_ID,
        snapshot_sequence: 3,
        gdp_growth_rate: 0.02,
        inflation_rate: 0.04,
        consumer_confidence_index: 90,
        business_confidence_index: 100,
        export_strength_index: 0.8,
      }),
    ],
  }) as any);
  const state = await repository.load({ gameSessionId: GAME_SESSION_ID, tickIndex: 9 });

  assertEquals(state.countries.map((country) => country.countryCode), [
    "ELDORAN",
    "SOLVEND",
  ]);
  assertEquals(state.macro.gdpGrowthRate, 0.03);
  assertEquals(state.macro.inflationRate, 0.03);
  assertEquals(state.macro.consumerConfidenceIndex, 105);
  assertEquals(state.macro.businessConfidenceIndex, 105);
  assertEquals(state.macro.globalDemandIndex, 70.333333);
});

Deno.test("stock runner repository falls back to neutral macro and empty countries when snapshots are missing", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [countryProfile("SOLVEND", SOLVEND_PROFILE_ID)],
    country_economic_snapshots: [],
  }) as any);
  const state = await repository.load({ gameSessionId: GAME_SESSION_ID, tickIndex: 1 });

  assertEquals(state.macro, { gameSessionId: GAME_SESSION_ID });
  assertEquals(state.countries, []);
});

Deno.test("stock runner repository keeps same ticker assets isolated by game session", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(new FakeSupabaseClient({
    game_sessions: [gameSession(), gameSession(OTHER_SESSION_ID)],
    game_session_stock_assets: [
      stockAsset({ ticker: "AURA", current_price: 100 }),
      stockAsset({
        id: OTHER_ASSET_ID,
        game_session_id: OTHER_SESSION_ID,
        ticker: "AURA",
        current_price: 200,
      }),
    ],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [],
    country_economic_snapshots: [],
  }) as any);
  const state = await repository.load({ gameSessionId: GAME_SESSION_ID, tickIndex: 1 });

  assertEquals(state.assets.length, 1);
  assertEquals(state.assets[0].ticker, "AURA");
  assertEquals(state.assets[0].currentPrice, 100);
});

Deno.test("stock runner repository applies only the requested game session payload", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [],
    country_economic_snapshots: [],
  });
  client.rpcResult = { assets_updated: 1, ticks_inserted: 1 };
  const repository = new SupabaseStockMarketRunnerRepository(client as any);
  const result = await repository.apply({
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 3,
    assetUpdates: [{
      game_session_id: GAME_SESSION_ID,
      asset_id: ASSET_ID,
      current_price: 101,
      previous_close: 100,
      open_price: 100,
      day_high: 101,
      day_low: 100,
      market_cap: 101000000,
      current_volatility: 0.05,
      long_run_volatility: 0.05,
      recent_returns: [0.01],
      chart_history: [],
    }],
    tickRows: [{
      game_session_id: GAME_SESSION_ID,
      stock_asset_id: ASSET_ID,
      tick_index: 3,
      ticker: "AURA",
      price: 101,
      previous_price: 100,
      log_return: 0.00995033,
      change_pct: 1,
      volume: 1000,
      current_volatility: 0.05,
      long_run_volatility: 0.05,
      explanation: {},
    }],
  });

  assertEquals(result, { assetsUpdated: 1, ticksInserted: 1 });
  assertEquals(client.rpcCalls[0].functionName, "apply_stock_market_runner_tick");
  assertEquals(client.rpcCalls[0].args.p_game_session_id, GAME_SESSION_ID);
  assertEquals(client.rpcCalls[0].args.p_tick_index, 3);
  assertEquals(client.rpcCalls[0].args.p_asset_updates[0].game_session_id, GAME_SESSION_ID);
  assertEquals(client.rpcCalls[0].args.p_tick_rows[0].game_session_id, GAME_SESSION_ID);
});

Deno.test("stock runner repository maps missing stock schema errors", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [],
    country_economic_snapshots: [],
  });
  client.tableErrors.set("stock_price_ticks", {
    code: "42P01",
    message: "relation stock_price_ticks does not exist",
  });
  const repository = new SupabaseStockMarketRunnerRepository(client as any);

  await assertRejectsWithCode(
    () => repository.load({ gameSessionId: GAME_SESSION_ID }),
    "stock_market_schema_not_applied",
  );
});

function gameSession(id = GAME_SESSION_ID) {
  return { id };
}

function stockAsset(overrides: Record<string, unknown> = {}) {
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

function stockEvent(overrides: Record<string, unknown> = {}) {
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

function stockRegime(overrides: Record<string, unknown> = {}) {
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

function countryProfile(countryCode: string, id: string) {
  return {
    id,
    country_code: countryCode,
    status: "active",
  };
}

function countrySnapshot(overrides: Record<string, unknown> = {}) {
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

async function assertRejectsWithCode(
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

class FakeSupabaseClient {
  readonly tableErrors = new Map<string, { readonly code?: string; readonly message: string }>();
  readonly rpcCalls: { readonly functionName: string; readonly args: any }[] = [];
  rpcResult: { readonly assets_updated: number; readonly ticks_inserted: number } | null = null;
  rpcError: { readonly code?: string; readonly message: string } | null = null;
  private readonly queries: FakeQueryBuilder[] = [];

  constructor(readonly tables: Record<string, readonly Record<string, unknown>[]>) {}

  from(tableName: string): FakeQueryBuilder {
    const query = new FakeQueryBuilder(this, tableName);
    this.queries.push(query);
    return query;
  }

  async rpc(functionName: string, args: any) {
    this.rpcCalls.push({ functionName, args });

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

class FakeQueryBuilder implements PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
  readonly filters: { readonly kind: "eq" | "in"; readonly column: string; readonly value: unknown }[] = [];
  private readonly orderings: { readonly column: string; readonly ascending: boolean }[] = [];
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

  then<TResult1 = { readonly data: unknown[] | null; readonly error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { readonly data: unknown[] | null; readonly error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ readonly data: unknown[] | null; readonly error: unknown }> {
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

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed.\nActual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
