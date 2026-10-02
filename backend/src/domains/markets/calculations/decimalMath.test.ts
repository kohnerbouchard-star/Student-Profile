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

Deno.test("retained decimal half ties round away from zero at six fractional digits", () => {
  for (const sign of ["", "-"]) {
    assertEquals(formatMarketDecimal(parseMarketDecimal(`${sign}0.0000004`)), "0");
    assertEquals(formatMarketDecimal(parseMarketDecimal(`${sign}0.0000005`)), `${sign}0.000001`);
    assertEquals(formatMarketDecimal(parseMarketDecimal(`${sign}1.9999995`)), `${sign}2`);
    assertEquals(multiplyMarketDecimals(`${sign}0.000001`, "0.5"), `${sign}0.000001`);
    assertEquals(divideMarketDecimals(`${sign}0.000001`, "2"), `${sign}0.000001`);
    assertEquals(divideMarketDecimals("0.000001", `${sign}2`), `${sign}0.000001`);
  }
  assertEquals(multiplyMarketDecimals("0.000001", "0.499999"), "0");
  assertEquals(multiplyMarketDecimals("0.000001", "0.500001"), "0.000001");
});

Deno.test("retained decimal parser rejects malformed strings and nonfinite numbers exactly", () => {
  for (const value of ["", "01", "1e3", ".5", "1.", "NaN", "Infinity"]) {
    assertDecimalError(() => parseMarketDecimal(value), `Invalid market decimal: ${value}`);
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    assertDecimalError(() => parseMarketDecimal(value), "Market decimal number must be finite.");
  }
  // Whitespace trimming is existing parser behavior, not a stricter input-policy decision.
  assertEquals(formatMarketDecimal(parseMarketDecimal(" 1.25 ")), "1.25");
});

Deno.test("retained decimal division and clamp errors include rounded-zero denominators", () => {
  for (const denominator of ["0", "0.0000004", "-0.0000004"]) {
    assertDecimalError(() => divideMarketDecimals("1", denominator), "Market decimal division by zero.");
  }
  assertDecimalError(() => clampMarketDecimal("1", "2", "0"), "Market decimal minimum exceeds maximum.");
});

function assertDecimalError(run: () => unknown, expected: string): void {
  try {
    run();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    assertEquals(error.message, expected);
    return;
  }
  throw new Error(`Expected error: ${expected}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
