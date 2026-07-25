import type {
  FinancialMarketSettlementConvention,
} from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "../calculations/decimalMath.ts";

export type FinancialInstrumentSettlementStatus =
  | "pending_reservations"
  | "ready_for_delivery"
  | "settled"
  | "failed";

export type FinancialInstrumentSettlementLegStatus =
  | "pending"
  | "active"
  | "consumed"
  | "released";

export interface FinancialInstrumentSettlementInstruction {
  readonly settlementPublicId: string;
  readonly tradePublicId: string;
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
  readonly buyerFeeAmount: string;
  readonly sellerFeeAmount: string;
  readonly tradeExecutedAt: string;
  readonly settlementDueAt: string;
  readonly settlementConvention: FinancialMarketSettlementConvention;
  readonly idempotencyKey: string;
  readonly inputDigestSha256: string;
  readonly settlementDomain: "financial_instrument";
  readonly marketplacePhysicalItemSettlementSupported: false;
  readonly partialSettlementSupported: false;
}

export interface FinancialInstrumentSettlementAggregate {
  readonly aggregateVersion: number;
  readonly instruction: FinancialInstrumentSettlementInstruction;
  readonly status: FinancialInstrumentSettlementStatus;
  readonly cashLeg: {
    readonly reservationPublicId: string | null;
    readonly amount: string;
    readonly status: FinancialInstrumentSettlementLegStatus;
  };
  readonly assetLeg: {
    readonly reservationPublicId: string | null;
    readonly quantity: string;
    readonly status: FinancialInstrumentSettlementLegStatus;
  };
  readonly buyerCashRequirement: string;
  readonly sellerCashProceeds: string;
  readonly feesCollected: string;
  readonly processedTransitionKeys: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminalAt: string | null;
  readonly terminalReason: string | null;
  readonly deliveryVersusPaymentRequired: true;
  readonly settlementDomain: "financial_instrument";
  readonly marketplacePhysicalItemSettlementSupported: false;
  readonly partialSettlementSupported: false;
}

export interface FinancialInstrumentReservationConfirmation {
  readonly expectedAggregateVersion: number;
  readonly transitionKey: string;
  readonly reservationPublicId: string;
  readonly amount: string;
  readonly now: string;
}

export interface FinancialInstrumentSettlementCommand {
  readonly expectedAggregateVersion: number;
  readonly transitionKey: string;
  readonly now: string;
}

export interface FinancialInstrumentSettlementFailureCommand
  extends FinancialInstrumentSettlementCommand {
  readonly reason: string;
}

export interface FinancialInstrumentSettlementEffects {
  readonly buyerCashDebit: string;
  readonly sellerCashCredit: string;
  readonly sellerAssetDebit: string;
  readonly buyerAssetCredit: string;
  readonly feeCredit: string;
  readonly releasedCash: string;
  readonly releasedAssetQuantity: string;
  readonly settlementDomain: "financial_instrument";
  readonly marketplacePhysicalItemTransfer: false;
}

export interface FinancialInstrumentSettlementResult {
  readonly aggregate: FinancialInstrumentSettlementAggregate;
  readonly effects: FinancialInstrumentSettlementEffects;
}

export function admitFinancialInstrumentSettlement(
  instruction: FinancialInstrumentSettlementInstruction,
): FinancialInstrumentSettlementAggregate {
  validateInstruction(instruction);
  const buyerCashRequirement = addMarketDecimals(
    instruction.grossValue,
    instruction.buyerFeeAmount,
  );
  const sellerCashProceeds = subtractMarketDecimals(
    instruction.grossValue,
    instruction.sellerFeeAmount,
  );
  if (compareMarketDecimals(sellerCashProceeds, "0") < 0) {
    throw new Error("settlement_seller_fee_exceeds_gross_value");
  }
  return {
    aggregateVersion: 1,
    instruction,
    status: "pending_reservations",
    cashLeg: {
      reservationPublicId: null,
      amount: buyerCashRequirement,
      status: "pending",
    },
    assetLeg: {
      reservationPublicId: null,
      quantity: instruction.quantity,
      status: "pending",
    },
    buyerCashRequirement,
    sellerCashProceeds,
    feesCollected: addMarketDecimals(
      instruction.buyerFeeAmount,
      instruction.sellerFeeAmount,
    ),
    processedTransitionKeys: [],
    createdAt: instruction.tradeExecutedAt,
    updatedAt: instruction.tradeExecutedAt,
    terminalAt: null,
    terminalReason: null,
    deliveryVersusPaymentRequired: true,
    settlementDomain: "financial_instrument",
    marketplacePhysicalItemSettlementSupported: false,
    partialSettlementSupported: false,
  };
}

