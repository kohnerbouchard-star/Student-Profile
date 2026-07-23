import {
  assertEconomicSimulationOperationBudget,
  calculateEconomicSimulationOperationBudget,
  serializeEconomicSimulationEvidence,
} from "./economicSimulationEvidence.ts";
import {
  runDeterministicEconomicSimulation,
} from "./deterministicEconomicSimulation.ts";
import type {
  CountryEconomyProfile,
  EconomicSimulationConfig,
  PlayerStrategyProfile,
} from "./economicSimulationContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("operation budgets are deterministic for 30 and 40 player profiles", () => {
  const thirty = calculateEconomicSimulationOperationBudget(config(30), 50_000);
  const forty = calculateEconomicSimulationOperationBudget(config(40), 70_000);

  assertEquals(thirty.estimatedOperations, 43_180);
  assertEquals(thirty.withinBudget, true);
  assertEquals(forty.estimatedOperations, 57_140);
  assertEquals(forty.withinBudget, true);
  assertEquals(thirty.deterministic, true);
  assertEquals(forty.deterministic, true);
});

Deno.test("operation budget assertions fail closed on thresholds and regression", () => {
  const budget = calculateEconomicSimulationOperationBudget(config(30), 50_000);
  assertEconomicSimulationOperationBudget(budget, 0.15, 40_000);

  assertThrows(
    () =>
      assertEconomicSimulationOperationBudget(
        calculateEconomicSimulationOperationBudget(config(30), 40_000),
        0.15,
        40_000,
      ),
    "simulation_operation_budget_exceeded",
  );
  assertThrows(
    () => assertEconomicSimulationOperationBudget(budget, 0.01, 40_000),
    "simulation_operation_baseline_regression_exceeded",
  );
});

Deno.test("serialized evidence is canonical and checksum stable", () => {
  const report = runDeterministicEconomicSimulation(config(30));
  const first = serializeEconomicSimulationEvidence(report);
  const second = serializeEconomicSimulationEvidence(report);

  assertEquals(first, second);
  assert(first.byteLength > 1_000);
  assert(/^[0-9a-f]{8}$/.test(first.deterministicChecksum));
  assertEquals(JSON.parse(first.canonicalJson).activationAuthorized, false);
  assertEquals(JSON.parse(first.canonicalJson).seedCatalogsModified, false);
});

Deno.test("different deterministic seeds produce different evidence checksums", () => {
  const first = serializeEconomicSimulationEvidence(
    runDeterministicEconomicSimulation(config(30)),
  );
  const second = serializeEconomicSimulationEvidence(
    runDeterministicEconomicSimulation({
      ...config(30),
      deterministicSeed: 99,
      simulationPublicId: "simulation.economy.reference.seed-99.v1",
    }),
  );

  assert(first.deterministicChecksum !== second.deterministicChecksum);
});

function config(playerCount: 30 | 40): EconomicSimulationConfig {
  return {
    simulationPublicId: `simulation.economy.reference.${playerCount}.v1`,
    deterministicSeed: 2_026_072_4,
    playerCount,
    ticksPerPhase: 12,
    countries: countries(),
    strategies: strategies(),
    startingCashMinor: 5_000,
    subsistenceCostMinor: 420,
    insolvencyThresholdMinor: -1_500,
    maximumDominantPathShare: 0.4,
    maximumCountryWealthRatio: 2.5,
    minimumRecoveryRate: 0.3,
  };
}

function countries(): CountryEconomyProfile[] {
  const countryCodes = [
    "NORTHREACH",
    "YRETHIA",
    "VELORIA",
    "KAIROTH",
    "SOLMERE",
    "DRAEVON",
    "AURELIS",
    "MIRENDA",
    "TALVORA",
    "ZENITHIA",
  ];
  const currencyCodes = [
    "NRC",
    "YRT",
    "VLR",
    "KRT",
    "SLM",
    "DRV",
    "AUR",
    "MRD",
    "TLV",
    "ZEN",
  ];
  return countryCodes.map((countryCode, index) => ({
    countryCode,
    currencyCode: currencyCodes[index],
    incomeModifier: 0.94 + index * 0.012,
    costModifier: 1.05 - index * 0.01,
    scarcityModifier: 0.96 + (index % 3) * 0.04,
    creditModifier: 0.9 + (index % 4) * 0.04,
    marketVolatilityModifier: 0.9 + (index % 5) * 0.05,
  }));
}

function strategies(): PlayerStrategyProfile[] {
  return [
    {
      strategyPublicId: "strategy.contract-builder.v1",
      contractWeight: 0.35,
      businessWeight: 0.25,
      craftingWeight: 0.12,
      marketplaceWeight: 0.1,
      financialMarketWeight: 0.08,
      savingWeight: 0.1,
      riskTolerance: 0.45,
    },
    {
      strategyPublicId: "strategy.production-trader.v1",
      contractWeight: 0.15,
      businessWeight: 0.15,
      craftingWeight: 0.28,
      marketplaceWeight: 0.24,
      financialMarketWeight: 0.08,
      savingWeight: 0.1,
      riskTolerance: 0.55,
    },
    {
      strategyPublicId: "strategy.capital-markets.v1",
      contractWeight: 0.18,
      businessWeight: 0.2,
      craftingWeight: 0.08,
      marketplaceWeight: 0.08,
      financialMarketWeight: 0.34,
      savingWeight: 0.12,
      riskTolerance: 0.7,
    },
  ];
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}

function assertThrows(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected error containing ${expectedMessage}.`);
}
