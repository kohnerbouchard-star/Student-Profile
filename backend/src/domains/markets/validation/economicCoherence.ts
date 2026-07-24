import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  marketDecimalToNumber,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "../calculations/decimalMath.ts";

export interface MarketQuoteCoherenceInput {
  readonly listingPublicId: string;
  readonly currencyCode: string;
  readonly bid: string;
  readonly ask: string;
  readonly observedAt: string;
  readonly staleAfter: string;
  readonly active: boolean;
}

export interface MarketQuoteCoherenceReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly maximumObservedSpreadBps: number;
  readonly deterministic: true;
}

export interface DirectedCurrencyRate {
  readonly baseCurrencyCode: string;
  readonly quoteCurrencyCode: string;
  readonly rate: string;
}

export interface TriangularArbitrageOpportunity {
  readonly cycle: readonly [string, string, string, string];
  readonly grossMultiplier: string;
  readonly excessReturn: string;
}

export interface RoundTripArbitrageInput {
  readonly buyPrice: string;
  readonly sellPrice: string;
  readonly quantity: string;
  readonly transactionFeeRate: number;
  readonly exchangeFeeRate: number;
  readonly fixedFee: string;
  readonly tolerance: string;
}

export interface RoundTripArbitrageResult {
  readonly grossBuyValue: string;
  readonly grossSellValue: string;
  readonly totalFees: string;
  readonly netProfit: string;
  readonly exploitable: boolean;
  readonly deterministic: true;
}

