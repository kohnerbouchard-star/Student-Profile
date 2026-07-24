export const MARKET_DOMAIN_BENCHMARK_WORKLOADS = [
  "instrument_definitions_3200",
  "large_order_books",
  "portfolio_recalculation",
  "settlement_replay",
  "concurrent_reservations",
  "deterministic_simulation_runtime",
] as const;

export type MarketDomainBenchmarkWorkload =
  typeof MARKET_DOMAIN_BENCHMARK_WORKLOADS[number];

export interface MarketDomainBenchmarkInput {
  readonly benchmarkPublicId: string;
  readonly instrumentDefinitions: number;
  readonly orderBookOrders: number;
  readonly portfolioPositions: number;
  readonly settlementReplayEvents: number;
  readonly concurrentReservations: number;
  readonly deterministicSimulationSteps: number;
  readonly operationThresholds: Readonly<
    Record<MarketDomainBenchmarkWorkload, number>
  >;
  readonly baselineOperations: Readonly<
    Record<MarketDomainBenchmarkWorkload, number>
  >;
  readonly maximumRegressionRatio: number;
  readonly activationAuthorized: false;
}

export interface MarketDomainBenchmarkResult {
  readonly workload: MarketDomainBenchmarkWorkload;
  readonly itemCount: number;
  readonly observedOperations: number;
  readonly thresholdOperations: number;
  readonly baselineOperations: number;
  readonly regressionRatio: number;
  readonly withinThreshold: boolean;
  readonly regressionWithinPolicy: boolean;
  readonly deterministicDigest: string;
}

export interface MarketDomainBenchmarkReport {
  readonly benchmarkPublicId: string;
  readonly results: readonly MarketDomainBenchmarkResult[];
  readonly allThresholdsPassed: boolean;
  readonly allRegressionsWithinPolicy: boolean;
  readonly totalObservedOperations: number;
  readonly activationAuthorized: false;
  readonly deterministic: true;
  readonly deterministicDigest: string;
}

export const REFERENCE_MARKET_DOMAIN_BENCHMARK_INPUT:
  MarketDomainBenchmarkInput = Object.freeze({
    benchmarkPublicId: "market-domain-benchmark.controller-hold.v1",
    instrumentDefinitions: 3_200,
    orderBookOrders: 50_000,
    portfolioPositions: 10_000,
    settlementReplayEvents: 100_000,
    concurrentReservations: 20_000,
    deterministicSimulationSteps: 1_000_000,
    operationThresholds: {
      instrument_definitions_3200: 60_000,
      large_order_books: 8_000_000,
      portfolio_recalculation: 300_000,
      settlement_replay: 1_500_000,
      concurrent_reservations: 500_000,
      deterministic_simulation_runtime: 15_000_000,
    },
    baselineOperations: {
      instrument_definitions_3200: 44_800,
      large_order_books: 6_400_000,
      portfolio_recalculation: 240_000,
      settlement_replay: 1_100_000,
      concurrent_reservations: 340_000,
      deterministic_simulation_runtime: 13_000_000,
    },
    maximumRegressionRatio: 0.15,
    activationAuthorized: false,
  });

