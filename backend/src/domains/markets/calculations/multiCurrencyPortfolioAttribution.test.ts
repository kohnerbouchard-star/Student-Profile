import {
  attributeMultiCurrencyPortfolio,
  type MultiCurrencyAttributionHolding,
} from "./multiCurrencyPortfolioAttribution.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "multi-currency attribution reconciles local and foreign-exchange contributions",
  () => {
    const result = attributeMultiCurrencyPortfolio(baseHoldings(), "ECO");

    assertEquals(result.baseCurrencyCode, "ECO");
    assertEquals(result.startingValueBase, "800");
    assertEquals(result.endingValueBase, "897.5");
    assertEquals(result.netCashFlowBase, "15.5");
    assertEquals(result.localMarketContributionBase, "90");
    assertEquals(result.currencyContributionBase, "23");
    assertEquals(result.totalContributionBase, "113");
    assertEquals(result.currencyContributions, {
      NRC: "116",
      YRT: "-3",
    });
    assertEquals(result.countryContributions, {
      NORTHREACH: "116",
      YRETHIA: "-3",
    });
    assertEquals(result.assetClassContributions, {
      equity: "116",
      fixed_income: "-3",
    });
    assertEquals(result.activationAuthorized, false);
    assertEquals(result.deterministic, true);
  },
);

Deno.test("attribution is invariant to holding order", () => {
  const forward = attributeMultiCurrencyPortfolio(baseHoldings(), "ECO");
  const reverse = attributeMultiCurrencyPortfolio(
    [...baseHoldings()].reverse(),
    "ECO",
  );
  assertEquals(forward, reverse);
});

Deno.test("attribution rejects duplicate instruments and invalid rates", () => {
  assertThrows(
    () =>
      attributeMultiCurrencyPortfolio([
        ...baseHoldings(),
        baseHoldings()[0],
      ], "ECO"),
    "duplicate_attribution_instrument",
  );
  assertThrows(
    () =>
      attributeMultiCurrencyPortfolio([{
        ...baseHoldings()[0],
        endingFxRateToBase: "0",
      }], "ECO"),
    "ending_fx_rate_invalid",
  );
});

Deno.test("attribution rejects malformed currency identifiers", () => {
  assertThrows(
    () => attributeMultiCurrencyPortfolio(baseHoldings(), "eco"),
    "base_currency_invalid",
  );
  assertThrows(
    () =>
      attributeMultiCurrencyPortfolio([{
        ...baseHoldings()[0],
        quotationCurrencyCode: "N!",
      }], "ECO"),
    "quotation_currency_invalid",
  );
});

function baseHoldings(): MultiCurrencyAttributionHolding[] {
  return [
    {
      instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
      countryCode: "NORTHREACH",
      assetClass: "equity",
      quotationCurrencyCode: "NRC",
      startingValueLocal: "1000",
      endingValueLocal: "1100",
      netCashFlowLocal: "20",
      startingFxRateToBase: "0.5",
      endingFxRateToBase: "0.55",
    },
    {
      instrumentPublicId: "instrument.yrethia.sovereign_bond.0001.v1",
      countryCode: "YRETHIA",
      assetClass: "fixed_income",
      quotationCurrencyCode: "YRT",
      startingValueLocal: "600",
      endingValueLocal: "650",
      netCashFlowLocal: "10",
      startingFxRateToBase: "0.5",
      endingFxRateToBase: "0.45",
    },
  ];
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
