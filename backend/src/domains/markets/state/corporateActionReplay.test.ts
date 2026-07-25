import {
  applyCorporateAction,
  createCorporateActionReplayState,
  replayCorporateActions,
  type CorporateActionReplayEvent,
} from "./corporateActionReplay.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("corporate action replay is deterministic across input order", () => {
  const events = [
    splitEvent(1),
    dividendEvent(2),
    conversionEvent(3),
  ];
  const forward = replayCorporateActions(baseState(), events);
  const reverse = replayCorporateActions(baseState(), [...events].reverse());
  assertEquals(forward, reverse);
  assertEquals(forward.quantity, "150");
  assertEquals(forward.referencePrice, "25");
  assertEquals(forward.accruedCash, "400");
  assertEquals(forward.convertedPositions, {
    "instrument.northreach.common_equity.0002.v1": "100",
  });
});

Deno.test("exact duplicate delivery is idempotent", () => {
  const event = dividendEvent(1);
  const once = applyCorporateAction(baseState(), event);
  const twice = applyCorporateAction(once, event);
  assertEquals(twice, once);
});

Deno.test("conflicting duplicate delivery is rejected", () => {
  const event = dividendEvent(1);
  const state = applyCorporateAction(baseState(), event);
  assertThrows(
    () =>
      applyCorporateAction(state, {
        ...event,
        cashAmountPerUnit: "3",
      }),
    "corporate_action_idempotency_conflict",
  );
});

Deno.test("split and reverse split preserve notional exactly", () => {
  const split = applyCorporateAction(baseState(), splitEvent(1));
  assertEquals(split.quantity, "200");
  assertEquals(split.referencePrice, "25");
  const reversed = applyCorporateAction(split, {
    ...splitEvent(2),
    actionPublicId: "action.reverse-split.0002.v1",
    idempotencyKey: "idempotency.reverse-split.0002.v1",
    kind: "reverse_split",
    splitNumerator: "1",
    splitDenominator: "2",
  });
  assertEquals(reversed.quantity, "100");
  assertEquals(reversed.referencePrice, "50");
});

Deno.test("bounded conversion rejects complex pricing and over-conversion", () => {
  assertThrows(
    () =>
      applyCorporateAction(baseState(), {
        ...conversionEvent(1),
        complexPricingSupported: true as false,
      }),
    "complex_conversion_pricing_prohibited",
  );
  assertThrows(
    () =>
      applyCorporateAction(baseState(), {
        ...conversionEvent(1),
        sourceQuantity: "101",
      }),
    "conversion_source_quantity_exceeds_position",
  );
});

Deno.test("sequence gaps and wrong-instrument actions fail closed", () => {
  assertThrows(
    () => applyCorporateAction(baseState(), dividendEvent(2)),
    "corporate_action_sequence_gap",
  );
  assertThrows(
    () =>
      applyCorporateAction(baseState(), {
        ...dividendEvent(1),
        instrumentPublicId: "instrument.yrethia.common_equity.0001.v1",
      }),
    "corporate_action_wrong_instrument",
  );
});

function baseState() {
  return createCorporateActionReplayState({
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    quantity: "100",
    referencePrice: "50",
  });
}

function splitEvent(sequence: number): CorporateActionReplayEvent {
  return {
    actionPublicId: `action.split.${sequence.toString().padStart(4, "0")}.v1`,
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    sequence,
    kind: "split",
    effectiveAt: `2026-07-${sequence.toString().padStart(2, "0")}T00:00:00.000Z`,
    idempotencyKey: `idempotency.split.${sequence.toString().padStart(4, "0")}.v1`,
    cashAmountPerUnit: null,
    splitNumerator: "2",
    splitDenominator: "1",
    sourceQuantity: null,
    targetInstrumentPublicId: null,
    conversionRatio: null,
    complexPricingSupported: false,
  };
}

function dividendEvent(sequence: number): CorporateActionReplayEvent {
  return {
    actionPublicId: `action.dividend.${sequence.toString().padStart(4, "0")}.v1`,
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    sequence,
    kind: "cash_dividend",
    effectiveAt: `2026-08-${sequence.toString().padStart(2, "0")}T00:00:00.000Z`,
    idempotencyKey: `idempotency.dividend.${sequence.toString().padStart(4, "0")}.v1`,
    cashAmountPerUnit: "2",
    splitNumerator: null,
    splitDenominator: null,
    sourceQuantity: null,
    targetInstrumentPublicId: null,
    conversionRatio: null,
    complexPricingSupported: false,
  };
}

function conversionEvent(sequence: number): CorporateActionReplayEvent {
  return {
    actionPublicId: `action.conversion.${sequence.toString().padStart(4, "0")}.v1`,
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    sequence,
    kind: "conversion",
    effectiveAt: `2026-09-${sequence.toString().padStart(2, "0")}T00:00:00.000Z`,
    idempotencyKey: `idempotency.conversion.${sequence.toString().padStart(4, "0")}.v1`,
    cashAmountPerUnit: null,
    splitNumerator: null,
    splitDenominator: null,
    sourceQuantity: "50",
    targetInstrumentPublicId: "instrument.northreach.common_equity.0002.v1",
    conversionRatio: "2",
    complexPricingSupported: false,
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
