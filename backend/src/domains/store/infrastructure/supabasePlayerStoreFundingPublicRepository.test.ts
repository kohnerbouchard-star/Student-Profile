import { PlayerStorePublicError } from "../contracts/playerStorePublicContracts.ts";
import { SupabasePlayerStoreFundingPublicRepository } from "./supabasePlayerStoreFundingPublicRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_KEY = "bac_11111111111111111111111111111111";
const QUOTE_KEY = "quote_11111111111111111111111111111111";
const OFFER_KEY = "sof_11111111111111111111111111111111";

Deno.test("funded Store repository preserves ordered final-null intent and omits caller pricing time", async () => {
  const client = new CapturingRpcClient(seededQuotePayload());
  const repository = new SupabasePlayerStoreFundingPublicRepository(
    client as never,
  );

  const result = await repository.createSystemOfferQuote({
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    offerKey: OFFER_KEY,
    quantity: 2,
    expectedVersion: 3,
    allocations: [{ sourceAccountKey: ACCOUNT_KEY, targetAmount: null }],
    idempotencyKey: "store.seeded.quote.12345678",
  });

  assertEquals(client.calls, [{
    functionName: "create_system_store_offer_funding_quote_v2",
    args: {
      p_game_session_id: GAME_ID,
      p_player_id: PLAYER_ID,
      p_offer_key: OFFER_KEY,
      p_quantity: 2,
      p_expected_offer_version: 3,
      p_allocations: [{ sourceAccountKey: ACCOUNT_KEY, targetAmount: null }],
      p_idempotency_key: "store.seeded.quote.12345678",
    },
  }]);
  assertEquals(result.fundingQuote.targetAmount, "100");
});

Deno.test("funded Store repository rejects commercial and funding evidence that are not bound to the same quote", async () => {
  const payload = seededQuotePayload();
  payload.fundingQuote.funding_context_key =
    "quote_22222222222222222222222222222222";
  const repository = new SupabasePlayerStoreFundingPublicRepository(
    new CapturingRpcClient(payload) as never,
  );

  await assertRejects(() =>
    repository.createSystemOfferQuote({
      gameSessionId: GAME_ID,
      playerId: PLAYER_ID,
      offerKey: OFFER_KEY,
      quantity: 2,
      expectedVersion: 3,
      allocations: [{ sourceAccountKey: ACCOUNT_KEY, targetAmount: null }],
      idempotencyKey: "store.system.binding.12345678",
    })
  );
});

Deno.test("funded Store settlement RPCs accept quote and idempotency intent only", async () => {
  const seeded = new CapturingRpcClient(
    null,
    "STORE_FUNDED_SETTLEMENT_QUOTE_EXPIRED",
  );
  const seededRepository = new SupabasePlayerStoreFundingPublicRepository(
    seeded as never,
  );
  await assertRejects(() =>
    seededRepository.settleSystemOfferPurchase({
      gameSessionId: GAME_ID,
      playerId: PLAYER_ID,
      quoteKey: QUOTE_KEY,
      idempotencyKey: "store.seeded.purchase.12345678",
    })
  );
  assertEquals(seeded.calls, [{
    functionName: "settle_system_store_offer_funding_v2",
    args: {
      p_game_session_id: GAME_ID,
      p_player_id: PLAYER_ID,
      p_quote_key: QUOTE_KEY,
      p_idempotency_key: "store.seeded.purchase.12345678",
    },
  }]);

  const business = new CapturingRpcClient(
    null,
    "STORE_OFFER_FUNDED_SETTLEMENT_QUOTE_EXPIRED",
  );
  const businessRepository = new SupabasePlayerStoreFundingPublicRepository(
    business as never,
  );
  await assertRejects(() =>
    businessRepository.settleBusinessOfferPurchase({
      gameSessionId: GAME_ID,
      playerId: PLAYER_ID,
      quoteKey: QUOTE_KEY,
      idempotencyKey: "store.offer.purchase.12345678",
    })
  );
  assertEquals(business.calls, [{
    functionName: "settle_business_store_offer_funding_v2",
    args: {
      p_game_session_id: GAME_ID,
      p_buyer_player_id: PLAYER_ID,
      p_quote_key: QUOTE_KEY,
      p_idempotency_key: "store.offer.purchase.12345678",
    },
  }]);

  const receiptRead = new CapturingRpcClient(
    null,
    "STORE_OFFER_FUNDED_RECEIPT_NOT_FOUND",
  );
  const receiptRepository = new SupabasePlayerStoreFundingPublicRepository(
    receiptRead as never,
  );
  await assertRejects(() =>
    receiptRepository.readBusinessOfferReceipt({
      gameSessionId: GAME_ID,
      playerId: PLAYER_ID,
      receiptKey: "spr_11111111111111111111111111111111",
    })
  );
  assertEquals(receiptRead.calls, [{
    functionName: "read_business_store_offer_funding_receipt_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_buyer_player_id: PLAYER_ID,
      p_receipt_key: "spr_11111111111111111111111111111111",
    },
  }]);
});

