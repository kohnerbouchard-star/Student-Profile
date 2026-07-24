import {
  type CreditRecoveryCountryProfile,
  type CreditRecoveryPlayerProfile,
  type CreditRecoveryScenarioConfig,
  runCreditRecoveryScenario,
} from "./creditRecoveryScenarioSimulation.ts";
import {
  type MacroCountryProfile,
  type MacroScenarioConfig,
  runMacroEconomicScenario,
} from "./macroEconomicScenarioSimulation.ts";

declare const Deno: {
  readonly args: readonly string[];
  writeTextFile(path: string, data: string): Promise<void>;
};

interface AdvancedScenarioEvidence {
  readonly schemaVersion: 1;
  readonly evidenceType: "economic-balance-advanced-reference";
  readonly generatedAt: string;
  readonly macro: ReturnType<typeof runMacroEconomicScenario>;
  readonly creditRecovery: ReturnType<typeof runCreditRecoveryScenario>;
  readonly summary: {
    readonly macroEvidenceDigest: string;
    readonly creditRecoveryEvidenceDigest: string;
    readonly peakInflationRate: number;
    readonly peakScarcityIndex: number;
    readonly maximumCurrencyDepreciationRate: number;
    readonly defaultRate: number;
    readonly defaultRecoveryRate: number;
    readonly lateJoinWealthGapRatio: number;
    readonly criticalFindingCount: number;
  };
  readonly seedCatalogsModified: false;
  readonly activationAuthorized: false;
  readonly deterministic: true;
}

const outputPath = parseOutputPath(Deno.args);
const macro = runMacroEconomicScenario(macroConfig());
const creditRecovery = runCreditRecoveryScenario(creditConfig());
const evidence: AdvancedScenarioEvidence = {
  schemaVersion: 1,
  evidenceType: "economic-balance-advanced-reference",
  generatedAt: "2026-07-24T00:00:00.000Z",
  macro,
  creditRecovery,
  summary: {
    macroEvidenceDigest: macro.evidenceDigest,
    creditRecoveryEvidenceDigest: creditRecovery.evidenceDigest,
    peakInflationRate: macro.peakInflationRate,
    peakScarcityIndex: macro.peakScarcityIndex,
    maximumCurrencyDepreciationRate: macro.maximumCurrencyDepreciationRate,
    defaultRate: creditRecovery.defaultRate,
    defaultRecoveryRate: creditRecovery.defaultRecoveryRate,
    lateJoinWealthGapRatio: creditRecovery.lateJoinWealthGapRatio,
    criticalFindingCount: [
      ...macro.findings,
      ...creditRecovery.findings,
    ].filter((finding) => finding.severity === "critical").length,
  },
  seedCatalogsModified: false,
  activationAuthorized: false,
  deterministic: true,
};

await Deno.writeTextFile(
  outputPath,
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence.summary));

function macroConfig(): MacroScenarioConfig {
  return {
    scenarioPublicId: "simulation.macro.reference.v1",
    countries: macroCountries(),
    tradeLinks: [
      {
        exporterCountryCode: "NORTHREACH",
        importerCountryCode: "YRETHIA",
        dependencyWeight: 0.8,
      },
      {
        exporterCountryCode: "YRETHIA",
        importerCountryCode: "VELORIA",
        dependencyWeight: 0.55,
      },
      {
        exporterCountryCode: "VELORIA",
        importerCountryCode: "KAIROTH",
        dependencyWeight: 0.4,
      },
      {
        exporterCountryCode: "SOLMERE",
        importerCountryCode: "DRAEVON",
        dependencyWeight: 0.45,
      },
    ],
    phaseShocks: [
      {
        phase: "peace",
        moneyGrowthRate: 0.015,
        supplyShockByCountry: {},
        confidenceShockByCountry: {},
      },
      {
        phase: "shortage",
        moneyGrowthRate: 0.04,
        supplyShockByCountry: {
          NORTHREACH: 0.65,
          SOLMERE: 0.25,
        },
        confidenceShockByCountry: {
          YRETHIA: -0.03,
        },
      },
      {
        phase: "war",
        moneyGrowthRate: 0.09,
        supplyShockByCountry: {
          NORTHREACH: 0.8,
          YRETHIA: 0.45,
          VELORIA: 0.35,
        },
        confidenceShockByCountry: {
          NORTHREACH: -0.12,
          YRETHIA: -0.08,
        },
      },
      {
        phase: "reconstruction",
        moneyGrowthRate: 0.035,
        supplyShockByCountry: {
          NORTHREACH: 0.12,
          YRETHIA: 0.08,
        },
        confidenceShockByCountry: {
          NORTHREACH: 0.06,
          YRETHIA: 0.04,
        },
      },
    ],
    maximumAnnualizedInflationRate: 0.8,
    maximumCurrencyDepreciationRate: 0.35,
    maximumScarcityIndex: 2.5,
    maximumScarcityCascadeCountries: 8,
  };
}

