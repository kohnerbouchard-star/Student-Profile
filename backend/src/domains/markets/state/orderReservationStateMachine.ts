import type {
  FinancialMarketOrderSide,
  FinancialMarketOrderStatus,
  FinancialMarketOrderType,
  FinancialMarketReservationKind,
  FinancialMarketReservationStatus,
} from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "../calculations/decimalMath.ts";

export interface OrderReservationTradingRules {
  readonly minimumOrderQuantity: string;
  readonly quantityIncrement: string;
  readonly priceIncrement: string;
  readonly transactionFeeRate: number;
  readonly exchangeFeeRate: number;
  readonly fixedFee: string;
  readonly shortSellingSupported: false;
  readonly partialFillSupported: false;
}

export interface OrderReservationSubmission {
  readonly gamePublicId: string;
  readonly playerPublicId: string;
  readonly listingPublicId: string;
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly side: FinancialMarketOrderSide;
  readonly orderType: FinancialMarketOrderType;
  readonly quantity: string;
  readonly limitPrice: string | null;
  readonly reviewedPrice: string;
  readonly reviewedQuoteVersion: number;
  readonly reviewedAt: string;
  readonly staleAfter: string;
  readonly expiresAt: string | null;
  readonly idempotencyKey: string;
  readonly requestDigestSha256: string;
}

export interface OrderReservationAdmissionContext {
  readonly now: string;
  readonly gameStatus: "active" | "ended";
  readonly marketPaused: boolean;
  readonly exchangeOpen: boolean;
  readonly instrumentActive: boolean;
  readonly listingActive: boolean;
  readonly availableCash: string;
  readonly availableAssetQuantity: string;
  readonly tradingRules: OrderReservationTradingRules;
}

export interface OrderReservationOrderState {
  readonly orderPublicId: string;
  readonly version: number;
  readonly listingPublicId: string;
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly side: FinancialMarketOrderSide;
  readonly orderType: FinancialMarketOrderType;
  readonly originalQuantity: string;
  readonly remainingQuantity: string;
  readonly filledQuantity: string;
  readonly limitPrice: string | null;
  readonly reviewedPrice: string;
  readonly reviewedQuoteVersion: number;
  readonly status: FinancialMarketOrderStatus;
  readonly feeAmountReserved: string;
  readonly idempotencyKey: string;
  readonly requestDigestSha256: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminalAt: string | null;
  readonly terminalReason: string | null;
}

export interface OrderReservationState {
  readonly reservationPublicId: string;
  readonly version: number;
  readonly orderPublicId: string;
  readonly kind: FinancialMarketReservationKind;
  readonly currencyCode: string | null;
  readonly instrumentPublicId: string | null;
  readonly originalAmount: string;
  readonly remainingAmount: string;
  readonly status: FinancialMarketReservationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminalAt: string | null;
}

export interface OrderReservationAggregate {
  readonly aggregateVersion: number;
  readonly order: OrderReservationOrderState;
  readonly reservation: OrderReservationState;
  readonly availableCashAfterReservation: string;
  readonly availableAssetQuantityAfterReservation: string;
  readonly processedTransitionKeys: readonly string[];
  readonly partialFillSupported: false;
  readonly shortSellingSupported: false;
}

export interface OrderFillCommand {
  readonly expectedAggregateVersion: number;
  readonly transitionKey: string;
  readonly now: string;
  readonly quoteVersion: number;
  readonly executionPrice: string;
  readonly fillQuantity: string;
  readonly quoteObservedAt: string;
  readonly quoteStaleAfter: string;
  readonly gameStatus: "active" | "ended";
  readonly marketPaused: boolean;
  readonly exchangeOpen: boolean;
}

export interface OrderTerminalCommand {
  readonly expectedAggregateVersion: number;
  readonly transitionKey: string;
  readonly now: string;
}

