import {
  readLatestCountrySnapshots,
  SupabaseStockMarketRunnerRepository,
  toStockMarketAssetInput,
  toStockMarketCountryInput,
  toStockMarketMacroInput,
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
      {
        game_session_id: GAME_SESSION_ID,
        stock_asset_id: ASSET_ID,
        tick_index: 2,
      },
      {
        game_session_id: GAME_SESSION_ID,
        stock_asset_id: ASSET_ID,
        tick_index: 4,
      },
      {
        game_session_id: OTHER_SESSION_ID,
        stock_asset_id: OTHER_ASSET_ID,
        tick_index: 50,
      },
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
  const repository = new SupabaseStockMarketRunnerRepository(
    new FakeSupabaseClient({
      game_sessions: [gameSession()],
      game_session_stock_assets: [stockAsset()],
      stock_price_ticks: [],
      stock_market_events: [],
      stock_market_regimes: [],
      country_profiles: [],
      country_economic_snapshots: [],
    }) as any,
  );
  const state = await repository.load({ gameSessionId: GAME_SESSION_ID });

  assertEquals(state.tickIndex, 1);
});

Deno.test("stock runner repository respects explicit tick and rejects duplicates before calculation", async () => {
  const duplicateRepository = new SupabaseStockMarketRunnerRepository(
    new FakeSupabaseClient({
      game_sessions: [gameSession()],
      game_session_stock_assets: [stockAsset()],
      stock_price_ticks: [
        {
          game_session_id: GAME_SESSION_ID,
          stock_asset_id: ASSET_ID,
          tick_index: 7,
        },
      ],
      stock_market_events: [],
      stock_market_regimes: [],
      country_profiles: [],
      country_economic_snapshots: [],
    }) as any,
  );

  await assertRejectsWithCode(
    () =>
      duplicateRepository.load({
        gameSessionId: GAME_SESSION_ID,
        tickIndex: 7,
      }),
    "stock_tick_already_exists",
  );

  const repository = new SupabaseStockMarketRunnerRepository(
    new FakeSupabaseClient({
      game_sessions: [gameSession()],
      game_session_stock_assets: [stockAsset()],
      stock_price_ticks: [],
      stock_market_events: [],
      stock_market_regimes: [],
      country_profiles: [],
      country_economic_snapshots: [],
    }) as any,
  );
  const state = await repository.load({
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 7,
  });

  assertEquals(state.tickIndex, 7);
});

Deno.test("stock runner repository returns domain errors for missing sessions and empty assets", async () => {
  await assertRejectsWithCode(
    () =>
      new SupabaseStockMarketRunnerRepository(
        new FakeSupabaseClient({
          game_sessions: [],
          game_session_stock_assets: [],
          stock_price_ticks: [],
          stock_market_events: [],
          stock_market_regimes: [],
          country_profiles: [],
          country_economic_snapshots: [],
        }) as any,
      ).load({ gameSessionId: GAME_SESSION_ID }),
    "game_session_not_found",
  );

  await assertRejectsWithCode(
    () =>
      new SupabaseStockMarketRunnerRepository(
        new FakeSupabaseClient({
          game_sessions: [gameSession()],
          game_session_stock_assets: [],
          stock_price_ticks: [],
          stock_market_events: [],
          stock_market_regimes: [],
          country_profiles: [],
          country_economic_snapshots: [],
        }) as any,
      ).load({ gameSessionId: GAME_SESSION_ID }),
    "no_active_stock_assets",
  );
});

Deno.test("stock runner repository maps active assets, events, regimes, countries, and macro", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(
    new FakeSupabaseClient({
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
        stockEvent({
          shock_id: "active-shock",
          created_tick: 2,
          expires_tick: 5,
        }),
        stockEvent({
          shock_id: "expired-shock",
          created_tick: 1,
          expires_tick: 2,
        }),
      ],
      stock_market_regimes: [
        stockRegime({ regime: "bear", starts_tick: 1 }),
        stockRegime({
          regime: "bull",
          starts_tick: 3,
          student_label: "Recovery bid",
        }),
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
    }) as any,
  );
  const state = await repository.load({
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 4,
  });

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
  assertEquals(state.macro.globalDemandIndex, 116.666667);
  assertEquals(state.sectors, []);
});

