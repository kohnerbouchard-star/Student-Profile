import {
  ECONOMIC_COHERENCE_SCENARIOS,
  runEconomicCoherenceScenarioSimulation,
} from "./economicCoherenceScenarioSimulation.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "economic-coherence simulation covers every authorized scenario deterministically",
  () => {
    const first = runEconomicCoherenceScenarioSimulation(input());
    const second = runEconomicCoherenceScenarioSimulation(input());
    assertEquals(first, second);
    assertEquals(first.scenarioCount, 13);
    assertEquals(
      first.scenarios.map((scenario) => scenario.scenario),
      ECONOMIC_COHERENCE_SCENARIOS,
    );
    assertEquals(
      first.totalOperations,
      first.scenarios.reduce((sum, scenario) => sum + scenario.operations, 0),
    );
  },
);

Deno.test(
  "liquidity, rate, credit, default, and redemption shocks move risk in expected directions",
  () => {
    const report = runEconomicCoherenceScenarioSimulation(input());
    const liquidity = find(report, "liquidity_drought");
    const rate = find(report, "rate_shock");
    const credit = find(report, "credit_deterioration");
    const issuerDefault = find(report, "issuer_default");
    const redemption = find(report, "fund_redemption");
    assertTrue(liquidity.liquidityIndex < input().initialState.liquidityIndex);
    assertTrue(rate.priceIndex < input().initialState.priceIndex);
    assertTrue(credit.creditQuality < input().initialState.creditQuality);
    assertEquals(issuerDefault.creditQuality, 0);
    assertTrue(redemption.fundCashBuffer < input().initialState.fundCashBuffer);
  },
);

Deno.test(
  "manipulation, wash, circular, reservation, replay, settlement, and arbitrage attacks are detected or bounded",
  () => {
    const report = runEconomicCoherenceScenarioSimulation(input());
    assertTrue(
      find(report, "market_manipulation_attempt").manipulationAlerts > 0,
    );
    assertTrue(find(report, "wash_trading").washTradeAlerts > 0);
    assertTrue(
      find(report, "circular_valuation").circularValuationAlerts > 0,
    );
    assertTrue(
      find(report, "reservation_abuse").reservationRejections > 0,
    );
    assertTrue(find(report, "replay_abuse").replayRejections > 0);
    assertTrue(find(report, "settlement_failure").settlementFailures > 0);
    assertTrue(
      find(report, "arbitrage_leakage").arbitrageLeakageRatio <
        input().initialState.arbitrageGapRatio + 0.06 * 1.15,
    );
  },
);

Deno.test(
  "all simulated state remains bounded and activation stays disabled",
  () => {
    const report = runEconomicCoherenceScenarioSimulation(input());
    for (const scenario of report.scenarios) {
      assertTrue(scenario.priceIndex > 0);
      for (const value of [
        scenario.liquidityIndex,
        scenario.creditQuality,
        scenario.fundCashBuffer,
        scenario.reservationUtilization,
        scenario.settlementReliability,
      ]) {
        assertTrue(value >= 0 && value <= 1);
      }
      assertTrue(
        scenario.arbitrageLeakageRatio >= 0 &&
          scenario.arbitrageLeakageRatio <= 0.5,
      );
    }
    assertEquals(report.activationAuthorized, false);
    assertEquals(report.marketplacePhysicalItemSettlementSupported, false);
  },
);

Deno.test(
  "activation attempts, Marketplace coupling, and invalid state fail closed",
  () => {
    assertThrows(
      () =>
        runEconomicCoherenceScenarioSimulation({
          ...input(),
          activationAuthorized: true as false,
        }),
      "economic_simulation_activation_must_remain_disabled",
    );
    assertThrows(
      () =>
        runEconomicCoherenceScenarioSimulation({
          ...input(),
          marketplacePhysicalItemSettlementSupported: true as false,
        }),
      "economic_simulation_marketplace_coupling_forbidden",
    );
    assertThrows(
      () =>
        runEconomicCoherenceScenarioSimulation({
          ...input(),
          initialState: {
            ...input().initialState,
            liquidityIndex: 2,
          },
        }),
      "economic_simulation_liquidity_invalid",
    );
  },
);

function input() {
  return {
    simulationPublicId: "market-simulation.active-domain-tranche.v1",
    seed: "controller-hold-seed-305",
    stepsPerScenario: 1000,
    initialState: {
      priceIndex: 100,
      liquidityIndex: 0.75,
      creditQuality: 0.8,
      fundNavIndex: 100,
      fundCashBuffer: 0.3,
      reservationUtilization: 0.45,
      settlementReliability: 0.99,
      arbitrageGapRatio: 0.08,
    },
    activationAuthorized: false as const,
    marketplacePhysicalItemSettlementSupported: false as const,
  };
}

function find(
  report: ReturnType<typeof runEconomicCoherenceScenarioSimulation>,
  scenario: typeof ECONOMIC_COHERENCE_SCENARIOS[number],
) {
  const found = report.scenarios.find((entry) => entry.scenario === scenario);
  if (!found) throw new Error(`missing:${scenario}`);
  return found;
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertTrue(value: boolean): void {
  if (!value) throw new Error("Expected condition to be true.");
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
