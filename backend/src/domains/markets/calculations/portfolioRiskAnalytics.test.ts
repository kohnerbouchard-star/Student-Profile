import {
  calculatePortfolioRisk,
  stressPortfolio,
  type PortfolioRiskHolding,
} from "./portfolioRiskAnalytics.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "portfolio risk produces deterministic concentration and liquidity metrics",
  () => {
    const result = calculatePortfolioRisk(baseHoldings(), thresholds());
    assertEquals(result.totalValue, "1000");
    assertEquals(result.positionCount, 3);
    assertEquals(result.topPositionWeight, 0.5);
    assertEquals(result.issuerHerfindahlIndex, 0.38);
    assertEquals(result.countryHerfindahlIndex, 0.58);
    assertEquals(result.assetClassHerfindahlIndex, 0.58);
    assertEquals(result.weightedVolatilityProxy, 0.2);
    assertEquals(result.weightedLiquidityScore, 0.73);
    assertEquals(result.warnings, []);
  },
);

Deno.test("risk results are invariant to input ordering", () => {
  const forward = calculatePortfolioRisk(baseHoldings(), thresholds());
  const reverse = calculatePortfolioRisk(
    [...baseHoldings()].reverse(),
    thresholds(),
  );
  assertEquals(forward, reverse);
});

Deno.test("concentration and liquidity thresholds emit sorted warnings", () => {
  const result = calculatePortfolioRisk(baseHoldings(), {
    maximumSinglePositionWeight: 0.4,
    maximumIssuerWeight: 0.4,
    maximumCountryWeight: 0.5,
    maximumAssetClassWeight: 0.5,
    minimumLiquidityScore: 0.8,
  });
  assertEquals(result.warnings, [
    "asset_class_concentration_exceeded",
    "country_concentration_exceeded",
    "issuer_concentration_exceeded",
    "portfolio_liquidity_below_threshold",
    "single_position_concentration_exceeded",
  ]);
});

Deno.test(
  "portfolio stress composes asset, country, default, and liquidity losses",
  () => {
    const result = stressPortfolio(baseHoldings(), {
      scenarioPublicId: "scenario.systemic-stress.v1",
      assetClassShocks: { equity: -0.2, fixed_income: -0.05 },
      countryShocks: { NORTHREACH: -0.1 },
      issuerDefaultLossRates: {
        "issuer.northreach.corporation.0002.v1": 0.5,
      },
      liquidityHaircuts: { equity: 0.05 },
    });
    assertEquals(result.startingValue, "1000");
    assertEquals(result.stressedValue, "695.4");
    assertEquals(result.lossAmount, "304.6");
    assertEquals(result.lossRatio, "0.3046");
  },
);

Deno.test("portfolio risk rejects duplicate instruments and invalid values", () => {
  assertThrows(
    () =>
      calculatePortfolioRisk([
        ...baseHoldings(),
        baseHoldings()[0],
      ], thresholds()),
    "duplicate_portfolio_instrument",
  );
  assertThrows(
    () =>
      calculatePortfolioRisk([{
        ...baseHoldings()[0],
        annualizedVolatility: -1,
      }], thresholds()),
    "portfolio_volatility_invalid",
  );
});

function baseHoldings(): PortfolioRiskHolding[] {
  return [
    {
      instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
      issuerPublicId: "issuer.northreach.corporation.0001.v1",
      countryCode: "NORTHREACH",
      assetClass: "equity",
      quotationCurrencyCode: "NRC",
      currentValue: "500",
      annualizedVolatility: 0.25,
      liquidityScore: 0.8,
    },
    {
      instrumentPublicId: "instrument.northreach.common_equity.0002.v1",
      issuerPublicId: "issuer.northreach.corporation.0002.v1",
      countryCode: "NORTHREACH",
      assetClass: "equity",
      quotationCurrencyCode: "NRC",
      currentValue: "200",
      annualizedVolatility: 0.3,
      liquidityScore: 0.6,
    },
    {
      instrumentPublicId: "instrument.yrethia.sovereign_bond.0001.v1",
      issuerPublicId: "issuer.yrethia.government.0001.v1",
      countryCode: "YRETHIA",
      assetClass: "fixed_income",
      quotationCurrencyCode: "YRT",
      currentValue: "300",
      annualizedVolatility: 0.05,
      liquidityScore: 0.7,
    },
  ];
}

function thresholds() {
  return {
    maximumSinglePositionWeight: 0.5,
    maximumIssuerWeight: 0.5,
    maximumCountryWeight: 0.7,
    maximumAssetClassWeight: 0.7,
    minimumLiquidityScore: 0.7,
  };
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
