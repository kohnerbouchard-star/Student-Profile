import { mapFundingRpcError } from "./playerStoreFundingPublicErrors.ts";
import {
  parseFundingQuote,
  parseFundingReceipt,
} from "./playerStoreFundingPublicResponse.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const ACCOUNT_KEY = "bac_11111111111111111111111111111111";
const PRE_FUNDING_CONFLICT = [
  "STORE_OFFER_FUNDED_SETTLEMENT_LE",
  "GACY_CONFLICT",
].join("");

Deno.test("funding projections preserve canonical decimal strings and precision metadata", () => {
  const quote = parseFundingQuote(quotePayload());
  const receipt = parseFundingReceipt(
    receiptPayload(),
    "system_offer_purchase_funding",
  );

  assertEquals(quote.targetAmount, "123.456789012345678901");
  assertEquals(quote.targetMinorUnit, 18);
  assertEquals("generatedAt" in quote, false);
  assertEquals(
    quote.lines[0].customerRate,
    "0.995000000000000000",
  );
  assertEquals(quote.lines[0].sourceMinorUnit, 3);
  assertEquals(receipt.targetAmount, "123.456789012345678901");
  assertEquals(receipt.targetMinorUnit, 18);
  assertEquals("generatedAt" in receipt, false);
  assertEquals(receipt.lines[0].targetCurrencyCode, "NRC");
  assertEquals(receipt.lines[0].targetMinorUnit, 18);
});

Deno.test("funding projections reject numeric money and internal UUIDs", () => {
  const numeric = quotePayload();
  numeric.target_amount = 123.45;
  assertThrows(() => parseFundingQuote(numeric));

  const uuid = quotePayload();
  uuid.funding_context_key = "00000000-0000-4000-8000-000000000001";
  assertThrows(() => parseFundingQuote(uuid));
});

Deno.test("funding projections reject incomplete or contradictory line evidence", () => {
  const duplicate = quotePayload();
  duplicate.lines.push({ ...duplicate.lines[0] });
  duplicate.target_amount = "246.913578024691357802";
  assertThrows(() => parseFundingQuote(duplicate));

  const wrongTarget = quotePayload();
  wrongTarget.lines[0].target_currency_code = "ECO";
  assertThrows(() => parseFundingQuote(wrongTarget));

  const wrongSum = quotePayload();
  wrongSum.lines[0].target_contribution = "123.456789012345678900";
  assertThrows(() => parseFundingQuote(wrongSum));

  const wrongAggregate = quotePayload();
  wrongAggregate.requires_fx = false;
  assertThrows(() => parseFundingQuote(wrongAggregate));

  assertThrows(() =>
    parseFundingReceipt(receiptPayload(), "business_offer_purchase_funding")
  );
});