export interface OrderReservationTransitionResult {
  readonly aggregate: OrderReservationAggregate;
  readonly releasedCash: string;
  readonly releasedAssetQuantity: string;
  readonly consumedCash: string;
  readonly consumedAssetQuantity: string;
  readonly feeAmount: string;
  readonly grossValue: string;
}

export function admitOrderWithReservation(
  submission: OrderReservationSubmission,
  context: OrderReservationAdmissionContext,
): OrderReservationAggregate {
  validateAdmission(submission, context);
  const referencePrice = submission.orderType === "limit"
    ? requireLimitPrice(submission.limitPrice)
    : submission.reviewedPrice;
  const grossValue = multiplyMarketDecimals(
    referencePrice,
    submission.quantity,
  );
  const feeAmount = calculateOrderFees(grossValue, context.tradingRules);
  const reservationAmount = submission.side === "buy"
    ? addMarketDecimals(grossValue, feeAmount)
    : submission.quantity;

  if (submission.side === "buy" &&
    compareMarketDecimals(context.availableCash, reservationAmount) < 0) {
    throw new Error("insufficient_available_cash");
  }
  if (submission.side === "sell" &&
    compareMarketDecimals(
      context.availableAssetQuantity,
      reservationAmount,
    ) < 0) {
    throw new Error("insufficient_available_assets");
  }

  const identity = stableOrderIdentity(submission);
  const orderPublicId = `order.${identity}.v1`;
  const reservationKind: FinancialMarketReservationKind =
    submission.side === "buy" ? "cash" : "asset";
  const reservationPublicId =
    `reservation.${identity}.${reservationKind}.v1`;

  return {
    aggregateVersion: 1,
    order: {
      orderPublicId,
      version: 1,
      listingPublicId: submission.listingPublicId,
      instrumentPublicId: submission.instrumentPublicId,
      quotationCurrencyCode: submission.quotationCurrencyCode,
      side: submission.side,
      orderType: submission.orderType,
      originalQuantity: submission.quantity,
      remainingQuantity: submission.quantity,
      filledQuantity: "0",
      limitPrice: submission.limitPrice,
      reviewedPrice: submission.reviewedPrice,
      reviewedQuoteVersion: submission.reviewedQuoteVersion,
      status: "open",
      feeAmountReserved: feeAmount,
      idempotencyKey: submission.idempotencyKey,
      requestDigestSha256: submission.requestDigestSha256,
      createdAt: context.now,
      updatedAt: context.now,
      terminalAt: null,
      terminalReason: null,
    },
    reservation: {
      reservationPublicId,
      version: 1,
      orderPublicId,
      kind: reservationKind,
      currencyCode: reservationKind === "cash"
        ? submission.quotationCurrencyCode
        : null,
      instrumentPublicId: reservationKind === "asset"
        ? submission.instrumentPublicId
        : null,
      originalAmount: reservationAmount,
      remainingAmount: reservationAmount,
      status: "active",
      createdAt: context.now,
      updatedAt: context.now,
      terminalAt: null,
    },
    availableCashAfterReservation: reservationKind === "cash"
      ? subtractMarketDecimals(context.availableCash, reservationAmount)
      : context.availableCash,
    availableAssetQuantityAfterReservation: reservationKind === "asset"
      ? subtractMarketDecimals(
        context.availableAssetQuantity,
        reservationAmount,
      )
      : context.availableAssetQuantity,
    processedTransitionKeys: [],
    partialFillSupported: false,
    shortSellingSupported: false,
  };
}

