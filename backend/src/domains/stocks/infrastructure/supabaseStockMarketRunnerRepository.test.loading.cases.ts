import { SupabaseStockMarketRunnerRepository } from "./supabaseStockMarketRunnerRepository.ts";
import {
  assertEquals,
  assertRejectsWithCode,
  ASSET_ID,
  countryProfile,
  countrySnapshot,
  ELDORAN_PROFILE_ID,
  FakeSupabaseClient,
  GAME_SESSION_ID,
  gameSession,
  OTHER_ASSET_ID,
  OTHER_SESSION_ID,
  SOLVEND_PROFILE_ID,
  stockAsset,
  stockEvent,
  stockRegime,
} from "./supabaseStockMarketRunnerRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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