export function confirmSettlementCashReservation(
  aggregate: FinancialInstrumentSettlementAggregate,
  command: FinancialInstrumentReservationConfirmation,
): FinancialInstrumentSettlementAggregate {
  validateTransition(aggregate, command);
  if (aggregate.status !== "pending_reservations") {
    throw new Error("settlement_cash_reservation_not_allowed");
  }
  if (aggregate.cashLeg.status !== "pending") {
    throw new Error("settlement_cash_reservation_already_confirmed");
  }
  validateReservationIdentity(command.reservationPublicId);
  assertExactAmount(
    command.amount,
    aggregate.buyerCashRequirement,
    "settlement_cash_reservation_amount_mismatch",
  );
  const cashLeg = {
    reservationPublicId: command.reservationPublicId,
    amount: command.amount,
    status: "active" as const,
  };
  return withReservationTransition(
    aggregate,
    command,
    cashLeg,
    aggregate.assetLeg,
  );
}

export function confirmSettlementAssetReservation(
  aggregate: FinancialInstrumentSettlementAggregate,
  command: FinancialInstrumentReservationConfirmation,
): FinancialInstrumentSettlementAggregate {
  validateTransition(aggregate, command);
  if (aggregate.status !== "pending_reservations") {
    throw new Error("settlement_asset_reservation_not_allowed");
  }
  if (aggregate.assetLeg.status !== "pending") {
    throw new Error("settlement_asset_reservation_already_confirmed");
  }
  validateReservationIdentity(command.reservationPublicId);
  assertExactAmount(
    command.amount,
    aggregate.instruction.quantity,
    "settlement_asset_reservation_quantity_mismatch",
  );
  const assetLeg = {
    reservationPublicId: command.reservationPublicId,
    quantity: command.amount,
    status: "active" as const,
  };
  return withReservationTransition(
    aggregate,
    command,
    aggregate.cashLeg,
    assetLeg,
  );
}

export function settleFinancialInstrumentDeliveryVersusPayment(
  aggregate: FinancialInstrumentSettlementAggregate,
  command: FinancialInstrumentSettlementCommand,
): FinancialInstrumentSettlementResult {
  validateTransition(aggregate, command);
  if (
    aggregate.status !== "ready_for_delivery" ||
    aggregate.cashLeg.status !== "active" ||
    aggregate.assetLeg.status !== "active"
  ) {
    throw new Error("settlement_not_ready_for_delivery");
  }
  if (
    Date.parse(command.now) <
      Date.parse(aggregate.instruction.settlementDueAt)
  ) {
    throw new Error("settlement_due_time_not_reached");
  }
  const next: FinancialInstrumentSettlementAggregate = {
    ...aggregate,
    aggregateVersion: aggregate.aggregateVersion + 1,
    status: "settled",
    cashLeg: {
      ...aggregate.cashLeg,
      status: "consumed",
    },
    assetLeg: {
      ...aggregate.assetLeg,
      status: "consumed",
    },
    processedTransitionKeys: addTransitionKey(
      aggregate.processedTransitionKeys,
      command.transitionKey,
    ),
    updatedAt: command.now,
    terminalAt: command.now,
    terminalReason: "delivery_versus_payment_completed",
  };
  return {
    aggregate: next,
    effects: {
      buyerCashDebit: aggregate.buyerCashRequirement,
      sellerCashCredit: aggregate.sellerCashProceeds,
      sellerAssetDebit: aggregate.instruction.quantity,
      buyerAssetCredit: aggregate.instruction.quantity,
      feeCredit: aggregate.feesCollected,
      releasedCash: "0",
      releasedAssetQuantity: "0",
      settlementDomain: "financial_instrument",
      marketplacePhysicalItemTransfer: false,
    },
  };
}

