import {
  REFERENCE_SIMULATION_ASSET_TYPES,
  REFERENCE_SIMULATION_COUNTRIES,
  REFERENCE_SIMULATION_SCENARIOS,
  runReferenceMarketSimulation,
} from "./referenceMarketSimulation.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("reference simulation spans every country, asset type, and scenario", () => {
  const report = runReferenceMarketSimulation();
  const expectedPaths = REFERENCE_SIMULATION_COUNTRIES.length *
    REFERENCE_SIMULATION_ASSET_TYPES.length *
    REFERENCE_SIMULATION_SCENARIOS.length;
  assertEquals(report.paths.length, expectedPaths);
  assertEquals(report.metrics.pathCount, expectedPaths);
  assertEquals(report.countries.length, 10);
  assertEquals(report.assetTypes.length, 8);
  assertEquals(report.scenarios.length, 15);
  assertEquals(report.activationAuthorized, false);
  assertEquals(report.productionAuthorized, false);
});

Deno.test("reference simulation is reproducible and numerically bounded", () => {
  const first = runReferenceMarketSimulation("simulation-seed-a");
  const second = runReferenceMarketSimulation("simulation-seed-a");
  const different = runReferenceMarketSimulation("simulation-seed-b");
  assertEquals(first, second);
  assert(first.digest !== different.digest);
  assertEquals(first.accepted, true);
  assertEquals(first.rejectionReasons, []);
  assertEquals(first.metrics.unlimitedArbitrageDetected, false);
  assertEquals(first.metrics.dominantStrategyDetected, false);
  assertEquals(first.metrics.numericalStabilityPassed, true);
  assert(first.metrics.maximumWealthMultiple <= 1.6);
  assert(first.metrics.minimumHoldingQuantity >= 0);
  assert(first.metrics.minimumIndexValue > 0);
});

Deno.test("reference simulation measures requested market outcomes", () => {
  const report = runReferenceMarketSimulation("measurements");
  for (const field of [
    "averageReturn",
    "averageVolatility",
    "averageYield",
    "averageCreditSpread",
    "defaultFrequency",
    "averageRecoveryRate",
    "averageLiquidityScore",
    "averageFeeRate",
    "maximumWealthMultiple",
    "maximumCountryShare",
    "maximumAssetTypeShare",
  ] as const) {
    assert(Number.isFinite(report.metrics[field]));
  }
  for (const assetType of REFERENCE_SIMULATION_ASSET_TYPES) {
    const strategy = report.strategyMetrics[assetType];
    assert(strategy !== undefined);
    assert(Number.isFinite(strategy.averageReturn));
    assert(strategy.worstReturn <= strategy.bestReturn);
    assert(strategy.positiveScenarioShare >= 0 && strategy.positiveScenarioShare <= 1);
  }
  assert(report.paths.some((path) => path.scenario === "war"));
  assert(report.paths.some((path) => path.scenario === "default"));
  assert(report.paths.some((path) => path.scenario === "recovery"));
  assert(report.paths.some((path) => path.scenario === "high_trading_volume"));
  assert(report.paths.some((path) => path.scenario === "low_trading_volume"));
});

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
