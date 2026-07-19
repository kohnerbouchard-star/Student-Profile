import {
  SEOUL_STOCK_MARKET_TIME_ZONE,
  resolveStockMarketWindowSettings,
  validateStockMarketWindowSettings,
} from "./stockMarketWindowSettings.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("configured game timezone is authoritative", () => {
  assertEquals(
    resolveStockMarketWindowSettings({ timezone: "America/New_York" }),
    { timezone: "America/New_York", source: "game_setting" },
  );
});

Deno.test("missing or invalid game timezone falls back to Seoul", () => {
  assertEquals(
    resolveStockMarketWindowSettings({}),
    {
      timezone: SEOUL_STOCK_MARKET_TIME_ZONE,
      source: "seoul_fallback",
    },
  );
  assertEquals(
    resolveStockMarketWindowSettings({ timezone: "device-local" }),
    {
      timezone: SEOUL_STOCK_MARKET_TIME_ZONE,
      source: "seoul_fallback",
    },
  );
});

Deno.test("settings validation accepts omitted timezone and rejects invalid timezone", () => {
  validateStockMarketWindowSettings({});
  validateStockMarketWindowSettings({ timezone: "Europe/London" });
  assertThrows(() =>
    validateStockMarketWindowSettings({ timezone: "browser-device-zone" })
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
