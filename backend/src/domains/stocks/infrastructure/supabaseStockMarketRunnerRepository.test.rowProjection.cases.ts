import {
  readLatestCountrySnapshots,
  toStockMarketAssetInput,
  toStockMarketCountryInput,
  toStockMarketMacroInput,
} from "./supabaseStockMarketRunnerRepository.ts";
import {
  assertEquals,
  countrySnapshot,
  ELDORAN_PROFILE_ID,
  GAME_SESSION_ID,
  OTHER_SESSION_ID,
  SOLVEND_PROFILE_ID,
  stockAsset,
} from "./supabaseStockMarketRunnerRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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
