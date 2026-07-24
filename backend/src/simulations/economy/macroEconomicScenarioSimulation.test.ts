import {
  runMacroEconomicScenario,
  type MacroCountryProfile,
  type MacroScenarioConfig,
} from "./macroEconomicScenarioSimulation.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("macro scenario is deterministic across inflation, FX, and scarcity propagation", () => {
  const first = runMacroEconomicScenario(baseConfig());
  const second = runMacroEconomicScenario(baseConfig());

  assertEquals(first, second);
  assertEquals(first.phaseResults.length, 40);
  assert(first.peakInflationRate > 0);
  assert(first.maximumCurrencyDepreciationRate >= 0);
  assert(first.peakScarcityIndex > 1);
  assertEquals(first.seedCatalogsModified, false);
  assertEquals(first.activationAuthorized, false);
  assertEquals(first.deterministic, true);
  assertEquals(first.evidenceDigest.length, 8);
});

Deno.test("scarcity propagates through import dependencies", () => {
  const report = runMacroEconomicScenario(baseConfig());
  const shortage = report.phaseResults.filter((result) =>
    result.phase === "shortage"
  );
  const importer = requireValue(
    shortage.find((result) => result.countryCode === "YRETHIA"),
  );
  const insulated = requireValue(
    shortage.find((result) => result.countryCode === "ZENITHIA"),
  );

  assert(importer.importedScarcityContribution > 0);
  assert(importer.scarcityIndex > insulated.scarcityIndex);
});

Deno.test("severe macro shocks emit inflation, currency, and cascade findings", () => {
  const config = baseConfig();
  const report = runMacroEconomicScenario({
    ...config,
    maximumAnnualizedInflationRate: 0.1,
    maximumCurrencyDepreciationRate: 0.02,
    maximumScarcityIndex: 1.1,
    maximumScarcityCascadeCountries: 2,
  });
  const codes = new Set(report.findings.map((finding) => finding.code));

  assert(codes.has("inflation_guardrail_exceeded"));
  assert(codes.has("currency_depreciation_guardrail_exceeded"));
  assert(codes.has("cross_country_scarcity_cascade_exceeded"));
});

Deno.test("macro scenario rejects unknown trade countries and duplicate currencies", () => {
  assertThrows(
    () =>
      runMacroEconomicScenario({
        ...baseConfig(),
        tradeLinks: [{
          exporterCountryCode: "UNKNOWN",
          importerCountryCode: "YRETHIA",
          dependencyWeight: 0.5,
        }],
      }),
    "macro_trade_link_unknown_country",
  );
  assertThrows(
    () =>
      runMacroEconomicScenario({
        ...baseConfig(),
        countries: countries().map((country, index) =>
          index === 9
            ? { ...country, currencyCode: countries()[0].currencyCode }
            : country
        ),
      }),
    "duplicate_macro_currency_code",
  );
});

function baseConfig(): MacroScenarioConfig {
  return {
    scenarioPublicId: "simulation.macro.reference.v1",
    countries: countries(),
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

function countries(): MacroCountryProfile[] {
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

function requireValue<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected test value.");
  return value;
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
