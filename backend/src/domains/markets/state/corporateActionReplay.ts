import type { FinancialMarketCorporateActionKind } from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "../calculations/decimalMath.ts";

export type ReplayableCorporateActionKind = Extract<
  FinancialMarketCorporateActionKind,
  "cash_dividend" | "preferred_dividend" | "split" | "reverse_split" | "conversion"
>;

export interface CorporateActionReplayState {
  readonly instrumentPublicId: string;
  readonly version: number;
  readonly lastSequence: number;
  readonly quantity: string;
  readonly referencePrice: string;
  readonly accruedCash: string;
  readonly convertedPositions: Readonly<Record<string, string>>;
  readonly processedActionDigests: Readonly<Record<string, string>>;
  readonly complexPricingSupported: false;
  readonly activationAuthorized: false;
}

export interface CorporateActionReplayEvent {
  readonly actionPublicId: string;
  readonly instrumentPublicId: string;
  readonly sequence: number;
  readonly kind: ReplayableCorporateActionKind;
  readonly effectiveAt: string;
  readonly idempotencyKey: string;
  readonly cashAmountPerUnit: string | null;
  readonly splitNumerator: string | null;
  readonly splitDenominator: string | null;
  readonly sourceQuantity: string | null;
  readonly targetInstrumentPublicId: string | null;
  readonly conversionRatio: string | null;
  readonly complexPricingSupported: false;
}

export function createCorporateActionReplayState(input: {
  readonly instrumentPublicId: string;
  readonly quantity: string;
  readonly referencePrice: string;
}): CorporateActionReplayState {
  assertIdentity(input.instrumentPublicId, "instrument_public_id_invalid");
  assertNonNegative(input.quantity, "quantity_invalid");
  assertPositive(input.referencePrice, "reference_price_invalid");
  return {
    instrumentPublicId: input.instrumentPublicId,
    version: 0,
    lastSequence: 0,
    quantity: input.quantity,
    referencePrice: input.referencePrice,
    accruedCash: "0",
    convertedPositions: {},
    processedActionDigests: {},
    complexPricingSupported: false,
    activationAuthorized: false,
  };
}

export function replayCorporateActions(
  initialState: CorporateActionReplayState,
  events: readonly CorporateActionReplayEvent[],
): CorporateActionReplayState {
  let state = initialState;
  for (const event of [...events].sort(compareEvents)) {
    state = applyCorporateAction(state, event);
  }
  return state;
}