export function failFinancialInstrumentSettlement(
  aggregate: FinancialInstrumentSettlementAggregate,
  command: FinancialInstrumentSettlementFailureCommand,
): FinancialInstrumentSettlementResult {
  validateTransition(aggregate, command);
  if (aggregate.status === "settled" || aggregate.status === "failed") {
    throw new Error("settlement_terminal_state");
  }
  const reason = command.reason.trim();
  if (!reason || reason.length > 160) {
    throw new Error("settlement_failure_reason_invalid");
  }
  const releasedCash = aggregate.cashLeg.status === "active"
    ? aggregate.cashLeg.amount
    : "0";
  const releasedAssetQuantity = aggregate.assetLeg.status === "active"
    ? aggregate.assetLeg.quantity
    : "0";
  const next: FinancialInstrumentSettlementAggregate = {
    ...aggregate,
    aggregateVersion: aggregate.aggregateVersion + 1,
    status: "failed",
    cashLeg: {
      ...aggregate.cashLeg,
      status: aggregate.cashLeg.status === "active"
        ? "released"
        : aggregate.cashLeg.status,
    },
    assetLeg: {
      ...aggregate.assetLeg,
      status: aggregate.assetLeg.status === "active"
        ? "released"
        : aggregate.assetLeg.status,
    },
    processedTransitionKeys: addTransitionKey(
      aggregate.processedTransitionKeys,
      command.transitionKey,
    ),
    updatedAt: command.now,
    terminalAt: command.now,
    terminalReason: reason,
  };
  return {
    aggregate: next,
    effects: {
      buyerCashDebit: "0",
      sellerCashCredit: "0",
      sellerAssetDebit: "0",
      buyerAssetCredit: "0",
      feeCredit: "0",
      releasedCash,
      releasedAssetQuantity,
      settlementDomain: "financial_instrument",
      marketplacePhysicalItemTransfer: false,
    },
  };
}

function withReservationTransition(
  aggregate: FinancialInstrumentSettlementAggregate,
  command: FinancialInstrumentReservationConfirmation,
  cashLeg: FinancialInstrumentSettlementAggregate["cashLeg"],
  assetLeg: FinancialInstrumentSettlementAggregate["assetLeg"],
): FinancialInstrumentSettlementAggregate {
  const ready = cashLeg.status === "active" && assetLeg.status === "active";
  return {
    ...aggregate,
    aggregateVersion: aggregate.aggregateVersion + 1,
    status: ready ? "ready_for_delivery" : "pending_reservations",
    cashLeg,
    assetLeg,
    processedTransitionKeys: addTransitionKey(
      aggregate.processedTransitionKeys,
      command.transitionKey,
    ),
    updatedAt: command.now,
  };
}