Deno.test("stock runner repository averages macro from latest represented-country snapshots", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(
    new FakeSupabaseClient({
      game_sessions: [gameSession()],
      game_session_stock_assets: [
        stockAsset({ country_code: "SOLVEND" }),
        stockAsset({
          id: OTHER_ASSET_ID,
          ticker: "FARM",
          country_code: "ELDORAN",
        }),
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
    }) as any,
  );
  const state = await repository.load({
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 9,
  });

  assertEquals(state.countries.map((country) => country.countryCode), [
    "ELDORAN",
    "SOLVEND",
  ]);
  assertEquals(state.macro.gdpGrowthRate, 0.03);
  assertEquals(state.macro.inflationRate, 0.03);
  assertEquals(state.macro.consumerConfidenceIndex, 105);
  assertEquals(state.macro.businessConfidenceIndex, 105);
  assertEquals(state.macro.globalDemandIndex, 103.333333);
});

Deno.test("stock runner repository falls back to neutral macro and empty countries when snapshots are missing", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(
    new FakeSupabaseClient({
      game_sessions: [gameSession()],
      game_session_stock_assets: [stockAsset()],
      stock_price_ticks: [],
      stock_market_events: [],
      stock_market_regimes: [],
      country_profiles: [countryProfile("SOLVEND", SOLVEND_PROFILE_ID)],
      country_economic_snapshots: [],
    }) as any,
  );
  const state = await repository.load({
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 1,
  });

  assertEquals(state.macro, { gameSessionId: GAME_SESSION_ID });
  assertEquals(state.countries, []);
});

Deno.test("stock runner repository keeps same ticker assets isolated by game session", async () => {
  const repository = new SupabaseStockMarketRunnerRepository(
    new FakeSupabaseClient({
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
    }) as any,
  );
  const state = await repository.load({
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 1,
  });

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
  assertEquals(
    client.rpcCalls[0].functionName,
    "apply_stock_market_runner_tick",
  );
  assertEquals(client.rpcCalls[0].args.p_game_session_id, GAME_SESSION_ID);
  assertEquals(client.rpcCalls[0].args.p_tick_index, 3);
  assertEquals(
    client.rpcCalls[0].args.p_asset_updates[0].game_session_id,
    GAME_SESSION_ID,
  );
  assertEquals(
    client.rpcCalls[0].args.p_tick_rows[0].game_session_id,
    GAME_SESSION_ID,
  );
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

Deno.test("stock runner consumes Business observations before loading the game market", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [{ id: GAME_SESSION_ID }],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    country_profiles: [],
    country_economic_snapshots: [],
    stock_market_events: [],
    stock_market_regimes: [],
  });
  await new SupabaseStockMarketRunnerRepository(client as any).load({
    gameSessionId: GAME_SESSION_ID,
  });
  assertEquals(client.rpcCalls[0], {
    functionName: "consume_business_market_events_v1",
    args: { p_game_session_id: GAME_SESSION_ID, p_limit: 1000 },
  });
  client.rpcError = { message: "STOCK_BUSINESS_EVENT_VERSION_UNSUPPORTED" };
  let failed = false;
  try {
    await new SupabaseStockMarketRunnerRepository(client as any).load({
      gameSessionId: GAME_SESSION_ID,
    });
  } catch (e) {
    failed = e instanceof StockMarketRunnerError &&
      e.code === "stock_market_state_load_failed";
  }
  assertEquals(failed, true);
});

