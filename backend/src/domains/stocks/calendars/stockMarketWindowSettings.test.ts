import {
  readRequiredStockMarketTimeZone,
  validateStockMarketWindowSettings,
} from "./stockMarketWindowSettings.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("configured game timezone is authoritative", () => {
  assertEquals(
    readRequiredStockMarketTimeZone({ timezone: "America/New_York" }),
    "America/New_York",
  );
});

Deno.test("timezone values are normalized before persistence or evaluation", () => {
  const settings: Record<string, unknown> = {
    timezone: "  Asia/Seoul  ",
  };
  validateStockMarketWindowSettings(settings);
  assertEquals(settings.timezone, "Asia/Seoul");
});

Deno.test("missing, empty, device-derived, and invalid timezones fail closed", () => {
  assertThrows(() => readRequiredStockMarketTimeZone({}));
  assertThrows(() => readRequiredStockMarketTimeZone({ timezone: "" }));
  assertThrows(() =>
    readRequiredStockMarketTimeZone({ timezone: "device-local" })
  );
  assertThrows(() =>
    readRequiredStockMarketTimeZone({ timezone: "browser-device-zone" })
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