function validateInstruction(
  instruction: FinancialInstrumentSettlementInstruction,
): void {
  for (const value of [
    instruction.settlementPublicId,
    instruction.tradePublicId,
    instruction.buyOrderPublicId,
    instruction.sellOrderPublicId,
    instruction.buyerPlayerPublicId,
    instruction.sellerPlayerPublicId,
    instruction.listingPublicId,
    instruction.instrumentPublicId,
    instruction.idempotencyKey,
  ]) {
    if (!value.trim() || value.length > 160) {
      throw new Error("settlement_identity_invalid");
    }
  }
  if (instruction.buyerPlayerPublicId === instruction.sellerPlayerPublicId) {
    throw new Error("settlement_self_trade_prohibited");
  }
  if (instruction.buyOrderPublicId === instruction.sellOrderPublicId) {
    throw new Error("settlement_order_identity_conflict");
  }
  if (!/^[A-Z]{3,16}$/.test(instruction.quotationCurrencyCode)) {
    throw new Error("settlement_currency_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(instruction.inputDigestSha256)) {
    throw new Error("settlement_input_digest_invalid");
  }
  if (
    instruction.settlementDomain !== "financial_instrument" ||
    instruction.marketplacePhysicalItemSettlementSupported !== false
  ) {
    throw new Error("settlement_domain_invalid");
  }
  if (instruction.partialSettlementSupported !== false) {
    throw new Error("settlement_partial_settlement_must_remain_disabled");
  }
  if (!["T0", "T1", "T2"].includes(instruction.settlementConvention)) {
    throw new Error("settlement_convention_invalid");
  }
  assertIsoTime(
    instruction.tradeExecutedAt,
    "settlement_trade_time_invalid",
  );
  assertIsoTime(
    instruction.settlementDueAt,
    "settlement_due_time_invalid",
  );
  if (
    Date.parse(instruction.settlementDueAt) <
      Date.parse(instruction.tradeExecutedAt)
  ) {
    throw new Error("settlement_due_before_trade");
  }
  for (const value of [
    instruction.quantity,
    instruction.executionPrice,
    instruction.grossValue,
  ]) {
    assertNonNegativeDecimal(value, false);
  }
  assertNonNegativeDecimal(instruction.buyerFeeAmount, true);
  assertNonNegativeDecimal(instruction.sellerFeeAmount, true);
  const expectedGross = multiplyMarketDecimals(
    instruction.quantity,
    instruction.executionPrice,
  );
  assertExactAmount(
    instruction.grossValue,
    expectedGross,
    "settlement_gross_value_mismatch",
  );
}

function validateTransition(
  aggregate: FinancialInstrumentSettlementAggregate,
  command: FinancialInstrumentSettlementCommand,
): void {
  if (command.expectedAggregateVersion !== aggregate.aggregateVersion) {
    throw new Error("settlement_stale_aggregate_version");
  }
  if (!command.transitionKey.trim() || command.transitionKey.length > 160) {
    throw new Error("settlement_transition_key_invalid");
  }
  if (aggregate.processedTransitionKeys.includes(command.transitionKey)) {
    throw new Error("settlement_duplicate_transition");
  }
  assertIsoTime(command.now, "settlement_transition_time_invalid");
  if (Date.parse(command.now) < Date.parse(aggregate.updatedAt)) {
    throw new Error("settlement_non_monotonic_transition_time");
  }
  if (
    aggregate.settlementDomain !== "financial_instrument" ||
    aggregate.marketplacePhysicalItemSettlementSupported !== false
  ) {
    throw new Error("settlement_domain_invalid");
  }
}

function validateReservationIdentity(value: string): void {
  if (!value.trim() || value.length > 160) {
    throw new Error("settlement_reservation_identity_invalid");
  }
}

function assertExactAmount(
  actual: string,
  expected: string,
  errorCode: string,
): void {
  assertNonNegativeDecimal(actual, true);
  if (compareMarketDecimals(actual, expected) !== 0) {
    throw new Error(errorCode);
  }
}

function assertNonNegativeDecimal(value: string, allowZero: boolean): void {
  const text = String(value).trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(text)) {
    throw new Error("settlement_amount_precision_invalid");
  }
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole) * 1_000_000n +
    BigInt(fraction.padEnd(6, "0"));
  if (!allowZero && units === 0n) {
    throw new Error("settlement_amount_value_invalid");
  }
}

function addTransitionKey(
  keys: readonly string[],
  transitionKey: string,
): readonly string[] {
  return [...keys, transitionKey].sort();
}

function assertIsoTime(value: string, errorCode: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(errorCode);
}
