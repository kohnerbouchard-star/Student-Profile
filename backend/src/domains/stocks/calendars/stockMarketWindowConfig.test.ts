import {
  normalizeRequiredStockMarketWindowSetting,
  StockMarketWindowConfigError,
} from "./stockMarketWindowConfig.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("one explicit game timezone is required", () => {
  assertThrows(() => normalizeRequiredStockMarketWindowSetting(undefined));
  assertThrows(() => normalizeRequiredStockMarketWindowSetting({}));
  assertThrows(() =>
    normalizeRequiredStockMarketWindowSetting({ timezone: "Browser/Local" })
  );
});

Deno.test("valid IANA timezone is normalized and retained", () => {
  assertEquals(
    normalizeRequiredStockMarketWindowSetting({
      timezone: " Europe/London ",
      opensAt: "08:00",
      closesAt: "17:00",
    }),
    {
      timezone: "Europe/London",
      opensAt: "08:00",
      closesAt: "17:00",
    },
  );
});

function assertThrows(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    if (error instanceof StockMarketWindowConfigError) return;
    throw error;
  }
  throw new Error("Expected StockMarketWindowConfigError.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
