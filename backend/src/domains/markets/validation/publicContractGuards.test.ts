import type {
  FinancialMarketInstrumentDefinition,
} from "../contracts/financialMarketContracts.ts";
import {
  assertBrowserOrderRequestOwnsNoSettlementValues,
  assertInstrumentTradableUnderPurePolicy,
  assertProhibitedFinancialMarketFeaturesRemainDisabled,
  decideFinancialMarketActivation,
  FINANCIAL_MARKET_PROHIBITED_FEATURES,
  validateFinancialMarketPublicPayload,
} from "./publicContractGuards.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("public payload accepts stable public IDs and rejects internal UUIDs", () => {
  const valid = validateFinancialMarketPublicPayload({
    instrumentPublicId: "instrument.northreach.equity.1.v1",
    issuerPublicId: "issuer.northreach.corporation.1.v1",
    holdings: [{ quantity: "12.5", currentValue: "1250.25" }],
  });
  assertEquals(valid.valid, true);

  const invalid = validateFinancialMarketPublicPayload({
    instrumentPublicId: "instrument.northreach.equity.1.v1",
    internalUuid: "550e8400-e29b-41d4-a716-446655440000",
    playerSessionId: "550e8400-e29b-41d4-a716-446655440001",
  });
  assertEquals(invalid.valid, false);
  assert(invalid.issues.some((entry) => entry.code === "internal_uuid_exposed"));
  assert(invalid.issues.some((entry) => entry.code === "private_identifier_key"));
});

Deno.test("browser order requests cannot control settlement values", () => {
  assertBrowserOrderRequestOwnsNoSettlementValues({
    listingPublicId: "listing.northreach.equity.1.v1",
    side: "buy",
    orderType: "limit",
    quantity: "10",
    limitPrice: "20",
    idempotencyKey: "order-1",
  });
  for (const key of [
    "executionPrice",
    "grossValue",
    "feeAmount",
    "settlementValue",
    "cashDelta",
    "assetDelta",
  ]) {
    assertThrows(() =>
      assertBrowserOrderRequestOwnsNoSettlementValues({
        listingPublicId: "listing.northreach.equity.1.v1",
        [key]: "100",
      })
    );
  }
});

Deno.test("public strings, arrays, precision, depth, and numeric magnitude are bounded", () => {
  const report = validateFinancialMarketPublicPayload({
    long: "x".repeat(601),
    array: Array.from({ length: 501 }, (_, index) => index),
    decimal: "1.123456789",
    numeric: 1_000_000_000_000_001,
    nested: { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: { l: { m: true } } } } } } } } } } } } },
  });
  assertEquals(report.valid, false);
  for (const code of [
    "string_too_long",
    "array_too_long",
    "numeric_precision_exceeded",
    "numeric_value_out_of_bounds",
    "payload_depth_exceeded",
  ]) {
    assert(report.issues.some((entry) => entry.code === code));
  }
});

Deno.test("activation remains prohibited even when all editorial prerequisites pass", () => {
  const decision = decideFinancialMarketActivation(instrument(), {
    issuerActive: true,
    listingReviewed: true,
    sourceChecksumVerified: true,
    humanApprovalRecorded: true,
  });
  assertEquals(decision.allowed, false);
  assertEquals(decision.shortSellingSupported, false);
  assertEquals(decision.derivativesSupported, false);
  assertEquals(decision.realWorldFeedsSupported, false);
  assertEquals(decision.physicalDeliverySupported, false);
  assert(decision.reasons.includes("controller_hold_activation_prohibited"));
});

Deno.test("inactive and malformed definitions fail closed", () => {
  const malformed = {
    ...instrument(),
    instrumentPublicId: "550e8400-e29b-41d4-a716-446655440000",
    instrumentType: "derivative" as never,
    status: "draft" as const,
  };
  const decision = decideFinancialMarketActivation(malformed, {
    issuerActive: false,
    listingReviewed: false,
    sourceChecksumVerified: false,
    humanApprovalRecorded: false,
  });
  assert(decision.reasons.includes("malformed_public_identity"));
  assert(decision.reasons.includes("unsupported_instrument_type"));
  assert(decision.reasons.includes("definition_not_approved_inactive"));
  assert(decision.reasons.includes("issuer_inactive"));
  assertThrows(() =>
    assertInstrumentTradableUnderPurePolicy({
      instrument: malformed,
      issuerActive: false,
      listingActive: false,
      gameActive: false,
      marketPaused: true,
    })
  );
});

Deno.test("prohibited feature contract cannot be weakened", () => {
  assertProhibitedFinancialMarketFeaturesRemainDisabled();
  assertEquals(FINANCIAL_MARKET_PROHIBITED_FEATURES.shortSellingSupported, false);
  assertEquals(FINANCIAL_MARKET_PROHIBITED_FEATURES.derivativesSupported, false);
  assertEquals(FINANCIAL_MARKET_PROHIBITED_FEATURES.realWorldFeedsSupported, false);
  assertEquals(FINANCIAL_MARKET_PROHIBITED_FEATURES.physicalDeliverySupported, false);
  assertThrows(() =>
    assertProhibitedFinancialMarketFeaturesRemainDisabled({
      ...FINANCIAL_MARKET_PROHIBITED_FEATURES,
      shortSellingSupported: true as never,
    })
  );
});

function instrument(): FinancialMarketInstrumentDefinition {
  return {
    instrumentPublicId: "instrument.northreach.equity.1.v1",
    issuerPublicId: "issuer.northreach.corporation.1.v1",
    name: "Northreach Equity",
    assetClass: "equity",
    instrumentType: "common_equity",
    countryCode: "NORTHREACH",
    denominationCurrencyCode: "NRC",
    sectorPublicId: "sector.industrial.v1",
    industryPublicId: "industry.industrial.general.v1",
    riskClass: "moderate",
    typeContractPublicId: "contract.instrument.common-equity.v1",
    status: "approved_inactive",
    activationAuthorized: false,
    effectiveAt: null,
    retiredAt: null,
    sourceVersion: "instrument.v1",
    sourceChecksumSha256: "f".repeat(64),
  };
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertThrows(run: () => unknown): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected function to throw.");
}