export function fillOrderAtTick(
  aggregate: OrderReservationAggregate,
  command: OrderFillCommand,
  rules: OrderReservationTradingRules,
): OrderReservationTransitionResult {
  validateTransitionEnvelope(aggregate, command);
  validateRules(rules);
  if (aggregate.order.status !== "open" ||
    aggregate.reservation.status !== "active") {
    throw new Error("order_not_fillable");
  }
  if (command.gameStatus !== "active") throw new Error("game_ended");
  if (command.marketPaused) throw new Error("market_paused");
  if (!command.exchangeOpen) throw new Error("exchange_closed");
  assertIsoTime(command.quoteObservedAt, "quote_observed_at_invalid");
  assertIsoTime(command.quoteStaleAfter, "quote_stale_after_invalid");
  if (Date.parse(command.now) > Date.parse(command.quoteStaleAfter) ||
    Date.parse(command.quoteObservedAt) > Date.parse(command.now)) {
    throw new Error("stale_quote");
  }
  if (command.quoteVersion !== aggregate.order.reviewedQuoteVersion) {
    throw new Error("stale_quote_version");
  }
  assertBoundedDecimal(command.fillQuantity, false);
  assertBoundedDecimal(command.executionPrice, false);
  if (compareMarketDecimals(
    command.fillQuantity,
    aggregate.order.remainingQuantity,
  ) !== 0) {
    throw new Error("partial_fills_disabled");
  }
  assertIncrement(
    command.fillQuantity,
    rules.quantityIncrement,
    "fill_quantity_increment",
  );
  assertIncrement(
    command.executionPrice,
    rules.priceIncrement,
    "fill_price_increment",
  );
  enforceLimit(aggregate.order, command.executionPrice);

  const grossValue = multiplyMarketDecimals(
    command.executionPrice,
    command.fillQuantity,
  );
  const feeAmount = calculateOrderFees(grossValue, rules);
  const consumedAmount = aggregate.reservation.kind === "cash"
    ? addMarketDecimals(grossValue, feeAmount)
    : command.fillQuantity;
  if (compareMarketDecimals(
    consumedAmount,
    aggregate.reservation.remainingAmount,
  ) > 0) {
    throw new Error("reservation_insufficient_for_fill");
  }
  const releasedRemainder = subtractMarketDecimals(
    aggregate.reservation.remainingAmount,
    consumedAmount,
  );
  const next = toTerminalAggregate(
    aggregate,
    command.transitionKey,
    command.now,
    "filled",
    "filled_at_tick",
    "consumed",
    command.fillQuantity,
  );

  return {
    aggregate: next,
    releasedCash: aggregate.reservation.kind === "cash"
      ? releasedRemainder
      : "0",
    releasedAssetQuantity: aggregate.reservation.kind === "asset"
      ? releasedRemainder
      : "0",
    consumedCash: aggregate.reservation.kind === "cash"
      ? consumedAmount
      : "0",
    consumedAssetQuantity: aggregate.reservation.kind === "asset"
      ? consumedAmount
      : "0",
    feeAmount,
    grossValue,
  };
}

export function cancelOrder(
  aggregate: OrderReservationAggregate,
  command: OrderTerminalCommand,
): OrderReservationTransitionResult {
  return releaseOrder(aggregate, command, "cancelled", "cancelled_by_player");
}

export function expireOrder(
  aggregate: OrderReservationAggregate,
  command: OrderTerminalCommand,
): OrderReservationTransitionResult {
  return releaseOrder(aggregate, command, "expired", "order_expired");
}

export function calculateOrderFees(
  grossValue: string,
  rules: OrderReservationTradingRules,
): string {
  validateRules(rules);
  assertBoundedDecimal(grossValue, true);
  if (compareMarketDecimals(grossValue, "0") < 0) {
    throw new Error("gross_value_negative");
  }
  return addMarketDecimals(
    multiplyMarketDecimals(grossValue, rules.transactionFeeRate),
    multiplyMarketDecimals(grossValue, rules.exchangeFeeRate),
    rules.fixedFee,
  );
}