export function validateMarketQuoteCoherence(
  quotes: readonly MarketQuoteCoherenceInput[],
  now: string,
  maximumSpreadBps: number,
): MarketQuoteCoherenceReport {
  if (!Number.isFinite(Date.parse(now))) throw new Error("quote_coherence_now_invalid");
  if (
    !Number.isFinite(maximumSpreadBps) ||
    maximumSpreadBps < 0 ||
    maximumSpreadBps > 100_000
  ) {
    throw new Error("quote_coherence_spread_limit_invalid");
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let maximumObservedSpreadBps = 0;
  for (const quote of [...quotes].sort((left, right) =>
    left.listingPublicId.localeCompare(right.listingPublicId)
  )) {
    if (!quote.listingPublicId.trim()) errors.push("quote_listing_id_required");
    if (seen.has(quote.listingPublicId)) errors.push("duplicate_quote_listing");
    seen.add(quote.listingPublicId);
    if (!/^[A-Z]{3,16}$/.test(quote.currencyCode)) {
      errors.push("quote_currency_invalid");
    }
    if (
      compareMarketDecimals(quote.bid, "0") <= 0 ||
      compareMarketDecimals(quote.ask, "0") <= 0
    ) {
      errors.push("quote_price_non_positive");
      continue;
    }
    if (compareMarketDecimals(quote.bid, quote.ask) > 0) {
      errors.push("crossed_market");
    }
    if (
      !Number.isFinite(Date.parse(quote.observedAt)) ||
      !Number.isFinite(Date.parse(quote.staleAfter))
    ) {
      errors.push("quote_timestamp_invalid");
      continue;
    }
    if (Date.parse(quote.observedAt) > Date.parse(now)) {
      errors.push("quote_observed_in_future");
    }
    if (Date.parse(quote.staleAfter) < Date.parse(now)) {
      warnings.push("stale_quote");
    }
    if (!quote.active) warnings.push("inactive_listing_quote");
    const midpoint = divideMarketDecimals(
      addMarketDecimals(quote.bid, quote.ask),
      "2",
    );
    const spread = subtractMarketDecimals(quote.ask, quote.bid);
    const spreadBps = marketDecimalToNumber(
      multiplyMarketDecimals(divideMarketDecimals(spread, midpoint), "10000"),
    );
    maximumObservedSpreadBps = Math.max(maximumObservedSpreadBps, spreadBps);
    if (spreadBps > maximumSpreadBps) warnings.push("wide_spread");
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
    maximumObservedSpreadBps: round(maximumObservedSpreadBps, 6),
    deterministic: true,
  };
}

export function detectTriangularArbitrage(
  rates: readonly DirectedCurrencyRate[],
  toleranceBps: number,
): readonly TriangularArbitrageOpportunity[] {
  if (!Number.isFinite(toleranceBps) || toleranceBps < 0 || toleranceBps > 10_000) {
    throw new Error("triangular_arbitrage_tolerance_invalid");
  }
  const direct = new Map<string, string>();
  const currencies = new Set<string>();
  for (const rate of rates) {
    if (
      !/^[A-Z]{3,16}$/.test(rate.baseCurrencyCode) ||
      !/^[A-Z]{3,16}$/.test(rate.quoteCurrencyCode) ||
      rate.baseCurrencyCode === rate.quoteCurrencyCode
    ) {
      throw new Error("triangular_arbitrage_currency_invalid");
    }
    if (compareMarketDecimals(rate.rate, "0") <= 0) {
      throw new Error("triangular_arbitrage_rate_non_positive");
    }
    const key = pairKey(rate.baseCurrencyCode, rate.quoteCurrencyCode);
    if (direct.has(key)) throw new Error("triangular_arbitrage_duplicate_rate");
    direct.set(key, rate.rate);
    currencies.add(rate.baseCurrencyCode);
    currencies.add(rate.quoteCurrencyCode);
  }
  const orderedCurrencies = [...currencies].sort();
  const threshold = addMarketDecimals("1", toleranceBps / 10_000);
  const opportunities: TriangularArbitrageOpportunity[] = [];
  for (let first = 0; first < orderedCurrencies.length; first += 1) {
    for (let second = first + 1; second < orderedCurrencies.length; second += 1) {
      for (let third = second + 1; third < orderedCurrencies.length; third += 1) {
        const a = orderedCurrencies[first];
        const b = orderedCurrencies[second];
        const c = orderedCurrencies[third];
        for (const cycle of [
          [a, b, c, a] as const,
          [a, c, b, a] as const,
        ]) {
          const firstRate = resolvedRate(direct, cycle[0], cycle[1]);
          const secondRate = resolvedRate(direct, cycle[1], cycle[2]);
          const thirdRate = resolvedRate(direct, cycle[2], cycle[3]);
          if (firstRate === null || secondRate === null || thirdRate === null) continue;
          const grossMultiplier = multiplyMarketDecimals(
            multiplyMarketDecimals(firstRate, secondRate),
            thirdRate,
          );
          if (compareMarketDecimals(grossMultiplier, threshold) > 0) {
            opportunities.push({
              cycle,
              grossMultiplier,
              excessReturn: subtractMarketDecimals(grossMultiplier, "1"),
            });
          }
        }
      }
    }
  }
  return opportunities.sort((left, right) =>
    left.cycle.join("|").localeCompare(right.cycle.join("|"))
  );
}

export function assessRoundTripArbitrage(
  input: RoundTripArbitrageInput,
): RoundTripArbitrageResult {
  for (const [field, value] of [
    ["buy_price", input.buyPrice],
    ["sell_price", input.sellPrice],
    ["quantity", input.quantity],
  ] as const) {
    if (compareMarketDecimals(value, "0") <= 0) {
      throw new Error(`${field}_must_be_positive`);
    }
  }
  if (
    !Number.isFinite(input.transactionFeeRate) ||
    input.transactionFeeRate < 0 ||
    input.transactionFeeRate > 1 ||
    !Number.isFinite(input.exchangeFeeRate) ||
    input.exchangeFeeRate < 0 ||
    input.exchangeFeeRate > 1
  ) {
    throw new Error("round_trip_fee_rate_invalid");
  }
  if (
    compareMarketDecimals(input.fixedFee, "0") < 0 ||
    compareMarketDecimals(input.tolerance, "0") < 0
  ) {
    throw new Error("round_trip_non_negative_input_required");
  }
  const grossBuyValue = multiplyMarketDecimals(input.buyPrice, input.quantity);
  const grossSellValue = multiplyMarketDecimals(input.sellPrice, input.quantity);
  const buyFees = calculateFees(grossBuyValue, input);
  const sellFees = calculateFees(grossSellValue, input);
  const totalFees = addMarketDecimals(buyFees, sellFees);
  const netProfit = subtractMarketDecimals(
    subtractMarketDecimals(grossSellValue, grossBuyValue),
    totalFees,
  );
  return {
    grossBuyValue,
    grossSellValue,
    totalFees,
    netProfit,
    exploitable: compareMarketDecimals(netProfit, input.tolerance) > 0,
    deterministic: true,
  };
}

function calculateFees(
  grossValue: string,
  input: RoundTripArbitrageInput,
): string {
  return addMarketDecimals(
    multiplyMarketDecimals(grossValue, input.transactionFeeRate),
    multiplyMarketDecimals(grossValue, input.exchangeFeeRate),
    input.fixedFee,
  );
}

function resolvedRate(
  rates: ReadonlyMap<string, string>,
  base: string,
  quote: string,
): string | null {
  const direct = rates.get(pairKey(base, quote));
  if (direct) return direct;
  const inverse = rates.get(pairKey(quote, base));
  return inverse ? divideMarketDecimals("1", inverse) : null;
}

function pairKey(base: string, quote: string): string {
  return `${base}/${quote}`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
