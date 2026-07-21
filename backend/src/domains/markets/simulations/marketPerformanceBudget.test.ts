import {
  runDeterministicMarketPerformanceBudget,
  type MarketPerformanceRow,
} from "./marketPerformanceBudget.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("3,200-row deterministic performance budget stays within fixed operation limits", () => {
  const rows = buildRows(3200);
  const result = runDeterministicMarketPerformanceBudget({
    rows,
    passes: 4,
    maximumOperationCount: 40_000,
  });
  assertEquals(result.rowCount, 3200);
  assertEquals(result.operationCount, 38_400);
  assertEquals(result.totalsByPass.length, 4);
  assertEquals(new Set(result.totalsByPass).size, 1);
  assertEquals(result.wallClockThresholdEnforced, false);
});

Deno.test("performance results are invariant to input ordering", () => {
  const rows = buildRows(100);
  const forward = runDeterministicMarketPerformanceBudget({
    rows,
    passes: 3,
    maximumOperationCount: 1000,
  });
  const reverse = runDeterministicMarketPerformanceBudget({
    rows: [...rows].reverse(),
    passes: 3,
    maximumOperationCount: 1000,
  });
  assertEquals(forward, reverse);
});

Deno.test("performance budgets fail closed before excessive work", () => {
  assertThrows(() => runDeterministicMarketPerformanceBudget({
    rows: buildRows(3200),
    passes: 4,
    maximumOperationCount: 38_399,
  }), "market_performance_operation_budget_exceeded");
  assertThrows(() => runDeterministicMarketPerformanceBudget({
    rows: [
      ...buildRows(1),
      ...buildRows(1),
    ],
    passes: 1,
    maximumOperationCount: 100,
  }), "market_performance_duplicate_instrument");
});

function buildRows(count: number): readonly MarketPerformanceRow[] {
  return Array.from({ length: count }, (_, index) => ({
    instrumentPublicId: `instrument.synthetic.${String(index).padStart(4, "0")}.v1`,
    quantity: String((index % 7) + 1),
    price: `${10 + (index % 90)}.${String(index % 100).padStart(2, "0")}`,
    weight: "1",
  }));
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