class FakeSupabaseClient {
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

class FakeQueryBuilder
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

// These cases characterize the public adapter before moving its pure row mapping.
for (
  const [raw, expected] of [
    ["12.5", 12.5],
    ["", 0],
    ["  ", 0],
    ["bad", Number.NaN],
    [null, Number.NaN],
    [true, Number.NaN],
    [Infinity, Number.NaN],
  ] as const
) {
  Deno.test(`stock runner row mapping retains numeric conversion for ${String(raw)}`, () => {
    const input = toStockMarketAssetInput(
      stockAsset({ current_price: raw }) as any,
    );
    if (!Object.is(input.currentPrice, expected)) {
      throw new Error("Numeric conversion changed");
    }
  });
}

Deno.test("stock runner row mapping preserves optional values and normalized collision order", () => {
  const row = stockAsset({
    country_code: "  sOlVeNd  ",
    previous_close: null,
    open_price: "",
    day_high: "bad",
    recent_returns: ["0.25", null, "bad", 0, ""],
    country_exposure: { " eldoran ": "0.2", ELDORAN: 0.7, ignored: true },
    commodity_exposure: { " oil ": "", invalid: null },
    chart_history: [
      null,
      [],
      { tickIndex: -1, timestamp: "t", label: "l", price: 1 },
      { tickIndex: 2.5, timestamp: "t", label: "l", price: 1 },
      { tickIndex: "2", timestamp: "t", label: "l", price: "3", volume: "bad" },
      {
        gameSessionId: OTHER_SESSION_ID,
        tickIndex: 3,
        timestamp: "t3",
        label: "l3",
        price: 4,
      },
    ],
  });
  const before = JSON.stringify(row);
  const input = toStockMarketAssetInput(row as any);
  assertEquals(input.countryCode, "SOLVEND");
  assertEquals(input.previousClose, undefined);
  assertEquals(input.openPrice, 0);
  assertEquals(input.dayHigh, undefined);
  assertEquals(input.recentReturns, [0.25, 0, 0]);
  assertEquals(input.countryExposure, { ELDORAN: 0.7 });
  assertEquals(input.commodityExposure, { OIL: 0 });
  assertEquals(input.history, [
    {
      gameSessionId: GAME_SESSION_ID,
      tickIndex: 2,
      timestamp: "t",
      label: "l",
      price: 3,
    },
    {
      gameSessionId: OTHER_SESSION_ID,
      tickIndex: 3,
      timestamp: "t3",
      label: "l3",
      price: 4,
    },
  ]);
  assertEquals(JSON.stringify(row), before);
});

Deno.test("stock runner row mapping requires exact fundamental keys and keeps finite zeros", () => {
  const fundamentals = Object.fromEntries([
    "revenueGrowth",
    "profitMargin",
    "debtLevel",
    "cashReserves",
    "innovationScore",
    "supplyChainRisk",
    "politicalExposure",
    "commodityExposure",
  ].map((key) => [key, "0"]));
  const complete = toStockMarketAssetInput(stockAsset({ fundamentals }) as any);
  assertEquals(complete.fundamentals?.revenueGrowth, 0);
  const wrongCase: Record<string, string> = {
    ...fundamentals,
    RevenueGrowth: "1",
  };
  delete wrongCase.revenueGrowth;
  assertEquals(
    toStockMarketAssetInput(stockAsset({ fundamentals: wrongCase }) as any)
      .fundamentals,
    undefined,
  );
});

Deno.test("stock runner latest snapshots preserve sequence precedence stable ties and country ordering", () => {
  const early = countrySnapshot({
    id: "early",
    snapshot_sequence: "10",
    effective_at: "2026-01-01",
  });
  const later = countrySnapshot({
    id: "later",
    snapshot_sequence: 10,
    effective_at: "2026-02-01",
  });
  const tied = { ...later, id: "tied" };
  const lower = countrySnapshot({
    id: "lower",
    snapshot_sequence: 9,
    effective_at: "2026-12-01",
  });
  const other = countrySnapshot({
    id: "other",
    country_profile_id: ELDORAN_PROFILE_ID,
  });
  const unknown = countrySnapshot({ country_profile_id: "unknown" });
  const rows = [early, lower, later, tied, other, unknown];
  const selected = readLatestCountrySnapshots(
    rows as any,
    new Map([
      [SOLVEND_PROFILE_ID, "SOLVEND"],
      [ELDORAN_PROFILE_ID, "ELDORAN"],
    ]),
  );
  assertEquals(
    selected.map(({ snapshot, countryCode }) => [snapshot.id, countryCode]),
    [["other", "ELDORAN"], ["later", "SOLVEND"]],
  );
  if (selected[1].snapshot !== later) {
    throw new Error("Snapshot identity changed");
  }
  assertEquals(rows.map((row) => row.id), [
    "early",
    "lower",
    "later",
    "tied",
    "other",
    "snapshot-1",
  ]);
});

Deno.test("stock runner country and macro projection retain rounding scaling and empty aggregates", () => {
  const snapshot = countrySnapshot({
    gdp_growth_rate: "0.123456789",
    export_strength_index: "-2",
  });
  const country = toStockMarketCountryInput(snapshot as any, "SOLVEND");
  assertEquals(country.gdpGrowthRate, 0.123456789);
  const macro = toStockMarketMacroInput(
    GAME_SESSION_ID,
    [{ snapshot, countryCode: "SOLVEND" }] as any,
  );
  assertEquals(macro.gdpGrowthRate, 0.123457);
  assertEquals(macro.globalDemandIndex, 0);
  const empty = toStockMarketMacroInput(GAME_SESSION_ID, []);
  assertEquals(Object.keys(empty).length, 12);
  assertEquals(empty.globalDemandIndex, undefined);
  const invalid = toStockMarketMacroInput(
    GAME_SESSION_ID,
    [{
      snapshot: countrySnapshot({ gdp_growth_rate: "bad" }),
      countryCode: "SOLVEND",
    }] as any,
  );
  if (!Number.isNaN(invalid.gdpGrowthRate)) {
    throw new Error("Invalid input was silently repaired");
  }
});

Deno.test("stock runner preserves read order inclusive event windows and latest regime tie", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    country_profiles: [countryProfile("SOLVEND", SOLVEND_PROFILE_ID)],
    country_economic_snapshots: [countrySnapshot()],
    stock_market_events: [
      stockEvent({ shock_id: "ending", created_tick: 1, expires_tick: 4 }),
      stockEvent({ shock_id: "starting", created_tick: 4, expires_tick: 4 }),
      stockEvent({ shock_id: "future", created_tick: 5 }),
      stockEvent({ shock_id: "expired", expires_tick: 3 }),
      stockEvent({ shock_id: "other-game", game_session_id: OTHER_SESSION_ID }),
    ],
    stock_market_regimes: [
      stockRegime({ regime: "bear", starts_tick: 4, ends_tick: 4 }),
      stockRegime({ regime: "bull", starts_tick: 4 }),
      stockRegime({ regime: "sideways", starts_tick: 3 }),
    ],
  });
  const state = await new SupabaseStockMarketRunnerRepository(client as any)
    .load({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 });
  assertEquals(client.operations, [
    "read:game_sessions",
    "rpc:consume_business_market_events_v1",
    "read:stock_price_ticks",
    "read:game_session_stock_assets",
    "read:country_profiles",
    "read:country_economic_snapshots",
    "read:stock_market_events",
    "read:stock_market_regimes",
  ]);
  assertEquals(state.shocks.map((shock) => shock.shockId), [
    "ending",
    "starting",
  ]);
  assertEquals(state.regime?.regime, "bear");
});

