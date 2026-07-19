import {
  DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE,
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

Deno.test("missing or invalid game timezone uses the server fallback", () => {
  assertEquals(
    resolveStockMarketWindowSettings({}, "UTC"),
    { timezone: "UTC", source: "server_fallback" },
  );
  assertEquals(
    resolveStockMarketWindowSettings({ timezone: "device-local" }, "UTC"),
    { timezone: "UTC", source: "server_fallback" },
  );
});

Deno.test("invalid server fallback uses the stable server default", () => {
  assertEquals(
    resolveStockMarketWindowSettings({}, "not-a-timezone"),
    {
      timezone: DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE,
      source: "server_fallback",
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