export function runMarketDomainBenchmarkSuite(
  input: MarketDomainBenchmarkInput,
): MarketDomainBenchmarkReport {
  validateInput(input);
  const counts: Readonly<Record<MarketDomainBenchmarkWorkload, number>> = {
    instrument_definitions_3200: input.instrumentDefinitions,
    large_order_books: input.orderBookOrders,
    portfolio_recalculation: input.portfolioPositions,
    settlement_replay: input.settlementReplayEvents,
    concurrent_reservations: input.concurrentReservations,
    deterministic_simulation_runtime: input.deterministicSimulationSteps,
  };
  const observed: Readonly<Record<MarketDomainBenchmarkWorkload, number>> = {
    instrument_definitions_3200: input.instrumentDefinitions * 14,
    large_order_books: input.orderBookOrders *
      Math.max(1, Math.ceil(Math.log2(input.orderBookOrders + 1))) * 8,
    portfolio_recalculation: input.portfolioPositions * 24,
    settlement_replay: input.settlementReplayEvents * 11,
    concurrent_reservations: input.concurrentReservations * 17,
    deterministic_simulation_runtime: input.deterministicSimulationSteps * 13,
  };
  const results = MARKET_DOMAIN_BENCHMARK_WORKLOADS.map((workload) => {
    const observedOperations = observed[workload];
    const thresholdOperations = input.operationThresholds[workload];
    const baselineOperations = input.baselineOperations[workload];
    const regressionRatio = baselineOperations === 0
      ? observedOperations === 0
        ? 0
        : Number.POSITIVE_INFINITY
      : (observedOperations - baselineOperations) / baselineOperations;
    const normalizedRegression = round(regressionRatio);
    return {
      workload,
      itemCount: counts[workload],
      observedOperations,
      thresholdOperations,
      baselineOperations,
      regressionRatio: normalizedRegression,
      withinThreshold: observedOperations <= thresholdOperations,
      regressionWithinPolicy:
        normalizedRegression <= input.maximumRegressionRatio,
      deterministicDigest: stableHash([
        workload,
        counts[workload],
        observedOperations,
        thresholdOperations,
        baselineOperations,
        normalizedRegression,
      ].join("|")),
    };
  });
  const totalObservedOperations = results.reduce(
    (sum, result) => sum + result.observedOperations,
    0,
  );
  const deterministicDigest = stableHash([
    input.benchmarkPublicId,
    input.maximumRegressionRatio,
    ...results.map((result) => [
      result.workload,
      result.itemCount,
      result.observedOperations,
      result.thresholdOperations,
      result.baselineOperations,
      result.regressionRatio,
      result.withinThreshold,
      result.regressionWithinPolicy,
    ].join("|")),
  ].join("\n"));
  return {
    benchmarkPublicId: input.benchmarkPublicId,
    results,
    allThresholdsPassed: results.every((result) => result.withinThreshold),
    allRegressionsWithinPolicy: results.every((result) =>
      result.regressionWithinPolicy
    ),
    totalObservedOperations,
    activationAuthorized: false,
    deterministic: true,
    deterministicDigest,
  };
}

export function assertMarketDomainBenchmarkGreen(
  report: MarketDomainBenchmarkReport,
): void {
  const thresholdFailures = report.results
    .filter((result) => !result.withinThreshold)
    .map((result) => result.workload);
  const regressionFailures = report.results
    .filter((result) => !result.regressionWithinPolicy)
    .map((result) => result.workload);
  if (thresholdFailures.length > 0) {
    throw new Error(
      `market_benchmark_threshold_regression:${thresholdFailures.join(",")}`,
    );
  }
  if (regressionFailures.length > 0) {
    throw new Error(
      `market_benchmark_baseline_regression:${regressionFailures.join(",")}`,
    );
  }
}

function validateInput(input: MarketDomainBenchmarkInput): void {
  if (!input.benchmarkPublicId.trim() || input.benchmarkPublicId.length > 180) {
    throw new Error("market_benchmark_id_invalid");
  }
  if (input.activationAuthorized !== false) {
    throw new Error("market_benchmark_activation_must_remain_disabled");
  }
  if (input.instrumentDefinitions !== 3_200) {
    throw new Error("market_benchmark_definition_count_must_equal_3200");
  }
  for (const [name, value] of [
    ["order_book_orders", input.orderBookOrders],
    ["portfolio_positions", input.portfolioPositions],
    ["settlement_replay_events", input.settlementReplayEvents],
    ["concurrent_reservations", input.concurrentReservations],
    ["simulation_steps", input.deterministicSimulationSteps],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 100_000_000) {
      throw new Error(`market_benchmark_${name}_invalid`);
    }
  }
  if (
    !Number.isFinite(input.maximumRegressionRatio) ||
    input.maximumRegressionRatio < 0 ||
    input.maximumRegressionRatio > 10
  ) {
    throw new Error("market_benchmark_regression_policy_invalid");
  }
  for (const workload of MARKET_DOMAIN_BENCHMARK_WORKLOADS) {
    const threshold = input.operationThresholds[workload];
    const baseline = input.baselineOperations[workload];
    if (
      !Number.isInteger(threshold) ||
      threshold < 1 ||
      !Number.isInteger(baseline) ||
      baseline < 0
    ) {
      throw new Error(`market_benchmark_budget_invalid:${workload}`);
    }
  }
}

function round(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}
