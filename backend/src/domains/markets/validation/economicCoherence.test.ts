import {
  assessRoundTripArbitrage,
  detectTriangularArbitrage,
  validateMarketQuoteCoherence,
} from "./economicCoherence.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("quote coherence detects crossed, stale, inactive, and wide markets", () => {
  const report = validateMarketQuoteCoherence([
    {
      listingPublicId: "listing.synthetic.one.v1",
      currencyCode: "ECO",
      bid: "101",
      ask: "100",
      observedAt: "2026-07-21T09:59:00.000Z",
      staleAfter: "2026-07-21T09:59:30.000Z",
      active: false,
    },
  ], "2026-07-21T10:00:00.000Z", 25);
  assertEquals(report.valid, false);
  assertEquals(report.errors, ["crossed_market"]);
  assertEquals(report.warnings, ["inactive_listing_quote", "stale_quote"]);
});

Deno.test("triangular arbitrage detection finds profitable cycles and respects tolerance", () => {
  const rates = [
    { baseCurrencyCode: "AAA", quoteCurrencyCode: "BBB", rate: "2" },
    { baseCurrencyCode: "BBB", quoteCurrencyCode: "CCC", rate: "2" },
    { baseCurrencyCode: "CCC", quoteCurrencyCode: "AAA", rate: "0.26" },
  ];
  const opportunities = detectTriangularArbitrage(rates, 5);
  assertEquals(opportunities.length, 1);
  assertEquals(opportunities[0].grossMultiplier, "1.04");
  assertEquals(opportunities[0].excessReturn, "0.04");
  assertEquals(detectTriangularArbitrage(rates, 500).length, 0);
});

Deno.test("round-trip analysis includes both legs of fees before flagging exploits", () => {
  const closed = assessRoundTripArbitrage({
    buyPrice: "100",
    sellPrice: "100.5",
    quantity: "10",
    transactionFeeRate: 0.001,
    exchangeFeeRate: 0.001,
    fixedFee: "0.5",
    tolerance: "0.01",
  });
  assertEquals(closed.exploitable, false);
  const open = assessRoundTripArbitrage({
    buyPrice: "100",
    sellPrice: "102",
    quantity: "10",
    transactionFeeRate: 0,
    exchangeFeeRate: 0,
    fixedFee: "0",
    tolerance: "0.01",
  });
  assertEquals(open.netProfit, "20");
  assertEquals(open.exploitable, true);
});

Deno.test("coherence checks reject malformed currency and duplicate rate inputs", () => {
  assertThrows(() => detectTriangularArbitrage([
    { baseCurrencyCode: "AAA", quoteCurrencyCode: "BBB", rate: "2" },
    { baseCurrencyCode: "AAA", quoteCurrencyCode: "BBB", rate: "2.1" },
  ], 1), "triangular_arbitrage_duplicate_rate");
  const report = validateMarketQuoteCoherence([
    {
      listingPublicId: "listing.synthetic.one.v1",
      currencyCode: "eco",
      bid: "10",
      ask: "11",
      observedAt: "2026-07-21T09:59:00.000Z",
      staleAfter: "2026-07-21T10:01:00.000Z",
      active: true,
    },
  ], "2026-07-21T10:00:00.000Z", 1000);
  assertEquals(report.errors, ["quote_currency_invalid"]);
});

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
