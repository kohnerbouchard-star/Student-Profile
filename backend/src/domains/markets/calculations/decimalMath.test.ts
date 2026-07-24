import {
  addMarketDecimals,
  clampMarketDecimal,
  compareMarketDecimals,
  divideMarketDecimals,
  formatMarketDecimal,
  MARKET_DECIMAL_SCALE,
  multiplyMarketDecimals,
  parseMarketDecimal,
  subtractMarketDecimals,
} from "./decimalMath.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("market decimal parsing and formatting is deterministic", () => {
  assertEquals(parseMarketDecimal("12.345678"), 12n * MARKET_DECIMAL_SCALE + 345_678n);
  assertEquals(formatMarketDecimal(parseMarketDecimal("12.340000")), "12.34");
  assertEquals(formatMarketDecimal(parseMarketDecimal("-0.000001")), "-0.000001");
  assertEquals(formatMarketDecimal(parseMarketDecimal("1.9999996")), "2");
});

Deno.test("market decimal arithmetic rounds once at six decimal places", () => {
  assertEquals(addMarketDecimals("1.1", "2.2", "3.3"), "6.6");
  assertEquals(subtractMarketDecimals("10", "3.125"), "6.875");
  assertEquals(multiplyMarketDecimals("12.5", "0.08"), "1");
  assertEquals(divideMarketDecimals("1", "3"), "0.333333");
});

Deno.test("market decimal comparisons and clamps preserve bounds", () => {
  assertEquals(compareMarketDecimals("1.000001", "1"), 1);
  assertEquals(compareMarketDecimals("-1", "0"), -1);
  assertEquals(compareMarketDecimals("2", "2.000000"), 0);
  assertEquals(clampMarketDecimal("11", "0", "10"), "10");
  assertEquals(clampMarketDecimal("-1", "0", "10"), "0");
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