function validateAdmission(
  submission: OrderReservationSubmission,
  context: OrderReservationAdmissionContext,
): void {
  validateRules(context.tradingRules);
  for (const [label, value] of [
    ["gamePublicId", submission.gamePublicId],
    ["playerPublicId", submission.playerPublicId],
    ["listingPublicId", submission.listingPublicId],
    ["instrumentPublicId", submission.instrumentPublicId],
    ["idempotencyKey", submission.idempotencyKey],
  ] as const) {
    if (!value.trim() || value.length > 160) {
      throw new Error(`${label}_invalid`);
    }
  }
  if (!/^[A-Z]{3,16}$/.test(submission.quotationCurrencyCode)) {
    throw new Error("quotation_currency_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(submission.requestDigestSha256)) {
    throw new Error("request_digest_invalid");
  }
  if (!Number.isInteger(submission.reviewedQuoteVersion) ||
    submission.reviewedQuoteVersion < 1) {
    throw new Error("quote_version_invalid");
  }
  if (context.gameStatus !== "active") throw new Error("game_ended");
  if (context.marketPaused) throw new Error("market_paused");
  if (!context.exchangeOpen) throw new Error("exchange_closed");
  if (!context.instrumentActive || !context.listingActive) {
    throw new Error("inactive_instrument_or_listing");
  }
  assertIsoTime(context.now, "admission_time_invalid");
  assertIsoTime(submission.reviewedAt, "reviewed_at_invalid");
  assertIsoTime(submission.staleAfter, "stale_after_invalid");
  if (Date.parse(context.now) > Date.parse(submission.staleAfter) ||
    Date.parse(submission.reviewedAt) > Date.parse(context.now)) {
    throw new Error("stale_reviewed_quote");
  }
  if (submission.expiresAt !== null) {
    assertIsoTime(submission.expiresAt, "order_expiry_invalid");
    if (Date.parse(submission.expiresAt) <= Date.parse(context.now)) {
      throw new Error("order_expiry_invalid");
    }
  }

  assertBoundedDecimal(submission.quantity, false);
  assertBoundedDecimal(submission.reviewedPrice, false);
  assertBoundedDecimal(context.availableCash, true);
  assertBoundedDecimal(context.availableAssetQuantity, true);
  if (compareMarketDecimals(
    submission.quantity,
    context.tradingRules.minimumOrderQuantity,
  ) < 0) {
    throw new Error("quantity_below_minimum");
  }
  assertIncrement(
    submission.quantity,
    context.tradingRules.quantityIncrement,
    "quantity_increment_invalid",
  );
  assertIncrement(
    submission.reviewedPrice,
    context.tradingRules.priceIncrement,
    "reviewed_price_increment_invalid",
  );
  if (submission.orderType === "limit") {
    const limit = requireLimitPrice(submission.limitPrice);
    assertBoundedDecimal(limit, false);
    assertIncrement(
      limit,
      context.tradingRules.priceIncrement,
      "limit_price_increment_invalid",
    );
  } else if (submission.limitPrice !== null) {
    throw new Error("market_order_limit_price_not_allowed");
  }
}

function validateRules(rules: OrderReservationTradingRules): void {
  if (rules.shortSellingSupported !== false ||
    rules.partialFillSupported !== false) {
    throw new Error("unsupported_trading_feature_enabled");
  }
  for (const value of [
    rules.minimumOrderQuantity,
    rules.quantityIncrement,
    rules.priceIncrement,
  ]) {
    assertBoundedDecimal(value, false);
  }
  assertBoundedDecimal(rules.fixedFee, true);
  if (!Number.isFinite(rules.transactionFeeRate) ||
    rules.transactionFeeRate < 0 || rules.transactionFeeRate > 0.2 ||
    !Number.isFinite(rules.exchangeFeeRate) ||
    rules.exchangeFeeRate < 0 || rules.exchangeFeeRate > 0.2) {
    throw new Error("fee_policy_invalid");
  }
}

function validateTransitionEnvelope(
  aggregate: OrderReservationAggregate,
  command: Pick<
    OrderFillCommand,
    "expectedAggregateVersion" | "transitionKey" | "now"
  >,
): void {
  if (command.expectedAggregateVersion !== aggregate.aggregateVersion) {
    throw new Error("stale_aggregate_version");
  }
  if (!command.transitionKey.trim() || command.transitionKey.length > 160) {
    throw new Error("transition_key_invalid");
  }
  if (aggregate.processedTransitionKeys.includes(command.transitionKey)) {
    throw new Error("duplicate_transition");
  }
  assertIsoTime(command.now, "transition_time_invalid");
}

function releaseOrder(
  aggregate: OrderReservationAggregate,
  command: OrderTerminalCommand,
  status: "cancelled" | "expired",
  reason: string,
): OrderReservationTransitionResult {
  validateTransitionEnvelope(aggregate, command);
  if (aggregate.order.status !== "open" ||
    aggregate.reservation.status !== "active") {
    throw new Error(
      status === "cancelled" ? "order_not_cancellable" : "order_not_expirable",
    );
  }
  const release = aggregate.reservation.remainingAmount;
  const next = toTerminalAggregate(
    aggregate,
    command.transitionKey,
    command.now,
    status,
    reason,
    "released",
    "0",
  );
  return {
    aggregate: next,
    releasedCash: aggregate.reservation.kind === "cash" ? release : "0",
    releasedAssetQuantity: aggregate.reservation.kind === "asset"
      ? release
      : "0",
    consumedCash: "0",
    consumedAssetQuantity: "0",
    feeAmount: "0",
    grossValue: "0",
  };
}

function toTerminalAggregate(
  aggregate: OrderReservationAggregate,
  transitionKey: string,
  now: string,
  orderStatus: Extract<
    FinancialMarketOrderStatus,
    "filled" | "cancelled" | "expired"
  >,
  reason: string,
  reservationStatus: Extract<
    FinancialMarketReservationStatus,
    "consumed" | "released"
  >,
  filledQuantity: string,
): OrderReservationAggregate {
  return {
    ...aggregate,
    aggregateVersion: aggregate.aggregateVersion + 1,
    order: {
      ...aggregate.order,
      version: aggregate.order.version + 1,
      remainingQuantity: "0",
      filledQuantity,
      status: orderStatus,
      updatedAt: now,
      terminalAt: now,
      terminalReason: reason,
    },
    reservation: {
      ...aggregate.reservation,
      version: aggregate.reservation.version + 1,
      remainingAmount: "0",
      status: reservationStatus,
      updatedAt: now,
      terminalAt: now,
    },
    processedTransitionKeys: [
      ...aggregate.processedTransitionKeys,
      transitionKey,
    ].sort(),
  };
}

function enforceLimit(
  order: OrderReservationOrderState,
  executionPrice: string,
): void {
  if (order.orderType !== "limit") return;
  const limit = requireLimitPrice(order.limitPrice);
  if (order.side === "buy" &&
    compareMarketDecimals(executionPrice, limit) > 0) {
    throw new Error("buy_limit_not_satisfied");
  }
  if (order.side === "sell" &&
    compareMarketDecimals(executionPrice, limit) < 0) {
    throw new Error("sell_limit_not_satisfied");
  }
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

function assertBoundedDecimal(value: string, allowZero: boolean): void {
  toMicrounits(value, allowZero);
}

function toMicrounits(value: string, allowZero: boolean): bigint {
  const text = String(value).trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(text)) {
    throw new Error("amount_precision_invalid");
  }
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole) * 1_000_000n +
    BigInt(fraction.padEnd(6, "0"));
  if (units < 0n || (!allowZero && units === 0n)) {
    throw new Error("amount_value_invalid");
  }
  return units;
}

function requireLimitPrice(value: string | null): string {
  if (value === null) throw new Error("limit_price_required");
  assertBoundedDecimal(value, false);
  return value;
}

function assertIsoTime(value: string, errorCode: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(errorCode);
}

function stableOrderIdentity(
  submission: OrderReservationSubmission,
): string {
  const input = [
    submission.gamePublicId,
    submission.playerPublicId,
    submission.listingPublicId,
    submission.side,
    submission.idempotencyKey,
    submission.requestDigestSha256,
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}
