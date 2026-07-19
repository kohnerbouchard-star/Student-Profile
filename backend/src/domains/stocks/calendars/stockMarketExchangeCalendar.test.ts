import {
  evaluateStockMarketSession,
  getStockExchangeCodeForCountry,
  isStockMarketOpenAt,
  STOCK_EXCHANGE_CODES,
  stockMarketMinuteKey,
} from "./stockMarketExchangeCalendar.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("all ten countries map to a stable exchange", () => {
  assertEquals(STOCK_EXCHANGE_CODES.length, 10);
  assertEquals(getStockExchangeCodeForCountry("northreach"), "FGX");
  assertEquals(getStockExchangeCodeForCountry("YRETHIA"), "SBX");
  assertEquals(getStockExchangeCodeForCountry("THALORIS"), "DHM");
  assertEquals(getStockExchangeCodeForCountry("SOLVEND"), "AUX");
  assertEquals(getStockExchangeCodeForCountry("ELDORAN"), "CMX");
  assertEquals(getStockExchangeCodeForCountry("VALERION"), "GFX");
  assertEquals(getStockExchangeCodeForCountry("LUMENOR"), "SCX");
  assertEquals(getStockExchangeCodeForCountry("XALVORIA"), "ECX");
  assertEquals(getStockExchangeCodeForCountry("DRAVENLOK"), "IHX");
  assertEquals(getStockExchangeCodeForCountry("SYNDALIS"), "BDX");
});

Deno.test("market opens at 08:00 Asia Seoul on a weekday", () => {
  const state = evaluateStockMarketSession(
    "FGX",
    new Date("2026-07-19T23:00:00.000Z"),
  );
  assertEquals(state.status, "open");
  assertEquals(state.reason, "regular_session");
  assertEquals(state.localDate, "2026-07-20");
  assertEquals(state.localTime, "08:00");
});

Deno.test("market is closed before open and reports the next transition", () => {
  const state = evaluateStockMarketSession(
    "FGX",
    new Date("2026-07-19T22:59:00.000Z"),
  );
  assertEquals(state.status, "closed");
  assertEquals(state.reason, "before_open");
  assertEquals(state.nextTransitionAt, "2026-07-19T23:00:00.000Z");
});

Deno.test("market closes at 17:00 Asia Seoul", () => {
  const state = evaluateStockMarketSession(
    "FGX",
    new Date("2026-07-20T08:00:00.000Z"),
  );
  assertEquals(state.status, "closed");
  assertEquals(state.reason, "after_close");
});

Deno.test("weekends do not generate open market minutes", () => {
  const saturday = new Date("2026-07-18T03:00:00.000Z");
  assertEquals(isStockMarketOpenAt(saturday, "AUX"), false);
  const state = evaluateStockMarketSession("AUX", saturday);
  assertEquals(state.reason, "weekend");
  assertEquals(state.nextTransitionAt, "2026-07-19T23:00:00.000Z");
});

Deno.test("minute keys are stable and exchange scoped", () => {
  const at = new Date("2026-07-20T00:15:42.000Z");
  assertEquals(stockMarketMinuteKey("FGX", at), "FGX:2026-07-20T00:15Z");
  assertEquals(stockMarketMinuteKey("AUX", at), "AUX:2026-07-20T00:15Z");
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
