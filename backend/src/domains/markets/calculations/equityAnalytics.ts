import {
  absoluteMarketDecimal,
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "./decimalMath.ts";

export interface EquityAnalyticsInput {
  readonly instrumentPublicId: string;
  readonly equityKind: "common" | "preferred";
  readonly marketPrice: string;
  readonly priorMarketPrice: string | null;
  readonly sharesOutstanding: string;
  readonly netIncome: string;
  readonly bookValue: string;
  readonly annualDividendPerShare: string;
  readonly annualPreferredDividendRequirement: string;
  readonly activationAuthorized: false;
  readonly complexConvertiblePricingSupported: false;
}

export interface EquityAnalyticsResult {
  readonly instrumentPublicId: string;
  readonly equityKind: "common" | "preferred";
  readonly marketCapitalization: string;
  readonly earningsPerShare: string;
  readonly bookValuePerShare: string;
  readonly annualDividendTotal: string;
  readonly dividendYield: string;
  readonly priceEarningsRatio: string | null;
  readonly priceBookRatio: string | null;
  readonly returnOnEquity: string | null;
  readonly payoutRatio: string | null;
  readonly preferredDividendCoverage: string | null;
  readonly totalShareholderReturn: string | null;
  readonly warnings: readonly string[];
  readonly deterministic: true;
  readonly activationAuthorized: false;
  readonly complexConvertiblePricingSupported: false;
}

export interface EquitySplitInput {
  readonly sharesOutstanding: string;
  readonly referencePrice: string;
  readonly splitNumerator: number;
  readonly splitDenominator: number;
}

export interface EquitySplitResult {
  readonly adjustedSharesOutstanding: string;
  readonly adjustedReferencePrice: string;
  readonly marketCapitalizationBefore: string;
  readonly marketCapitalizationAfter: string;
  readonly continuityDifference: string;
  readonly deterministic: true;
}

export function calculateEquityAnalytics(
  input: EquityAnalyticsInput,
): EquityAnalyticsResult {
  validateEquityInput(input);
  const marketCapitalization = multiplyMarketDecimals(
    input.marketPrice,
    input.sharesOutstanding,
  );
  const earningsPerShare = divideMarketDecimals(
    input.netIncome,
    input.sharesOutstanding,
  );
  const bookValuePerShare = divideMarketDecimals(
    input.bookValue,
    input.sharesOutstanding,
  );
  const annualDividendTotal = multiplyMarketDecimals(
    input.annualDividendPerShare,
    input.sharesOutstanding,
  );
  const warnings: string[] = [];

  if (compareMarketDecimals(input.netIncome, "0") <= 0) {
    warnings.push("non_positive_net_income");
  }
  if (compareMarketDecimals(input.bookValue, "0") <= 0) {
    warnings.push("non_positive_book_value");
  }
  if (
    compareMarketDecimals(input.annualDividendPerShare, earningsPerShare) > 0 &&
    compareMarketDecimals(earningsPerShare, "0") > 0
  ) {
    warnings.push("dividend_exceeds_earnings_per_share");
  }

  return {
    instrumentPublicId: input.instrumentPublicId,
    equityKind: input.equityKind,
    marketCapitalization,
    earningsPerShare,
    bookValuePerShare,
    annualDividendTotal,
    dividendYield: divideMarketDecimals(
      input.annualDividendPerShare,
      input.marketPrice,
    ),
    priceEarningsRatio: compareMarketDecimals(earningsPerShare, "0") > 0
      ? divideMarketDecimals(input.marketPrice, earningsPerShare)
      : null,
    priceBookRatio: compareMarketDecimals(bookValuePerShare, "0") > 0
      ? divideMarketDecimals(input.marketPrice, bookValuePerShare)
      : null,
    returnOnEquity: compareMarketDecimals(input.bookValue, "0") > 0
      ? divideMarketDecimals(input.netIncome, input.bookValue)
      : null,
    payoutRatio: compareMarketDecimals(input.netIncome, "0") > 0
      ? divideMarketDecimals(annualDividendTotal, input.netIncome)
      : null,
    preferredDividendCoverage:
      compareMarketDecimals(input.annualPreferredDividendRequirement, "0") > 0
        ? divideMarketDecimals(
          input.netIncome,
          input.annualPreferredDividendRequirement,
        )
        : null,
    totalShareholderReturn: input.priorMarketPrice === null
      ? null
      : divideMarketDecimals(
        addMarketDecimals(
          subtractMarketDecimals(input.marketPrice, input.priorMarketPrice),
          input.annualDividendPerShare,
        ),
        input.priorMarketPrice,
      ),
    warnings: [...new Set(warnings)].sort(),
    deterministic: true,
    activationAuthorized: false,
    complexConvertiblePricingSupported: false,
  };
}

export function applyDeterministicEquitySplit(
  input: EquitySplitInput,
): EquitySplitResult {
  assertPositiveAmount(input.sharesOutstanding, "shares_outstanding");
  assertPositiveAmount(input.referencePrice, "reference_price");
  assertPositiveInteger(input.splitNumerator, "split_numerator");
  assertPositiveInteger(input.splitDenominator, "split_denominator");
  const splitRatio = divideMarketDecimals(
    input.splitNumerator,
    input.splitDenominator,
  );
  const adjustedSharesOutstanding = multiplyMarketDecimals(
    input.sharesOutstanding,
    splitRatio,
  );
  const adjustedReferencePrice = divideMarketDecimals(
    input.referencePrice,
    splitRatio,
  );
  const marketCapitalizationBefore = multiplyMarketDecimals(
    input.sharesOutstanding,
    input.referencePrice,
  );
  const marketCapitalizationAfter = multiplyMarketDecimals(
    adjustedSharesOutstanding,
    adjustedReferencePrice,
  );
  return {
    adjustedSharesOutstanding,
    adjustedReferencePrice,
    marketCapitalizationBefore,
    marketCapitalizationAfter,
    continuityDifference: absoluteMarketDecimal(
      subtractMarketDecimals(
        marketCapitalizationAfter,
        marketCapitalizationBefore,
      ),
    ),
    deterministic: true,
  };
}

function validateEquityInput(input: EquityAnalyticsInput): void {
  if (!input.instrumentPublicId.trim() || input.instrumentPublicId.length > 160) {
    throw new Error("instrument_public_id_invalid");
  }
  assertPositiveAmount(input.marketPrice, "market_price");
  assertPositiveAmount(input.sharesOutstanding, "shares_outstanding");
  assertNonNegativeAmount(
    input.annualDividendPerShare,
    "annual_dividend_per_share",
  );
  assertNonNegativeAmount(
    input.annualPreferredDividendRequirement,
    "annual_preferred_dividend_requirement",
  );
  if (input.priorMarketPrice !== null) {
    assertPositiveAmount(input.priorMarketPrice, "prior_market_price");
  }
  if (input.activationAuthorized !== false) {
    throw new Error("equity_activation_must_remain_disabled");
  }
  if (input.complexConvertiblePricingSupported !== false) {
    throw new Error("complex_convertible_pricing_must_remain_disabled");
  }
}

function assertPositiveAmount(value: string, field: string): void {
  if (compareMarketDecimals(value, "0") <= 0) {
    throw new Error(`${field}_must_be_positive`);
  }
}

function assertNonNegativeAmount(value: string, field: string): void {
  if (compareMarketDecimals(value, "0") < 0) {
    throw new Error(`${field}_must_be_non_negative`);
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1_000_000) {
    throw new Error(`${field}_invalid`);
  }
}