for (
  const [error, code] of [
    [
      { code: "42P01", message: "STOCK_TICK_ALREADY_EXISTS" },
      "stock_market_schema_not_applied",
    ],
    [{ message: "stock_tick_already_exists" }, "stock_tick_already_exists"],
    [{ message: "private database detail" }, "stock_market_tick_apply_failed"],
  ] as const
) {
  Deno.test(`stock runner persistence error retains precedence and safe message for ${code}`, async () => {
    const client = new FakeSupabaseClient({});
    client.rpcError = error;
    let caught: unknown;
    try {
      await new SupabaseStockMarketRunnerRepository(client as any).apply({
        gameSessionId: GAME_SESSION_ID,
        tickIndex: 1,
        assetUpdates: [],
        tickRows: [],
      });
    } catch (failure) {
      caught = failure;
    }
    if (!(caught instanceof StockMarketRunnerError)) {
      throw new Error("Expected domain error");
    }
    assertEquals(caught.code, code);
    assertEquals(
      caught.status,
      code === "stock_tick_already_exists" ? 409 : 500,
    );
    assertEquals(
      caught.message,
      {
        stock_market_schema_not_applied:
          "Stock market runner schema is not applied.",
        stock_tick_already_exists:
          "A stock price tick already exists for this game session and tick index.",
        stock_market_tick_apply_failed:
          "Stock market tick could not be persisted.",
      }[code],
    );
    assertEquals(client.rpcCalls.length, 1);
  });
}

Deno.test("stock runner apply empty result and missing game stop at their original boundaries", async () => {
  const client = new FakeSupabaseClient({});
  const repository = new SupabaseStockMarketRunnerRepository(client as any);
  await assertRejectsWithCode(
    () => repository.load({ gameSessionId: GAME_SESSION_ID }),
    "game_session_not_found",
  );
  assertEquals(client.operations, ["read:game_sessions"]);
  await assertRejectsWithCode(
    () =>
      repository.apply({
        gameSessionId: GAME_SESSION_ID,
        tickIndex: 1,
        assetUpdates: [],
        tickRows: [],
      }),
    "stock_market_tick_apply_failed",
  );
});
