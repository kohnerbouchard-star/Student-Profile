import {
  assertMarketDomainBenchmarkGreen,
  MARKET_DOMAIN_BENCHMARK_WORKLOADS,
  REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
  runMarketDomainBenchmarkSuite,
} from "./marketDomainBenchmarkSuite.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "reference market-domain benchmark records every required workload",
  () => {
    const report = runMarketDomainBenchmarkSuite(
      REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
    );
    assertEquals(
      report.results.map((result) => result.workload),
      MARKET_DOMAIN_BENCHMARK_WORKLOADS,
    );
    assertEquals(report.results[0].itemCount, 3200);
    assertEquals(report.allThresholdsPassed, true);
    assertEquals(report.allRegressionsWithinPolicy, true);
    assertMarketDomainBenchmarkGreen(report);
  },
);

Deno.test("benchmark suite is deterministic", () => {
  const first = runMarketDomainBenchmarkSuite(
    REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
  );
  const second = runMarketDomainBenchmarkSuite({
    ...REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
  });
  assertEquals(first, second);
});

Deno.test(
  "threshold and baseline regressions are reported separately",
  () => {
    const thresholdReport = runMarketDomainBenchmarkSuite({
      ...REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
      operationThresholds: {
        ...REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT.operationThresholds,
        settlement_replay: 1,
      },
    });
    assertThrows(
      () => assertMarketDomainBenchmarkGreen(thresholdReport),
      "market_benchmark_threshold_regression:settlement_replay",
    );
    const baselineReport = runMarketDomainBenchmarkSuite({
      ...REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
      baselineOperations: {
        ...REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT.baselineOperations,
        concurrent_reservations: 1,
      },
    });
    assertThrows(
      () => assertMarketDomainBenchmarkGreen(baselineReport),
      "market_benchmark_baseline_regression:concurrent_reservations",
    );
  },
);

Deno.test(
  "definition count, activation attempts, and invalid workload sizes fail closed",
  () => {
    assertThrows(
      () =>
        runMarketDomainBenchmarkSuite({
          ...REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
          instrumentDefinitions: 3199,
        }),
      "market_benchmark_definition_count_must_equal_3200",
    );
    assertThrows(
      () =>
        runMarketDomainBenchmarkSuite({
          ...REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
          activationAuthorized: true as false,
        }),
      "market_benchmark_activation_must_remain_disabled",
    );
    assertThrows(
      () =>
        runMarketDomainBenchmarkSuite({
          ...REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT,
          orderBookOrders: 0,
        }),
      "market_benchmark_order_book_orders_invalid",
    );
  },
);

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
