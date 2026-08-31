import { handlePlayerStorePublicRequest } from "../api/playerStorePublicHttpHandler.ts";
import { SupabasePlayerStoreFundingPublicRepository } from "../infrastructure/supabasePlayerStoreFundingPublicRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const QUOTE_KEY = "quote_11111111111111111111111111111111";
const RECEIPT_KEY = "receipt_22222222222222222222222222222222";
const OFFER_KEY = `sof_${"3".repeat(32)}`;
const SELLER_PARTY_KEY = `pty_${"4".repeat(32)}`;
const INVENTORY_TRANSACTION_KEY = `itx_${"5".repeat(32)}`;
const CONTEXT_DIGEST = "6".repeat(64);
const IDEMPOTENCY_KEY = "store.negative.12345678";

const FAILURE_CASES = [
  {
    rpcError: "STORE_FUNDED_SETTLEMENT_QUOTE_EXPIRED",
    status: 409,
    code: "store_quote_expired",
    retryable: false,
  },
  {
    rpcError: "FUNDING_INSUFFICIENT",
    status: 409,
    code: "store_insufficient_balance",
    retryable: false,
  },
  {
    rpcError: "STORE_FUNDED_SETTLEMENT_INSUFFICIENT_STOCK",
    status: 409,
    code: "store_insufficient_stock",
    retryable: false,
  },
  {
    rpcError: "STORE_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT",
    status: 409,
    code: "store_idempotency_conflict",
    retryable: false,
  },
  {
    rpcError: "GAME_SESSION_DISABLED",
    status: 409,
    code: "store_game_paused",
    retryable: true,
  },
  {
    rpcError: "GAME_SESSION_ARCHIVED",
    status: 409,
    code: "store_game_ended",
    retryable: false,
  },
] as const;

Deno.test("Player Store exposes bounded negative-state errors without mutation scope", async () => {
  for (const expected of FAILURE_CASES) {
    const client = new PublicPurchaseClient(expected.rpcError);
    const response = await handlePlayerStorePublicRequest(
      request(),
      { kind: "purchases" },
      dependencies(client),
    );
    const body = await response.json();

    assertEquals(response.status, expected.status);
    assertEquals(body.error.code, expected.code);
    assertEquals(body.error.retryable, expected.retryable);
    assertEquals(client.calls.length, 1);
    assertEquals(
      client.calls[0].functionName,
      "settle_system_store_offer_funding_v2",
    );
    assertEquals(client.calls[0].args, {
      p_game_session_id: GAME_ID,
      p_player_id: PLAYER_ID,
      p_quote_key: QUOTE_KEY,
      p_idempotency_key: IDEMPOTENCY_KEY,
    });
    assertNoUuid(body);
  }
});

Deno.test("Player Store preserves an authoritative completed replay response", async () => {
  const client = new PublicPurchaseClient(null, {
    receiptKey: RECEIPT_KEY,
    quoteKey: QUOTE_KEY,
    itemKey: "field_permit",
    itemName: "Field Permit",
    quantity: 2,
    finalUnitPrice: 50,
    finalTotalPrice: 100,
    currencyCode: "NRC",
    inventoryQuantityOwned: 2,
    offerKey: OFFER_KEY,
    sellerKind: "seeded",
    sellerPartyKey: SELLER_PARTY_KEY,
    sellerName: "Econovaria Store",
    offerVersionBefore: 2,
    offerVersionAfter: 2,
    remainingSellerQuantity: 1,
    sellerProceeds: 100,
    inventoryTransactionKey: INVENTORY_TRANSACTION_KEY,
    completedAt: "2026-07-19T03:15:01.000Z",
    alreadyCompleted: true,
    contextDigest: CONTEXT_DIGEST,
    fundingReceipt: fundingReceipt(),
  });
  const response = await handlePlayerStorePublicRequest(
    request(),
    { kind: "purchases" },
    dependencies(client),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.receipt.receiptKey, RECEIPT_KEY);
  assertEquals(body.receipt.alreadyCompleted, true);
  assertEquals(body.message, "Purchase was already completed.");
  assertEquals(body.refreshRequired, true);
  assertNoUuid(body);
});

class PublicPurchaseClient {
  readonly calls: Array<{
    functionName: string;
    args: Record<string, unknown>;
  }> = [];

  constructor(
    private readonly errorMessage: string | null,
    private readonly result: unknown = null,
  ) {}

  from(_table: string): never {
    throw new Error(
      "Negative-state purchase tests must not query a browser-owned scope.",
    );
  }

  rpc(functionName: string, args: Record<string, unknown>) {
    this.calls.push({ functionName, args });
    return Promise.resolve({
      data: this.errorMessage ? null : this.result,
      error: this.errorMessage ? { message: this.errorMessage } : null,
    });
  }
}

function dependencies(client: PublicPurchaseClient) {
  return {
    createServiceClient: () => client as never,
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope: () =>
      Promise.resolve({
        gameId: GAME_ID,
        playerUuid: PLAYER_ID,
        activeSessionId: "00000000-0000-4000-8000-000000000003",
        sessionValid: true,
        sessionExpiresAt: "2026-07-20T00:00:00.000Z",
        authorizationContext: {
          actorType: "player",
          source: "player_session",
          gameScope: "session",
          resourceScope: "own_player",
        },
      }),
    createReadRepository: () => ({
      listItems: () => Promise.resolve([]),
      listPurchases: () => Promise.resolve([]),
    }),
    createOfferProductRepository: () => ({
      listOfferProducts: () => Promise.resolve([]),
    }),
    createFundingRepository: () =>
      new SupabasePlayerStoreFundingPublicRepository(client as never),
  };
}

function request(): Request {
  return new Request("https://example.test/players/me/store/purchases", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-player-session-token": "player-token",
    },
    body: JSON.stringify({
      quoteKey: QUOTE_KEY,
      idempotencyKey: IDEMPOTENCY_KEY,
    }),
  });
}

function fundingReceipt() {
  return {
    receipt_key: "pfr_11111111111111111111111111111111",
    quote_key: "pfq_11111111111111111111111111111111",
    bank_transaction_key: "btx_11111111111111111111111111111111",
    target_account_key: "bac_22222222222222222222222222222222",
    funding_context_kind: "store.system-offer",
    funding_context_key: QUOTE_KEY,
    target_currency_code: "NRC",
    target_minor_unit: 2,
    target_amount: "100.00",
    target_reserve_draw_amount: "0.00",
    source_domain: "store",
    source_action: "system_offer_purchase_funding",
    created_at: "2026-07-19T03:15:01.000Z",
    generated_at: "2026-07-19T03:15:01.000Z",
    lines: [{
      line_number: 1,
      source_account_key: "bac_11111111111111111111111111111111",
      source_currency_code: "NRC",
      source_minor_unit: 2,
      target_currency_code: "NRC",
      target_minor_unit: 2,
      target_contribution: "100.00",
      source_debit: "100.00",
      reference_rate: "1.000000000000000000",
      customer_rate: "1.000000000000000000",
      effective_rate: "1.000000000000000000",
      spread_rate: "0.000000000000000000",
      requires_fx: false,
    }],
  };
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(serialized)
  ) {
    throw new Error(
      `Player Store response leaked an internal UUID: ${serialized}`,
    );
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
