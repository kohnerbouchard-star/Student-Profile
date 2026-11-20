import { isActive, rematch } from "./priceTimeOrderBookMatching.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "../calculations/decimalMath.ts";

export type ActiveBookOrderStatus = "open" | "partially_filled";
export type TerminalBookOrderStatus = "filled" | "cancelled" | "replaced";
export type BookOrderStatus = ActiveBookOrderStatus | TerminalBookOrderStatus;

export interface PriceTimeOrderBookPolicy {
  readonly quantityIncrement: string;
  readonly priceIncrement: string;
  readonly partialFillSupported: true;
  readonly shortSellingSupported: false;
  readonly settlementDomain: "financial_instrument";
  readonly marketplacePhysicalItemSettlementSupported: false;
}

export interface PriceTimeBookOrder {
  readonly orderPublicId: string;
  readonly reservationPublicId: string;
  readonly playerPublicId: string;
  readonly side: "buy" | "sell";
  readonly originalQuantity: string;
  readonly remainingQuantity: string;
  readonly filledQuantity: string;
  readonly limitPrice: string;
  readonly submittedAt: string;
  readonly prioritySequence: number;
  readonly version: number;
  readonly status: BookOrderStatus;
  readonly terminalAt: string | null;
  readonly replacedByOrderPublicId: string | null;
}

export interface PriceTimeBookTrade {
  readonly tradePublicId: string;
  readonly sequence: number;
  readonly buyOrderPublicId: string;
  readonly sellOrderPublicId: string;
  readonly buyerPlayerPublicId: string;
  readonly sellerPlayerPublicId: string;
  readonly quantity: string;
  readonly executionPrice: string;
  readonly grossValue: string;
  readonly makerOrderPublicId: string;
  readonly takerOrderPublicId: string;
  readonly occurredAt: string;
  readonly settlementDomain: "financial_instrument";
}

export interface PriceTimeOrderBookState {
  readonly bookPublicId: string;
  readonly listingPublicId: string;
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly version: number;
  readonly observedAt: string;
  readonly orders: readonly PriceTimeBookOrder[];
  readonly trades: readonly PriceTimeBookTrade[];
  readonly processedTransitionKeys: readonly string[];
  readonly blockedSelfTradePairKeys: readonly string[];
  readonly executableCrossRemaining: false;
  readonly deterministicDigest: string;
  readonly partialFillSupported: true;
  readonly shortSellingSupported: false;
  readonly settlementDomain: "financial_instrument";
  readonly marketplacePhysicalItemSettlementSupported: false;
}

export interface CreatePriceTimeOrderBookInput {
  readonly bookPublicId: string;
  readonly listingPublicId: string;
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly observedAt: string;
  readonly orders: readonly PriceTimeBookOrder[];
  readonly policy: PriceTimeOrderBookPolicy;
}

export interface ReplaceBookOrderCommand {
  readonly expectedBookVersion: number;
  readonly transitionKey: string;
  readonly now: string;
  readonly orderPublicId: string;
  readonly replacementOrderPublicId: string;
  readonly replacementReservationPublicId: string;
  readonly replacementQuantity: string;
  readonly replacementLimitPrice: string;
  readonly replacementPrioritySequence: number;
}

export interface CancelBookOrderCommand {
  readonly expectedBookVersion: number;
  readonly transitionKey: string;
  readonly now: string;
  readonly orderPublicId: string;
}

export interface ReservationDelta {
  readonly releasedCash: string;
  readonly additionalCashRequired: string;
  readonly releasedAssetQuantity: string;
  readonly additionalAssetQuantityRequired: string;
}

export interface PriceTimeBookTransitionResult {
  readonly state: PriceTimeOrderBookState;
  readonly reservationDelta: ReservationDelta;
}

export function createPriceTimeOrderBook(
  input: CreatePriceTimeOrderBookInput,
): PriceTimeOrderBookState {
  validatePolicy(input.policy);
  validateIdentity(input.bookPublicId, "order_book_id_invalid");
  validateIdentity(input.listingPublicId, "order_book_listing_invalid");
  validateIdentity(input.instrumentPublicId, "order_book_instrument_invalid");
  if (!/^[A-Z]{3,16}$/.test(input.quotationCurrencyCode)) {
    throw new Error("order_book_currency_invalid");
  }
  assertIsoTime(input.observedAt, "order_book_time_invalid");
  const seenOrders = new Set<string>();
  const seenReservations = new Set<string>();
  const orders = input.orders.map((order) => {
    validateOrder(order, input.observedAt, input.policy);
    if (seenOrders.has(order.orderPublicId)) {
      throw new Error("order_book_duplicate_order_id");
    }
    if (seenReservations.has(order.reservationPublicId)) {
      throw new Error("order_book_duplicate_reservation_id");
    }
    seenOrders.add(order.orderPublicId);
    seenReservations.add(order.reservationPublicId);
    return { ...order };
  });
  return rematch({
    bookPublicId: input.bookPublicId,
    listingPublicId: input.listingPublicId,
    instrumentPublicId: input.instrumentPublicId,
    quotationCurrencyCode: input.quotationCurrencyCode,
    version: 1,
    observedAt: input.observedAt,
    orders,
    trades: [],
    processedTransitionKeys: [],
    blockedSelfTradePairKeys: [],
    executableCrossRemaining: false,
    deterministicDigest: "",
    partialFillSupported: true,
    shortSellingSupported: false,
    settlementDomain: "financial_instrument",
    marketplacePhysicalItemSettlementSupported: false,
  });
}

