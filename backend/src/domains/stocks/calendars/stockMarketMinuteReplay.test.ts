import {
  floorToUtcMinute,
  normalizeMarketMinute,
  planStockMarketDueMinutes,
} from "./stockMarketMinuteReplay.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("market minute normalization floors seconds and milliseconds", () => {
  assertEquals(
    floorToUtcMinute(new Date("2026-07-20T00:15:42.999Z")).toISOString(),
    "2026-07-20T00:15:00.000Z",
  );
  assertEquals(
    normalizeMarketMinute("2026-07-20T00:15:42.999Z"),
    "2026-07-20T00:15:00.000Z",
  );
});

Deno.test("first invocation processes only the current eligible open minute", () => {
  const plan = planStockMarketDueMinutes({
    exchangeCode: "FGX",
    lastProcessedMinute: null,
    now: new Date("2026-07-20T00:15:42.999Z"),
  });

  assertEquals(plan.dueMinutes, ["2026-07-20T00:15:00.000Z"]);
  assertEquals(plan.backlogRemaining, false);
});

Deno.test("closed first invocation does not manufacture a price minute", () => {
  const plan = planStockMarketDueMinutes({
    exchangeCode: "FGX",
    lastProcessedMinute: null,
    now: new Date("2026-07-19T00:15:00.000Z"),
  });

  assertEquals(plan.dueMinutes, []);
  assertEquals(plan.backlogRemaining, false);
});

Deno.test("weekday backlog includes only open minutes", () => {
  const plan = planStockMarketDueMinutes({
    exchangeCode: "FGX",
    lastProcessedMinute: "2026-07-19T22:58:00.000Z",
    now: new Date("2026-07-19T23:02:00.000Z"),
    maxMinutes: 10,
  });

  assertEquals(plan.dueMinutes, [
    "2026-07-19T23:00:00.000Z",
    "2026-07-19T23:01:00.000Z",
    "2026-07-19T23:02:00.000Z",
  ]);
});

Deno.test("overnight and weekend gaps do not create synthetic market minutes", () => {
  const plan = planStockMarketDueMinutes({
    exchangeCode: "FGX",
    lastProcessedMinute: "2026-07-17T07:59:00.000Z",
    now: new Date("2026-07-19T23:01:00.000Z"),
    maxMinutes: 10,
  });

  assertEquals(plan.dueMinutes, [
    "2026-07-19T23:00:00.000Z",
    "2026-07-19T23:01:00.000Z",
  ]);
});

Deno.test("catch-up stops at the bounded limit and reports remaining backlog", () => {
  const plan = planStockMarketDueMinutes({
    exchangeCode: "FGX",
    lastProcessedMinute: "2026-07-19T22:59:00.000Z",
    now: new Date("2026-07-19T23:05:00.000Z"),
    maxMinutes: 3,
  });

  assertEquals(plan.dueMinutes, [
    "2026-07-19T23:00:00.000Z",
    "2026-07-19T23:01:00.000Z",
    "2026-07-19T23:02:00.000Z",
  ]);
  assertEquals(plan.backlogRemaining, true);
});

Deno.test("future cursors and unsafe catch-up limits fail closed", () => {
  assertThrows(() =>
    planStockMarketDueMinutes({
      exchangeCode: "FGX",
      lastProcessedMinute: "2026-07-20T00:01:00.000Z",
      now: new Date("2026-07-20T00:00:00.000Z"),
    })
  );
  assertThrows(() =>
    planStockMarketDueMinutes({
      exchangeCode: "FGX",
      lastProcessedMinute: null,
      now: new Date("2026-07-20T00:00:00.000Z"),
      maxMinutes: 61,
    })
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}

function assertThrows(run: () => unknown): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected function to throw.");
}
