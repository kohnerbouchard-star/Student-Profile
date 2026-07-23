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
  readonly args: readonly string[];
  writeTextFile(path: string, data: string): Promise<void>;
};

const outputPath = readOutputPath(Deno.args);
const profiles = [
  buildEvidence(30, 50_000, 43_180),
  buildEvidence(40, 70_000, 57_140),
];
const output = {
  schemaVersion: "economic-balance-reference-evidence.v1",
  generatedFromFixtures: true,
  seedCatalogsModified: false,
  activationAuthorized: false,
  profiles,
  deterministic: true,
};
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await Deno.writeTextFile(outputPath, serialized);
console.log(JSON.stringify({
  outputPath,
  profileCount: profiles.length,
  checksums: profiles.map((profile) => profile.evidence.deterministicChecksum),
  seedCatalogsModified: false,
  activationAuthorized: false,
  deterministic: true,
}));

function buildEvidence(
  playerCount: 30 | 40,
  maximumOperations: number,
  baselineOperations: number,
) {
  const config = referenceConfig(playerCount);
  const budget = calculateEconomicSimulationOperationBudget(
    config,
    maximumOperations,
  );
  assertEconomicSimulationOperationBudget(budget, 0.15, baselineOperations);
  const report = runDeterministicEconomicSimulation(config);
  const evidence = serializeEconomicSimulationEvidence(report);
  return {
    playerCount,
    budget,
    evidence,
    summary: {
      dominantPathShare: report.dominantPathShare,
      richestToPoorestCountryRatio: report.richestToPoorestCountryRatio,
      insolvencyRecoveryRate: report.insolvencyRecoveryRate,
      giniCoefficient: report.giniCoefficient,
      findings: report.findings,
    },
  };
}

function referenceConfig(playerCount: 30 | 40): EconomicSimulationConfig {
  return {
    simulationPublicId: `simulation.economy.reference.${playerCount}.v1`,
    deterministicSeed: 2_026_072_4,
    playerCount,
    ticksPerPhase: 12,
    countries: referenceCountries(),
    strategies: referenceStrategies(),
    startingCashMinor: 5_000,
    subsistenceCostMinor: 420,
    insolvencyThresholdMinor: -1_500,
    maximumDominantPathShare: 0.4,
    maximumCountryWealthRatio: 2.5,
    minimumRecoveryRate: 0.3,
  };
}

function referenceCountries(): CountryEconomyProfile[] {
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

function referenceStrategies(): PlayerStrategyProfile[] {
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

function readOutputPath(args: readonly string[]): string {
  const outputIndex = args.indexOf("--output");
  if (outputIndex === -1 || !args[outputIndex + 1]?.trim()) {
    throw new Error("reference_economic_simulation_output_required");
  }
  return args[outputIndex + 1];
}