export function replacePriceTimeBookOrder(
  state: PriceTimeOrderBookState,
  command: ReplaceBookOrderCommand,
  policy: PriceTimeOrderBookPolicy,
): PriceTimeBookTransitionResult {
  validateTransition(
    state,
    command.expectedBookVersion,
    command.transitionKey,
    command.now,
  );
  validatePolicy(policy);
  validateIdentity(
    command.replacementOrderPublicId,
    "replacement_order_id_invalid",
  );
  validateIdentity(
    command.replacementReservationPublicId,
    "replacement_reservation_id_invalid",
  );
  assertIncrement(
    command.replacementQuantity,
    policy.quantityIncrement,
    "replacement_quantity_increment_invalid",
  );
  assertIncrement(
    command.replacementLimitPrice,
    policy.priceIncrement,
    "replacement_price_increment_invalid",
  );
  if (
    !Number.isInteger(command.replacementPrioritySequence) ||
    command.replacementPrioritySequence < 1
  ) {
    throw new Error("replacement_priority_sequence_invalid");
  }
  if (
    state.orders.some((order) =>
      order.orderPublicId === command.replacementOrderPublicId
    )
  ) {
    throw new Error("replacement_order_id_conflict");
  }
  if (
    state.orders.some((order) =>
      order.reservationPublicId === command.replacementReservationPublicId
    )
  ) {
    throw new Error("replacement_reservation_id_conflict");
  }
  const target = requireActiveOrder(
    state,
    command.orderPublicId,
    "order_not_replaceable",
  );
  const oldReservation = reservationRequirement(
    target.remainingQuantity,
    target.limitPrice,
    target.side,
  );
  const newReservation = reservationRequirement(
    command.replacementQuantity,
    command.replacementLimitPrice,
    target.side,
  );
  const delta = reservationDelta(target.side, oldReservation, newReservation);
  const replacement: PriceTimeBookOrder = {
    orderPublicId: command.replacementOrderPublicId,
    reservationPublicId: command.replacementReservationPublicId,
    playerPublicId: target.playerPublicId,
    side: target.side,
    originalQuantity: command.replacementQuantity,
    remainingQuantity: command.replacementQuantity,
    filledQuantity: "0",
    limitPrice: command.replacementLimitPrice,
    submittedAt: command.now,
    prioritySequence: command.replacementPrioritySequence,
    version: 1,
    status: "open",
    terminalAt: null,
    replacedByOrderPublicId: null,
  };
  const nextOrders = state.orders.map((order) =>
    order.orderPublicId === target.orderPublicId
      ? {
        ...order,
        version: order.version + 1,
        status: "replaced" as const,
        terminalAt: command.now,
        replacedByOrderPublicId: replacement.orderPublicId,
      }
      : order
  ).concat(replacement);
  return {
    state: rematch({
      ...state,
      version: state.version + 1,
      observedAt: command.now,
      orders: nextOrders,
      processedTransitionKeys: [
        ...state.processedTransitionKeys,
        command.transitionKey,
      ].sort(),
    }),
    reservationDelta: delta,
  };
}

export function cancelPriceTimeBookOrder(
  state: PriceTimeOrderBookState,
  command: CancelBookOrderCommand,
): PriceTimeBookTransitionResult {
  validateTransition(
    state,
    command.expectedBookVersion,
    command.transitionKey,
    command.now,
  );
  const target = requireActiveOrder(
    state,
    command.orderPublicId,
    "order_not_cancellable",
  );
  const remainingReservation = reservationRequirement(
    target.remainingQuantity,
    target.limitPrice,
    target.side,
  );
  const delta: ReservationDelta = target.side === "buy"
    ? {
      releasedCash: remainingReservation,
      additionalCashRequired: "0",
      releasedAssetQuantity: "0",
      additionalAssetQuantityRequired: "0",
    }
    : {
      releasedCash: "0",
      additionalCashRequired: "0",
      releasedAssetQuantity: remainingReservation,
      additionalAssetQuantityRequired: "0",
    };
  const nextOrders = state.orders.map((order) =>
    order.orderPublicId === target.orderPublicId
      ? {
        ...order,
        version: order.version + 1,
        status: "cancelled" as const,
        terminalAt: command.now,
      }
      : order
  );
  return {
    state: rematch({
      ...state,
      version: state.version + 1,
      observedAt: command.now,
      orders: nextOrders,
      processedTransitionKeys: [
        ...state.processedTransitionKeys,
        command.transitionKey,
      ].sort(),
    }),
    reservationDelta: delta,
  };
}