class CapturingRpcClient {
  readonly calls: Array<{
    functionName: string;
    args: Record<string, unknown>;
  }> = [];

  constructor(
    private readonly result: unknown,
    private readonly errorMessage: string | null = null,
  ) {}

  rpc(functionName: string, args: Record<string, unknown>) {
    this.calls.push({ functionName, args });
    return Promise.resolve({
      data: this.errorMessage ? null : this.result,
      error: this.errorMessage ? { message: this.errorMessage } : null,
    });
  }

  from(): never {
    throw new Error("RPC seam test must not query tables.");
  }
}

function seededQuotePayload() {
  return {
    quoteKey: QUOTE_KEY,
    quoteStatus: "created",
    itemKey: "field_permit",
    itemName: "Field Permit",
    quantity: 2,
    baseUnitPrice: 50,
    inflationMultiplier: 1,
    locationMultiplier: 1,
    scarcityMultiplier: 1,
    discountAmount: 0,
    finalUnitPrice: 50,
    finalTotalPrice: 100,
    currencyCode: "NRC",
    itemCurrencyCode: "NRC",
    playerCurrencyCode: "NRC",
    exchangeRate: 1,
    itemLocalFinalUnitPrice: 50,
    itemLocalFinalTotalPrice: 100,
    expiresAt: "2026-08-31T01:02:00.000Z",
    pricingVersion: "store-pricing-v1",
    replayed: false,
    offerKey: OFFER_KEY,
    offerVersion: 3,
    sellerKind: "seeded",
    sellerPartyKey: "pty_11111111111111111111111111111111",
    sellerName: "Econovaria Store",
    availableQuantityAtQuote: 10,
    contextDigest: "c".repeat(64),
    fundingQuote: {
      quote_key: "pfq_11111111111111111111111111111111",
      funding_context_kind: "store.system-offer",
      funding_context_key: QUOTE_KEY,
      target_currency_code: "NRC",
      target_minor_unit: 2,
      target_amount: "100.00",
      fixing_key: "fxf_11111111111111111111111111111111",
      policy_version: "retail-fx-v1",
      requires_fx: false,
      expires_at: "2026-08-31T01:02:00.000Z",
      generated_at: "2026-08-31T01:00:00.000Z",
      lines: [{
        line_number: 1,
        source_account_key: ACCOUNT_KEY,
        source_currency_code: "NRC",
        source_minor_unit: 2,
        target_currency_code: "NRC",
        target_minor_unit: 2,
        posted_amount: "500.00",
        held_amount: "0.00",
        available_amount: "500.00",
        target_contribution: "100.00",
        source_debit: "100.00",
        reference_rate: "1.000000000000000000",
        customer_rate: "1.000000000000000000",
        effective_rate: "1.000000000000000000",
        spread_rate: "0.000000000000000000",
        requires_fx: false,
        rounding_disclosure: "No FX conversion or rounding was required.",
      }],
    },
  };
}

async function assertRejects(run: () => Promise<unknown>): Promise<void> {
  let error: unknown;
  try {
    await run();
  } catch (candidate) {
    error = candidate;
  }
  if (!(error instanceof PlayerStorePublicError)) {
    throw new Error("Expected PlayerStorePublicError.");
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
