import {
  calculatePortfolioPerformance,
  type PortfolioPerformanceHolding,
} from "./portfolioPerformanceAnalytics.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "portfolio performance reconciles realized and unrealized returns",
  () => {
    const report = calculatePortfolioPerformance(
      holdings(),
      history(),
      scenario(),
    );
    assertEquals(report.currentValue, "1600");
    assertEquals(report.openCostBasis, "1450");
    assertEquals(report.realizedProfitLoss, "50");
    assertEquals(report.unrealizedProfitLoss, "150");
    assertEquals(report.totalProfitLoss, "200");
    assertEquals(report.totalReturnRatio, "0.117647");
  },
);

Deno.test(
  "portfolio exposures and risk-weighted metrics are deterministic",
  () => {
    const forward = calculatePortfolioPerformance(
      holdings(),
      history(),
      scenario(),
    );
    const reverse = calculatePortfolioPerformance(
      [...holdings()].reverse(),
      [...history()].reverse(),
      scenario(),
    );
    assertEquals(forward, reverse);
    assertEquals(forward.issuerExposure, {
      "issuer.a.v1": "1000",
      "issuer.b.v1": "600",
    });
    assertEquals(forward.countryExposure, {
      NORTHREACH: "1000",
      YRETHIA: "600",
    });
    assertEquals(forward.assetClassExposure, {
      bond: "600",
      equity: "1000",
    });
    assertEquals(forward.weightedDurationYears, 2.25);
    assertEquals(forward.weightedConvexity, 15);
    assertEquals(forward.weightedLiquidityScore, 0.675);
  },
);

Deno.test(
  "drawdown and historical VaR approximations use ordered observations",
  () => {
    const report = calculatePortfolioPerformance(
      holdings(),
      history(),
      scenario(),
    );
    assertEquals(report.maximumDrawdownRatio, 0.2);
    assertEquals(report.historicalValueAtRisk95Ratio, 0.2);
  },
);

Deno.test(
  "scenario loss combines instrument, issuer, country, and asset shocks",
  () => {
    const report = calculatePortfolioPerformance(
      holdings(),
      history(),
      scenario(),
    );
    assertEquals(report.scenarioValue, "1240");
    assertEquals(report.scenarioLoss, "360");
    assertEquals(report.scenarioLossRatio, "0.225");
    assertEquals(report.positionScenarioLosses, {
      "instrument.a.v1": "300",
      "instrument.b.v1": "60",
    });
  },
);

Deno.test(
  "duplicate holdings, duplicate timestamps, and invalid shocks fail closed",
  () => {
    const first = holdings()[0];
    assertThrows(
      () =>
        calculatePortfolioPerformance(
          [first, first],
          history(),
          scenario(),
        ),
      "duplicate_portfolio_performance_instrument",
    );
    assertThrows(
      () =>
        calculatePortfolioPerformance(
          holdings(),
          [history()[0], history()[0]],
          scenario(),
        ),
      "duplicate_portfolio_observation_time",
    );
    assertThrows(
      () =>
        calculatePortfolioPerformance(holdings(), history(), {
          ...scenario(),
          countryShocks: { NORTHREACH: -2 },
        }),
      "portfolio_scenario_shock_invalid",
    );
  },
);

function holdings(): PortfolioPerformanceHolding[] {
  return [
    {
      instrumentPublicId: "instrument.a.v1",
      issuerPublicId: "issuer.a.v1",
      countryCode: "NORTHREACH",
      assetClass: "equity",
      currentValue: "1000",
      openCostBasis: "900",
      realizedProceeds: "300",
      realizedCost: "250",
      durationYears: 0,
      convexity: 0,
      liquidityScore: 0.8,
    },
    {
      instrumentPublicId: "instrument.b.v1",
      issuerPublicId: "issuer.b.v1",
      countryCode: "YRETHIA",
      assetClass: "bond",
      currentValue: "600",
      openCostBasis: "550",
      realizedProceeds: "0",
      realizedCost: "0",
      durationYears: 6,
      convexity: 40,
      liquidityScore: 0.466667,
    },
  ];
}

function history() {
  return [
    {
      observedAt: "2026-07-20T00:00:00.000Z",
      portfolioValue: "1000",
    },
    {
      observedAt: "2026-07-21T00:00:00.000Z",
      portfolioValue: "1250",
    },
    {
      observedAt: "2026-07-22T00:00:00.000Z",
      portfolioValue: "1000",
    },
    {
      observedAt: "2026-07-23T00:00:00.000Z",
      portfolioValue: "1100",
    },
  ];
}

function scenario() {
  return {
    scenarioPublicId: "scenario.rate-credit-combined.v1",
    instrumentShocks: { "instrument.a.v1": -0.1 },
    issuerShocks: { "issuer.a.v1": -0.05 },
    countryShocks: { NORTHREACH: -0.1 },
    assetClassShocks: { equity: -0.05, bond: -0.1 },
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