function macroCountries(): MacroCountryProfile[] {
  const definitions = [
    ["NORTHREACH", "NRC"],
    ["YRETHIA", "YRT"],
    ["VELORIA", "VEL"],
    ["KAIROTH", "KAI"],
    ["SOLMERE", "SOL"],
    ["DRAEVON", "DRA"],
    ["AURELIS", "AUR"],
    ["MIRENDA", "MIR"],
    ["TALVORA", "TAL"],
    ["ZENITHIA", "ZEN"],
  ] as const;
  return definitions.map(([countryCode, currencyCode], index) => ({
    countryCode,
    currencyCode,
    startingPriceIndex: 100,
    startingFxRateToBase: 0.75 + index * 0.05,
    inflationSensitivity: 0.85 + index * 0.025,
    currencySensitivity: 0.9 + (index % 4) * 0.08,
    importDependency: index === 9 ? 0.05 : 0.35 + (index % 3) * 0.1,
  }));
}

function creditConfig(): CreditRecoveryScenarioConfig {
  return {
    scenarioPublicId: "simulation.credit-recovery.reference.v1",
    countries: creditCountries(),
    players: creditPlayers(),
    phaseWindows: [
      {
        phase: "peace",
        ticks: 6,
        incomeModifier: 1,
        costModifier: 1,
        interestModifier: 1,
      },
      {
        phase: "shortage",
        ticks: 6,
        incomeModifier: 0.88,
        costModifier: 1.25,
        interestModifier: 1.2,
      },
      {
        phase: "war",
        ticks: 6,
        incomeModifier: 0.7,
        costModifier: 1.55,
        interestModifier: 1.55,
      },
      {
        phase: "reconstruction",
        ticks: 6,
        incomeModifier: 1.18,
        costModifier: 1.08,
        interestModifier: 0.75,
      },
    ],
    startingCashMinor: 1_200,
    baseIncomeMinor: 900,
    subsistenceCostMinor: 650,
    lateJoinCatchUpGrantMinor: 2_500,
    lateJoinIncomeMultiplier: 1.35,
    scheduledPaymentRate: 0.22,
    minimumScheduledPaymentMinor: 200,
    delinquencyAfterMissedPayments: 2,
    defaultAfterMissedPayments: 4,
    restructuringPrincipalReductionRate: 0.2,
    reconstructionRecoveryIncomeMinor: 4_000,
    maximumDefaultRate: 0.65,
    minimumDefaultRecoveryRate: 0.25,
    maximumLateJoinWealthGapRatio: 2.5,
  };
}

function creditCountries(): CreditRecoveryCountryProfile[] {
  return [
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
  ].map((countryCode, index) => ({
    countryCode,
    incomeModifier: 0.9 + index * 0.02,
    costModifier: 1.08 - index * 0.012,
    creditModifier: 0.82 + (index % 5) * 0.06,
  }));
}

function creditPlayers(): CreditRecoveryPlayerProfile[] {
  const countryCodes = creditCountries().map((country) => country.countryCode);
  return Array.from({ length: 30 }, (_, index) => ({
    playerPublicId: `simulation.credit.player.${
      String(index + 1).padStart(3, "0")
    }`,
    countryCode: countryCodes[index % countryCodes.length],
    joinTick: index >= 20 ? 8 : 0,
    incomeCapacity: index % 5 === 0 ? 0.3 : 0.72 + (index % 4) * 0.07,
    savingsDiscipline: 0.35 + (index % 5) * 0.12,
    initialDebtMinor: index % 5 === 0 ? 4_500 : 1_500 + (index % 3) * 500,
  }));
}

function parseOutputPath(args: readonly string[]): string {
  const outputIndex = args.indexOf("--output");
  if (outputIndex < 0 || !args[outputIndex + 1]) {
    throw new Error("--output path is required");
  }
  return args[outputIndex + 1];
}
