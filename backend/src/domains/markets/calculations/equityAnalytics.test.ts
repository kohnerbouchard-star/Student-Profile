import {
  applyDeterministicEquitySplit,
  calculateEquityAnalytics,
} from "./equityAnalytics.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("equity analytics derives deterministic valuation and return metrics", () => {
  const result = calculateEquityAnalytics(baseInput());
  assertEquals(result.marketCapitalization, "5000000");
  assertEquals(result.earningsPerShare, "5");
  assertEquals(result.bookValuePerShare, "20");
  assertEquals(result.priceEarningsRatio, "10");
  assertEquals(result.priceBookRatio, "2.5");
  assertEquals(result.dividendYield, "0.04");
  assertEquals(result.returnOnEquity, "0.25");
  assertEquals(result.payoutRatio, "0.4");
  assertEquals(result.totalShareholderReturn, "0.155556");
  assertEquals(result.deterministic, true);
});

Deno.test("loss periods retain finite metrics and explicit valuation warnings", () => {
  const result = calculateEquityAnalytics({
    ...baseInput(),
    netIncome: "-250000",
    bookValue: "-100000",
  });
  assertEquals(result.priceEarningsRatio, null);
  assertEquals(result.priceBookRatio, null);
  assertEquals(result.returnOnEquity, null);
  assertEquals(result.payoutRatio, null);
  assertEquals(result.warnings, [
    "non_positive_book_value",
    "non_positive_net_income",
  ]);
});

Deno.test("preferred dividend coverage is derived without convertible pricing", () => {
  const result = calculateEquityAnalytics({
    ...baseInput(),
    equityKind: "preferred",
    annualPreferredDividendRequirement: "125000",
  });
  assertEquals(result.preferredDividendCoverage, "4");
  assertEquals(result.complexConvertiblePricingSupported, false);
  assertEquals(result.activationAuthorized, false);
});

Deno.test("equity splits preserve market capitalization at exact ratios", () => {
  const split = applyDeterministicEquitySplit({
    sharesOutstanding: "100000",
    referencePrice: "50",
    splitNumerator: 2,
    splitDenominator: 1,
  });
  assertEquals(split.adjustedSharesOutstanding, "200000");
  assertEquals(split.adjustedReferencePrice, "25");
  assertEquals(split.marketCapitalizationBefore, "5000000");
  assertEquals(split.marketCapitalizationAfter, "5000000");
  assertEquals(split.continuityDifference, "0");
});

Deno.test("equity analytics rejects invalid quantities and activation attempts", () => {
  assertThrows(() => calculateEquityAnalytics({
    ...baseInput(),
    sharesOutstanding: "0",
  }), "shares_outstanding_must_be_positive");
  assertThrows(() => calculateEquityAnalytics({
    ...baseInput(),
    activationAuthorized: true as false,
  }), "equity_activation_must_remain_disabled");
});

function baseInput() {
  return {
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    equityKind: "common" as const,
    marketPrice: "50",
    priorMarketPrice: "45",
    sharesOutstanding: "100000",
    netIncome: "500000",
    bookValue: "2000000",
    annualDividendPerShare: "2",
    annualPreferredDividendRequirement: "0",
    activationAuthorized: false as const,
    complexConvertiblePricingSupported: false as const,
  };
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