function reservationRequirement(
  quantity: string,
  price: string,
  side: "buy" | "sell",
): string {
  return side === "buy" ? multiplyMarketDecimals(quantity, price) : quantity;
}

function reservationDelta(
  side: "buy" | "sell",
  oldRequirement: string,
  newRequirement: string,
): ReservationDelta {
  const comparison = compareMarketDecimals(newRequirement, oldRequirement);
  const released = comparison < 0
    ? subtractMarketDecimals(oldRequirement, newRequirement)
    : "0";
  const additional = comparison > 0
    ? subtractMarketDecimals(newRequirement, oldRequirement)
    : "0";
  return side === "buy"
    ? {
      releasedCash: released,
      additionalCashRequired: additional,
      releasedAssetQuantity: "0",
      additionalAssetQuantityRequired: "0",
    }
    : {
      releasedCash: "0",
      additionalCashRequired: "0",
      releasedAssetQuantity: released,
      additionalAssetQuantityRequired: additional,
    };
}

function requireActiveOrder(
  state: PriceTimeOrderBookState,
  orderPublicId: string,
  errorCode: string,
): PriceTimeBookOrder {
  const order = state.orders.find((candidate) =>
    candidate.orderPublicId === orderPublicId
  );
  if (!order || !isActive(order)) throw new Error(errorCode);
  return order;
}

function validateTransition(
  state: PriceTimeOrderBookState,
  expectedVersion: number,
  transitionKey: string,
  now: string,
): void {
  if (expectedVersion !== state.version) {
    throw new Error("order_book_stale_version");
  }
  validateIdentity(transitionKey, "order_book_transition_key_invalid");
  if (state.processedTransitionKeys.includes(transitionKey)) {
    throw new Error("order_book_duplicate_transition");
  }
  assertIsoTime(now, "order_book_transition_time_invalid");
  if (Date.parse(now) < Date.parse(state.observedAt)) {
    throw new Error("order_book_non_monotonic_time");
  }
}

function validatePolicy(policy: PriceTimeOrderBookPolicy): void {
  if (
    policy.partialFillSupported !== true ||
    policy.shortSellingSupported !== false
  ) {
    throw new Error("order_book_policy_invalid");
  }
  if (
    policy.settlementDomain !== "financial_instrument" ||
    policy.marketplacePhysicalItemSettlementSupported !== false
  ) {
    throw new Error("order_book_settlement_domain_invalid");
  }
  toMicrounits(policy.quantityIncrement, false);
  toMicrounits(policy.priceIncrement, false);
}

function validateOrder(
  order: PriceTimeBookOrder,
  observedAt: string,
  policy: PriceTimeOrderBookPolicy,
): void {
  validateIdentity(order.orderPublicId, "order_id_invalid");
  validateIdentity(order.reservationPublicId, "reservation_id_invalid");
  validateIdentity(order.playerPublicId, "player_id_invalid");
  assertIncrement(
    order.originalQuantity,
    policy.quantityIncrement,
    "order_quantity_increment_invalid",
  );
  assertIncrement(
    order.remainingQuantity,
    policy.quantityIncrement,
    "order_remaining_increment_invalid",
  );
  assertIncrement(
    order.filledQuantity,
    policy.quantityIncrement,
    "order_filled_increment_invalid",
    true,
  );
  assertIncrement(
    order.limitPrice,
    policy.priceIncrement,
    "order_price_increment_invalid",
  );
  if (
    addMarketDecimals(order.remainingQuantity, order.filledQuantity) !==
      order.originalQuantity
  ) {
    throw new Error("order_quantity_identity_invalid");
  }
  if (
    !Number.isInteger(order.prioritySequence) ||
    order.prioritySequence < 1 ||
    !Number.isInteger(order.version) ||
    order.version < 1
  ) {
    throw new Error("order_version_or_sequence_invalid");
  }
  assertIsoTime(order.submittedAt, "order_submitted_at_invalid");
  if (Date.parse(order.submittedAt) > Date.parse(observedAt)) {
    throw new Error("order_future_submission");
  }
  if (order.status !== "open" && order.status !== "partially_filled") {
    throw new Error("initial_order_must_be_active");
  }
  if (order.terminalAt !== null || order.replacedByOrderPublicId !== null) {
    throw new Error("initial_order_terminal_metadata_invalid");
  }
}

function assertIncrement(
  value: string,
  increment: string,
  errorCode: string,
  allowZero = false,
): void {
  const units = toMicrounits(value, allowZero);
  const incrementUnits = toMicrounits(increment, false);
  if (units % incrementUnits !== 0n) throw new Error(errorCode);
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

function validateIdentity(value: string, errorCode: string): void {
  if (!value.trim() || value.length > 180) throw new Error(errorCode);
}

function assertIsoTime(value: string, errorCode: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(errorCode);
}