Deno.test("funding RPC errors map bounded account, remainder, precision, conflict, and retirement states", () => {
  const cases = [
    [
      "PURCHASE_FUNDING_DUPLICATE_ACCOUNT",
      400,
      "store_funding_duplicate_account",
      false,
    ],
    [
      "PURCHASE_FUNDING_REMAINDER_INVALID",
      400,
      "store_funding_remainder_invalid",
      false,
    ],
    [
      "PURCHASE_FUNDING_TARGET_PRECISION_INVALID",
      400,
      "store_funding_precision_invalid",
      false,
    ],
    ["BANK_ACCOUNT_NOT_FOUND", 409, "store_funding_account_unavailable", false],
    [
      "STORE_OFFER_FUNDED_SETTLEMENT_OFFER_VERSION_CONFLICT",
      409,
      "store_offer_version_conflict",
      false,
    ],
    [
      "STORE_SYSTEM_OFFER_FUNDED_QUOTE_OFFER_CONFLICT",
      409,
      "store_offer_version_conflict",
      false,
    ],
    [
      "STORE_FUNDED_SETTLEMENT_OFFER_CONFLICT",
      409,
      "store_offer_version_conflict",
      false,
    ],
    [
      "STORE_FUNDED_SETTLEMENT_TARGET_INVALID",
      409,
      "store_funding_account_unavailable",
      false,
    ],
    [
      "STORE_OFFER_FUNDED_SETTLEMENT_IN_PROGRESS",
      409,
      "store_purchase_in_progress",
      true,
    ],
    [
      "PURCHASE_FUNDING_QUOTE_CONFLICT",
      409,
      "store_idempotency_conflict",
      false,
    ],
    [
      "PURCHASE_FUNDING_QUOTE_CONSUMED",
      409,
      "store_quote_not_available",
      false,
    ],
    [
      "STORE_OFFER_FUNDED_SETTLEMENT_QUOTE_UNUSABLE",
      409,
      "store_quote_not_available",
      false,
    ],
    [
      "STORE_FUNDED_SETTLEMENT_IDEMPOTENCY_COMPLETION_FAILED",
      500,
      "player_store_funding_purchase_failed",
      false,
    ],
    [
      PRE_FUNDING_CONFLICT,
      410,
      "store_funding_quote_required",
      false,
    ],
  ] as const;

  for (const [message, status, code, retryable] of cases) {
    const error = mapFundingRpcError({ message }, "purchase");
    assertEquals(error.status, status);
    assertEquals(error.code, code);
    assertEquals(error.retryable, retryable);
  }

  const unsupportedCurrency = mapFundingRpcError({
    message: "STORE_OFFER_FUNDED_QUOTE_CURRENCY_PRECISION_UNSUPPORTED",
  }, "quote");
  assertEquals(unsupportedCurrency.status, 409);
  assertEquals(unsupportedCurrency.code, "store_quote_not_available");
});

function quotePayload(): Record<string, any> {
  return {
    quote_key: "pfq_11111111111111111111111111111111",
    funding_context_kind: "store.system-offer",
    funding_context_key: "quote_11111111111111111111111111111111",
    target_currency_code: "NRC",
    target_minor_unit: 18,
    target_amount: "123.456789012345678901",
    fixing_key: "fxf_11111111111111111111111111111111",
    policy_version: "retail-fx-v1",
    requires_fx: true,
    expires_at: "2026-08-31T01:02:00.000Z",
    generated_at: "2026-08-31T01:00:00.000Z",
    lines: [{
      line_number: 1,
      source_account_key: ACCOUNT_KEY,
      source_currency_code: "USD",
      source_minor_unit: 3,
      target_currency_code: "NRC",
      target_minor_unit: 18,
      posted_amount: "200.000",
      held_amount: "0.000",
      available_amount: "200.000",
      target_contribution: "123.456789012345678901",
      source_debit: "124.078",
      reference_rate: "1.000000000000000000",
      customer_rate: "0.995000000000000000",
      effective_rate: "0.994991860274984687",
      spread_rate: "0.005000000000000000",
      requires_fx: true,
      rounding_disclosure: "Source debit rounded up to the source minor unit.",
    }],
  };
}

function receiptPayload(): Record<string, any> {
  const quote = quotePayload();
  const line = quote.lines[0];
  return {
    receipt_key: "pfr_11111111111111111111111111111111",
    quote_key: quote.quote_key,
    bank_transaction_key: "btx_11111111111111111111111111111111",
    target_account_key: "bac_22222222222222222222222222222222",
    funding_context_kind: quote.funding_context_kind,
    funding_context_key: quote.funding_context_key,
    target_currency_code: quote.target_currency_code,
    target_minor_unit: quote.target_minor_unit,
    target_amount: quote.target_amount,
    target_reserve_draw_amount: "0.000000000000000000",
    source_domain: "store",
    source_action: "system_offer_purchase_funding",
    created_at: "2026-08-31T01:01:00.000Z",
    generated_at: "2026-08-31T01:01:00.000Z",
    lines: [{
      line_number: line.line_number,
      source_account_key: line.source_account_key,
      source_currency_code: line.source_currency_code,
      source_minor_unit: line.source_minor_unit,
      target_currency_code: line.target_currency_code,
      target_minor_unit: line.target_minor_unit,
      target_contribution: line.target_contribution,
      source_debit: line.source_debit,
      reference_rate: line.reference_rate,
      customer_rate: line.customer_rate,
      effective_rate: line.effective_rate,
      spread_rate: line.spread_rate,
      requires_fx: line.requires_fx,
    }],
  };
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

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
