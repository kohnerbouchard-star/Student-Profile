import type {
  FinancialMarketOrderSide,
} from "../contracts/financialMarketContracts.ts";
import {
  compareMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "../calculations/decimalMath.ts";

export interface FinancialInstrumentOrderBookContext {
  readonly listingPublicId: string;
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly now: string;
  readonly gameStatus: "active" | "ended";
  readonly marketPaused: boolean;
  readonly exchangeOpen: boolean;
  readonly listingActive: boolean;
  readonly instrumentActive: boolean;
  readonly quantityIncrement: string;
  readonly priceIncrement: string;
  readonly partialFillSupported: false;
  readonly shortSellingSupported: false;
  readonly settlementDomain: "financial_instrument";
  readonly marketplacePhysicalItemSettlementSupported: false;
}

export interface FinancialInstrumentBookOrder {
  readonly orderPublicId: string;
  readonly playerPublicId: string;
  readonly reservationPublicId: string;
  readonly listingPublicId: string;
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly side: FinancialMarketOrderSide;
  readonly orderType: "limit";
  readonly quantity: string;
  readonly limitPrice: string;
  readonly submittedAt: string;
  readonly sequence: number;
  readonly expiresAt: string | null;
  readonly status: "open";
  readonly reservationKind: "cash" | "asset";
  readonly partialFillSupported: false;
}

export interface FinancialInstrumentBookMatch {
  readonly matchPublicId: string;
  readonly buyOrderPublicId: string;
  readonly sellOrderPublicId: string;
  readonly buyerPlayerPublicId: string;
  readonly sellerPlayerPublicId: string;
  readonly listingPublicId: string;
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly quantity: string;
  readonly executionPrice: string;
  readonly grossValue: string;
  readonly makerOrderPublicId: string;
  readonly takerOrderPublicId: string;
  readonly priceRule: "maker_limit";
  readonly settlementDomain: "financial_instrument";
  readonly marketplacePhysicalItemSettlementSupported: false;
}

export interface FinancialInstrumentOrderBookSnapshot {
  readonly listingPublicId: string;
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly observedAt: string;
  readonly bids: readonly FinancialInstrumentBookOrder[];
  readonly asks: readonly FinancialInstrumentBookOrder[];
  readonly matches: readonly FinancialInstrumentBookMatch[];
  readonly unmatchedOrderPublicIds: readonly string[];
  readonly expiredOrderPublicIds: readonly string[];
  readonly selfTradeBlockedPairKeys: readonly string[];
  readonly bestBid: string | null;
  readonly bestAsk: string | null;
  readonly quotedSpread: string | null;
  readonly inputDigest: string;
  readonly deterministic: true;
  readonly partialFillSupported: false;
  readonly shortSellingSupported: false;
  readonly settlementDomain: "financial_instrument";
  readonly marketplacePhysicalItemSettlementSupported: false;
}

export function runDeterministicFinancialOrderBook(
  orders: readonly FinancialInstrumentBookOrder[],
  context: FinancialInstrumentOrderBookContext,
): FinancialInstrumentOrderBookSnapshot {
  validateContext(context);
  const seenOrderIds = new Set<string>();
  const seenReservationIds = new Set<string>();
  const expiredOrderPublicIds: string[] = [];
  const eligible: FinancialInstrumentBookOrder[] = [];

  for (const order of orders) {
    validateOrder(order, context);
    if (seenOrderIds.has(order.orderPublicId)) {
      throw new Error("order_book_duplicate_order_id");
    }
    if (seenReservationIds.has(order.reservationPublicId)) {
      throw new Error("order_book_duplicate_reservation_id");
    }
    seenOrderIds.add(order.orderPublicId);
    seenReservationIds.add(order.reservationPublicId);
    if (
      order.expiresAt !== null &&
      Date.parse(order.expiresAt) <= Date.parse(context.now)
    ) {
      expiredOrderPublicIds.push(order.orderPublicId);
    } else {
      eligible.push(order);
    }
  }

  const bids = eligible.filter((order) => order.side === "buy").sort(compareBids);
  const asks = eligible.filter((order) => order.side === "sell").sort(compareAsks);
  const remainingAsks = [...asks];
  const matchedOrderIds = new Set<string>();
  const matches: FinancialInstrumentBookMatch[] = [];
  const selfTradeBlockedPairKeys = new Set<string>();

  for (const buy of bids) {
    for (let askIndex = 0; askIndex < remainingAsks.length; askIndex += 1) {
      const sell = remainingAsks[askIndex];
      if (compareMarketDecimals(buy.limitPrice, sell.limitPrice) < 0) break;
      if (compareMarketDecimals(buy.quantity, sell.quantity) !== 0) continue;
      if (buy.playerPublicId === sell.playerPublicId) {
        selfTradeBlockedPairKeys.add(
          `${buy.orderPublicId}|${sell.orderPublicId}`,
        );
        continue;
      }
      const maker = compareTimePriority(buy, sell) <= 0 ? buy : sell;
      const taker = maker.orderPublicId === buy.orderPublicId ? sell : buy;
      const executionPrice = maker.limitPrice;
      const identity = stableHash(
        `${buy.orderPublicId}|${sell.orderPublicId}`,
      );
      matches.push({
        matchPublicId: `market-match.${identity}.v1`,
        buyOrderPublicId: buy.orderPublicId,
        sellOrderPublicId: sell.orderPublicId,
        buyerPlayerPublicId: buy.playerPublicId,
        sellerPlayerPublicId: sell.playerPublicId,
        listingPublicId: context.listingPublicId,
        instrumentPublicId: context.instrumentPublicId,
        quotationCurrencyCode: context.quotationCurrencyCode,
        quantity: buy.quantity,
        executionPrice,
        grossValue: multiplyMarketDecimals(buy.quantity, executionPrice),
        makerOrderPublicId: maker.orderPublicId,
        takerOrderPublicId: taker.orderPublicId,
        priceRule: "maker_limit",
        settlementDomain: "financial_instrument",
        marketplacePhysicalItemSettlementSupported: false,
      });
      matchedOrderIds.add(buy.orderPublicId);
      matchedOrderIds.add(sell.orderPublicId);
      remainingAsks.splice(askIndex, 1);
      break;
    }
  }

  const unmatchedOrderPublicIds = eligible
    .filter((order) => !matchedOrderIds.has(order.orderPublicId))
    .map((order) => order.orderPublicId)
    .sort();
  const bestBid = bids[0]?.limitPrice ?? null;
  const bestAsk = asks[0]?.limitPrice ?? null;
  const quotedSpread = bestBid !== null && bestAsk !== null
    ? subtractMarketDecimals(bestAsk, bestBid)
    : null;
  const digestInput = [
    ...eligible.map(canonicalOrder).sort(),
    ...matches.map((match) => canonicalMatch(match)).sort(),
  ].join("\n");

  return {
    listingPublicId: context.listingPublicId,
    instrumentPublicId: context.instrumentPublicId,
    quotationCurrencyCode: context.quotationCurrencyCode,
    observedAt: context.now,
    bids,
    asks,
    matches,
    unmatchedOrderPublicIds,
    expiredOrderPublicIds: expiredOrderPublicIds.sort(),
    selfTradeBlockedPairKeys: [...selfTradeBlockedPairKeys].sort(),
    bestBid,
    bestAsk,
    quotedSpread,
    inputDigest: stableHash(digestInput),
    deterministic: true,
    partialFillSupported: false,
    shortSellingSupported: false,
    settlementDomain: "financial_instrument",
    marketplacePhysicalItemSettlementSupported: false,
  };
}

function validateContext(context: FinancialInstrumentOrderBookContext): void {
  for (const value of [
    context.listingPublicId,
    context.instrumentPublicId,
  ]) {
    if (!value.trim() || value.length > 160) {
      throw new Error("order_book_identity_invalid");
    }
  }
  if (!/^[A-Z]{3,16}$/.test(context.quotationCurrencyCode)) {
    throw new Error("order_book_currency_invalid");
  }
  assertIsoTime(context.now, "order_book_time_invalid");
  if (context.gameStatus !== "active") throw new Error("order_book_game_ended");
  if (context.marketPaused) throw new Error("order_book_market_paused");
  if (!context.exchangeOpen) throw new Error("order_book_exchange_closed");
  if (!context.listingActive || !context.instrumentActive) {
    throw new Error("order_book_inactive_listing_or_instrument");
  }
  if (
    context.partialFillSupported !== false ||
    context.shortSellingSupported !== false
  ) {
    throw new Error("order_book_unsupported_trading_feature_enabled");
  }
  if (
    context.settlementDomain !== "financial_instrument" ||
    context.marketplacePhysicalItemSettlementSupported !== false
  ) {
    throw new Error("order_book_settlement_domain_invalid");
  }
  toMicrounits(context.quantityIncrement, false);
  toMicrounits(context.priceIncrement, false);
}

function validateOrder(
  order: FinancialInstrumentBookOrder,
  context: FinancialInstrumentOrderBookContext,
): void {
  for (const value of [
    order.orderPublicId,
    order.playerPublicId,
    order.reservationPublicId,
  ]) {
    if (!value.trim() || value.length > 160) {
      throw new Error("order_book_order_identity_invalid");
    }
  }
  if (
    order.listingPublicId !== context.listingPublicId ||
    order.instrumentPublicId !== context.instrumentPublicId ||
    order.quotationCurrencyCode !== context.quotationCurrencyCode
  ) {
    throw new Error("order_book_mixed_market_scope");
  }
  if (order.orderType !== "limit") {
    throw new Error("order_book_limit_orders_only");
  }
  if (order.status !== "open") throw new Error("order_book_order_not_open");
  if (order.partialFillSupported !== false) {
    throw new Error("order_book_partial_fills_must_remain_disabled");
  }
  const expectedReservationKind = order.side === "buy" ? "cash" : "asset";
  if (order.reservationKind !== expectedReservationKind) {
    throw new Error("order_book_reservation_kind_invalid");
  }
  if (!Number.isInteger(order.sequence) || order.sequence < 1) {
    throw new Error("order_book_sequence_invalid");
  }
  assertIsoTime(order.submittedAt, "order_book_submitted_at_invalid");
  if (Date.parse(order.submittedAt) > Date.parse(context.now)) {
    throw new Error("order_book_future_submission");
  }
  if (order.expiresAt !== null) {
    assertIsoTime(order.expiresAt, "order_book_expiry_invalid");
    if (Date.parse(order.expiresAt) <= Date.parse(order.submittedAt)) {
      throw new Error("order_book_expiry_invalid");
    }
  }
  assertIncrement(
    order.quantity,
    context.quantityIncrement,
    "order_book_quantity_increment_invalid",
  );
  assertIncrement(
    order.limitPrice,
    context.priceIncrement,
    "order_book_price_increment_invalid",
  );
}

function compareBids(
  left: FinancialInstrumentBookOrder,
  right: FinancialInstrumentBookOrder,
): number {
  const price = compareMarketDecimals(right.limitPrice, left.limitPrice);
  return price !== 0 ? price : compareTimePriority(left, right);
}

function compareAsks(
  left: FinancialInstrumentBookOrder,
  right: FinancialInstrumentBookOrder,
): number {
  const price = compareMarketDecimals(left.limitPrice, right.limitPrice);
  return price !== 0 ? price : compareTimePriority(left, right);
}

function compareTimePriority(
  left: FinancialInstrumentBookOrder,
  right: FinancialInstrumentBookOrder,
): number {
  const time = Date.parse(left.submittedAt) - Date.parse(right.submittedAt);
  if (time !== 0) return time;
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  return left.orderPublicId.localeCompare(right.orderPublicId);
}

function canonicalOrder(order: FinancialInstrumentBookOrder): string {
  return [
    order.orderPublicId,
    order.playerPublicId,
    order.side,
    order.quantity,
    order.limitPrice,
    order.submittedAt,
    order.sequence,
    order.expiresAt ?? "",
  ].join("|");
}

function canonicalMatch(match: FinancialInstrumentBookMatch): string {
  return [
    match.matchPublicId,
    match.buyOrderPublicId,
    match.sellOrderPublicId,
    match.quantity,
    match.executionPrice,
    match.grossValue,
    match.makerOrderPublicId,
  ].join("|");
}

function assertIncrement(
  value: string,
  increment: string,
  errorCode: string,
): void {
  const valueUnits = toMicrounits(value, false);
  const incrementUnits = toMicrounits(increment, false);
  if (valueUnits % incrementUnits !== 0n) throw new Error(errorCode);
}

function toMicrounits(value: string, allowZero: boolean): bigint {
  const text = String(value).trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(text)) {
    throw new Error("order_book_amount_precision_invalid");
  }
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole) * 1_000_000n +
    BigInt(fraction.padEnd(6, "0"));
  if (units < 0n || (!allowZero && units === 0n)) {
    throw new Error("order_book_amount_value_invalid");
  }
  return units;
}

function assertIsoTime(value: string, errorCode: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(errorCode);
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}