export function applyCorporateAction(
  state: CorporateActionReplayState,
  event: CorporateActionReplayEvent,
): CorporateActionReplayState {
  validateEventEnvelope(state, event);
  const digest = actionDigest(event);
  const priorDigest = state.processedActionDigests[event.idempotencyKey];
  if (priorDigest !== undefined) {
    if (priorDigest !== digest) {
      throw new Error("corporate_action_idempotency_conflict");
    }
    return state;
  }
  if (event.sequence !== state.lastSequence + 1) {
    throw new Error("corporate_action_sequence_gap");
  }

  let quantity = state.quantity;
  let referencePrice = state.referencePrice;
  let accruedCash = state.accruedCash;
  const convertedPositions = { ...state.convertedPositions };

  switch (event.kind) {
    case "cash_dividend":
    case "preferred_dividend": {
      const cashAmountPerUnit = requirePositive(
        event.cashAmountPerUnit,
        "cash_amount_per_unit_required",
      );
      accruedCash = addMarketDecimals(
        accruedCash,
        multiplyMarketDecimals(quantity, cashAmountPerUnit),
      );
      break;
    }
    case "split":
    case "reverse_split": {
      const numerator = requirePositive(
        event.splitNumerator,
        "split_numerator_required",
      );
      const denominator = requirePositive(
        event.splitDenominator,
        "split_denominator_required",
      );
      const ratio = divideMarketDecimals(numerator, denominator);
      if (event.kind === "split" && compareMarketDecimals(ratio, "1") <= 0) {
        throw new Error("split_ratio_must_exceed_one");
      }
      if (
        event.kind === "reverse_split" &&
        compareMarketDecimals(ratio, "1") >= 0
      ) {
        throw new Error("reverse_split_ratio_must_be_below_one");
      }
      const notionalBefore = multiplyMarketDecimals(quantity, referencePrice);
      quantity = multiplyMarketDecimals(quantity, ratio);
      referencePrice = divideMarketDecimals(referencePrice, ratio);
      const notionalAfter = multiplyMarketDecimals(quantity, referencePrice);
      if (compareMarketDecimals(notionalBefore, notionalAfter) !== 0) {
        throw new Error("split_notional_continuity_failure");
      }
      break;
    }
    case "conversion": {
      if (event.complexPricingSupported !== false) {
        throw new Error("complex_conversion_pricing_prohibited");
      }
      const sourceQuantity = requirePositive(
        event.sourceQuantity,
        "conversion_source_quantity_required",
      );
      if (compareMarketDecimals(sourceQuantity, quantity) > 0) {
        throw new Error("conversion_source_quantity_exceeds_position");
      }
      const targetInstrumentPublicId = requireIdentity(
        event.targetInstrumentPublicId,
        "conversion_target_instrument_required",
      );
      if (targetInstrumentPublicId === state.instrumentPublicId) {
        throw new Error("conversion_target_must_differ");
      }
      const conversionRatio = requirePositive(
        event.conversionRatio,
        "conversion_ratio_required",
      );
      if (compareMarketDecimals(conversionRatio, "1000") > 0) {
        throw new Error("conversion_ratio_out_of_bounds");
      }
      quantity = subtractMarketDecimals(quantity, sourceQuantity);
      convertedPositions[targetInstrumentPublicId] = addMarketDecimals(
        convertedPositions[targetInstrumentPublicId] ?? "0",
        multiplyMarketDecimals(sourceQuantity, conversionRatio),
      );
      break;
    }
  }

  return {
    ...state,
    version: state.version + 1,
    lastSequence: event.sequence,
    quantity,
    referencePrice,
    accruedCash,
    convertedPositions: sortRecord(convertedPositions),
    processedActionDigests: sortRecord({
      ...state.processedActionDigests,
      [event.idempotencyKey]: digest,
    }),
  };
}

function validateEventEnvelope(
  state: CorporateActionReplayState,
  event: CorporateActionReplayEvent,
): void {
  assertIdentity(event.actionPublicId, "corporate_action_public_id_invalid");
  assertIdentity(event.instrumentPublicId, "instrument_public_id_invalid");
  assertIdentity(event.idempotencyKey, "idempotency_key_invalid");
  if (event.instrumentPublicId !== state.instrumentPublicId) {
    throw new Error("corporate_action_wrong_instrument");
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 1) {
    throw new Error("corporate_action_sequence_invalid");
  }
  if (!Number.isFinite(Date.parse(event.effectiveAt))) {
    throw new Error("corporate_action_effective_at_invalid");
  }
}

function actionDigest(event: CorporateActionReplayEvent): string {
  return JSON.stringify([
    event.actionPublicId,
    event.instrumentPublicId,
    event.sequence,
    event.kind,
    event.effectiveAt,
    event.cashAmountPerUnit,
    event.splitNumerator,
    event.splitDenominator,
    event.sourceQuantity,
    event.targetInstrumentPublicId,
    event.conversionRatio,
    event.complexPricingSupported,
  ]);
}

function compareEvents(
  left: CorporateActionReplayEvent,
  right: CorporateActionReplayEvent,
): number {
  return left.sequence - right.sequence ||
    left.actionPublicId.localeCompare(right.actionPublicId);
}

function requirePositive(value: string | null, errorCode: string): string {
  if (value === null) throw new Error(errorCode);
  assertPositive(value, errorCode);
  return value;
}

function requireIdentity(value: string | null, errorCode: string): string {
  if (value === null) throw new Error(errorCode);
  assertIdentity(value, errorCode);
  return value;
}

function assertPositive(value: string, errorCode: string): void {
  if (compareMarketDecimals(value, "0") <= 0) throw new Error(errorCode);
}

function assertNonNegative(value: string, errorCode: string): void {
  if (compareMarketDecimals(value, "0") < 0) throw new Error(errorCode);
}

function assertIdentity(value: string, errorCode: string): void {
  if (!value.trim() || value.length > 180) throw new Error(errorCode);
}

function sortRecord<T>(
  record: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
