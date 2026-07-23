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

Deno.test("economic simulation is deterministic and covers every campaign phase", () => {
  const first = runDeterministicEconomicSimulation(baseConfig());
  const second = runDeterministicEconomicSimulation(baseConfig());

  assertEquals(first, second);
  assertEquals(first.phaseResults.map((result) => result.phase), [
    "peace",
    "shortage",
    "war",
    "reconstruction",
  ]);
  assertEquals(first.finalPlayers.length, 30);
  assertEquals(new Set(first.finalPlayers.map((player) => player.countryCode)).size, 10);
  assertEquals(first.seedCatalogsModified, false);
  assertEquals(first.activationAuthorized, false);
  assertEquals(first.deterministic, true);
  assert(first.phaseResults.every((phase) => phase.totalWealthMinor > 0));
  assert(first.finalPlayers.every((player) => player.experience > 0));
});

Deno.test("economic simulation supports the maximum 40-player classroom profile", () => {
  const report = runDeterministicEconomicSimulation({
    ...baseConfig(),
    simulationPublicId: "simulation.economy.40-player.v1",
    playerCount: 40,
  });

  assertEquals(report.playerCount, 40);
  assertEquals(report.finalPlayers.length, 40);
  const playerCounts = Object.fromEntries(
    countries().map((country) => [
      country.countryCode,
      report.finalPlayers.filter((player) => player.countryCode === country.countryCode)
        .length,
    ]),
  );
  assert(Object.values(playerCounts).every((count) => count === 4));
});

Deno.test("dominant strategy configurations produce a critical finding", () => {
  const contractOnly = strategies().map((strategy) => ({
    ...strategy,
    contractWeight: 1,
    businessWeight: 0,
    craftingWeight: 0,
    marketplaceWeight: 0,
    financialMarketWeight: 0,
    savingWeight: 0,
  }));
  const report = runDeterministicEconomicSimulation({
    ...baseConfig(),
    simulationPublicId: "simulation.economy.dominant-contracts.v1",
    strategies: contractOnly,
    maximumDominantPathShare: 0.45,
  });

  assert(report.dominantPathShare > 0.99);
  assert(report.findings.some((finding) =>
    finding.code === "dominant_economic_path_exceeded" &&
    finding.severity === "critical"
  ));
});

Deno.test("simulation rejects incomplete country coverage and duplicate identities", () => {
  assertThrows(
    () =>
      runDeterministicEconomicSimulation({
        ...baseConfig(),
        countries: countries().slice(0, 9),
      }),
    "simulation_requires_ten_countries",
  );
  assertThrows(
    () =>
      runDeterministicEconomicSimulation({
        ...baseConfig(),
        countries: countries().map((country, index) =>
          index === 9 ? { ...country, countryCode: countries()[0].countryCode } : country
        ),
      }),
    "duplicate_country_code",
  );
});

function baseConfig(): EconomicSimulationConfig {
  return {
    simulationPublicId: "simulation.economy.reference.v1",
    deterministicSeed: 2_026_072_4,
    playerCount: 30,
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
  const names = [
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
  return names.map((countryCode, index) => ({
    countryCode,
    currencyCode: `C${String(index).padStart(2, "0")}`,
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
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertThrows(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    throw error;
  }
  throw new Error(`Expected error containing ${expectedMessage}.`);
}
