import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { handlePlayerStorePublicRequest } from "../api/playerStorePublicHttpHandler.ts";
import type {
  PlayerStoreFundingPublicRepository,
  PlayerStoreSeededFundingReceiptDto,
} from "../contracts/playerStoreFundingPublicContracts.ts";
import { SupabasePlayerStoreFundingPublicRepository } from "../infrastructure/supabasePlayerStoreFundingPublicRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const QUOTE_KEY = "quote_11111111111111111111111111111111";
const RECEIPT_KEY = "receipt_22222222222222222222222222222222";
const IDEMPOTENCY_KEY = "store.negative.12345678";

const SETTLEMENT_MIGRATION = new URL(
  "../../../../supabase/migrations/20260827094000_multicurrency_store_funding_settlement_v1.sql",
  import.meta.url,
);
const SESSION_HELPERS = new URL(
  "../../players/api/playerSessionHttpHelpers.ts",
  import.meta.url,
);

Deno.test("funded Store settlement preserves expiry, stock, idempotency, and C0 composition guards", async () => {
  const source = await Deno.readTextFile(SETTLEMENT_MIGRATION);
  for (
    const fragment of [
      "STORE_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT",
      "STORE_FUNDED_SETTLEMENT_QUOTE_EXPIRED",
      "STORE_FUNDED_SETTLEMENT_INSUFFICIENT_STOCK",
      "compose_purchase_funding_v1",
      "post_inventory_transaction_v2",
    ]
  ) {
    assertEquals(source.includes(fragment), true);
  }
});

Deno.test("Player session resolution rejects paused and ended games before funded Store work", async () => {
  const source = await Deno.readTextFile(SESSION_HELPERS);
  assertEquals(source.includes('.from("game_sessions")'), true);
  assertEquals(source.includes('.eq("status", "active")'), true);

  for (const gameStatus of ["paused", "ended"]) {
    const repository = new CountingFundingRepository();
    const response = await handlePlayerStorePublicRequest(
      request(),
      { kind: "purchases" },
      {
        ...dependencies(repository),
        resolveScope: () =>
          Promise.reject(
            new EdgeActivationError(
              "invalid_player_session",
              `Player session is unavailable while the game is ${gameStatus}.`,
              401,
              false,
            ),
          ),
      },
    );

    await assertError(response, 401, "invalid_player_session", false);
    assertEquals(repository.purchaseCalls, 0);
  }
});

Deno.test("Player Store maps funded purchase failures to stable public errors", async () => {
  const cases = [
    ["STORE_FUNDED_SETTLEMENT_QUOTE_EXPIRED", "store_quote_expired", false],
    [
      "STORE_FUNDED_SETTLEMENT_INSUFFICIENT_STOCK",
      "store_insufficient_stock",
      false,
    ],
    ["FUNDING_INSUFFICIENT", "store_insufficient_balance", false],
    [
      "STORE_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT",
      "store_idempotency_conflict",
      false,
    ],
    ["STORE_FUNDED_SETTLEMENT_IN_PROGRESS", "store_purchase_in_progress", true],
  ] as const;

  for (const [rpcMessage, expectedCode, retryable] of cases) {
    const repository = new SupabasePlayerStoreFundingPublicRepository(
      errorClient(rpcMessage) as never,
    );
    const response = await handlePlayerStorePublicRequest(
      request(),
      { kind: "purchases" },
      dependencies(repository),
    );

    await assertError(response, 409, expectedCode, retryable);
  }
});

Deno.test("Duplicate funded Store request replays one receipt without duplicate economic writes", async () => {
  const repository = new ReplayFundingRepository();
  const first = await handlePlayerStorePublicRequest(
    request(),
    { kind: "purchases" },
    dependencies(repository),
  );
  const replay = await handlePlayerStorePublicRequest(
    request(),
    { kind: "purchases" },
    dependencies(repository),
  );
  const firstBody = await first.json();
  const replayBody = await replay.json();

  assertEquals(first.status, 200);
  assertEquals(replay.status, 200);
  assertEquals(firstBody.receipt.receiptKey, RECEIPT_KEY);
  assertEquals(firstBody.receipt.alreadyCompleted, false);
  assertEquals(replayBody.receipt.receiptKey, RECEIPT_KEY);
  assertEquals(replayBody.receipt.alreadyCompleted, true);
  assertEquals(repository.economicWrites, 1);
  assertNoUuid(firstBody);
  assertNoUuid(replayBody);
});

function dependencies(repository: PlayerStoreFundingPublicRepository) {
  return {
    createServiceClient: () => ({} as never),
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope: () =>
      Promise.resolve({ gameId: GAME_ID, playerUuid: PLAYER_ID }),
    createReadRepository: () => ({
      listItems: () => Promise.resolve([]),
      listPurchases: () => Promise.resolve([]),
    }),
    createOfferProductRepository: () => ({
      listOfferProducts: () => Promise.resolve([]),
    }),
    createFundingRepository: () => repository,
  };
}

function errorClient(message: string) {
  return {
    rpc: () => Promise.resolve({ data: null, error: { message } }),
    from: () => {
      throw new Error("Unexpected table query in purchase error test.");
    },
  };
}

class CountingFundingRepository implements PlayerStoreFundingPublicRepository {
  purchaseCalls = 0;

  createSystemOfferQuote(): never {
    throw new Error("Not used.");
  }

  settleSystemOfferPurchase(): Promise<PlayerStoreSeededFundingReceiptDto> {
    this.purchaseCalls += 1;
    return Promise.reject(new Error("Store purchase must not run."));
  }

  createBusinessOfferQuote(): never {
    throw new Error("Not used.");
  }

  settleBusinessOfferPurchase(): never {
    throw new Error("Not used.");
  }

  readBusinessOfferReceipt(): never {
    throw new Error("Not used.");
  }
}

class ReplayFundingRepository extends CountingFundingRepository {
  economicWrites = 0;
  private receipt: PlayerStoreSeededFundingReceiptDto | null = null;

  override settleSystemOfferPurchase(): Promise<PlayerStoreSeededFundingReceiptDto> {
    this.purchaseCalls += 1;
    if (this.receipt) {
      return Promise.resolve({ ...this.receipt, alreadyCompleted: true });
    }
    this.economicWrites += 1;
    this.receipt = seededReceipt();
    return Promise.resolve(this.receipt);
  }
}

function seededReceipt(): PlayerStoreSeededFundingReceiptDto {
  return {
    receiptKey: RECEIPT_KEY,
    quoteKey: QUOTE_KEY,
    itemKey: "field_permit",
    itemName: "Field Permit",
    quantity: 1,
    finalUnitPrice: 50,
    finalTotalPrice: 50,
    currencyCode: "NRC",
    inventoryQuantityOwned: 1,
    offerKey: `sof_${"1".repeat(32)}`,
    sellerKind: "seeded",
    sellerPartyKey: `pty_${"1".repeat(32)}`,
    sellerName: "Econovaria Store",
    offerVersionBefore: 1,
    offerVersionAfter: 1,
    remainingSellerQuantity: 4,
    sellerProceeds: 50,
    inventoryTransactionKey: `itx_${"1".repeat(32)}`,
    contextDigest: "c".repeat(64),
    completedAt: "2026-07-19T04:00:01.000Z",
    alreadyCompleted: false,
    fundingReceipt: {
      receiptKey: "pfr_11111111111111111111111111111111",
      quoteKey: "pfq_11111111111111111111111111111111",
      bankTransactionKey: "btx_11111111111111111111111111111111",
      targetAccountKey: "bac_22222222222222222222222222222222",
      fundingContextKind: "store.system-offer",
      fundingContextKey: QUOTE_KEY,
      targetCurrencyCode: "NRC",
      targetMinorUnit: 2,
      targetAmount: "50.00",
      targetReserveDrawAmount: "0.00",
      sourceDomain: "store",
      sourceAction: "seeded_purchase",
      createdAt: "2026-07-19T04:00:01.000Z",
      lines: [{
        lineNumber: 1,
        sourceAccountKey: "bac_11111111111111111111111111111111",
        sourceCurrencyCode: "NRC",
        sourceMinorUnit: 2,
        targetCurrencyCode: "NRC",
        targetMinorUnit: 2,
        targetContribution: "50.00",
        sourceDebit: "50.00",
        referenceRate: "1.000000000000000000",
        customerRate: "1.000000000000000000",
        effectiveRate: "1.000000000000000000",
        spreadRate: "0.000000000000000000",
        requiresFx: false,
      }],
    },
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

async function assertError(
  response: Response,
  status: number,
  code: string,
  retryable: boolean,
): Promise<void> {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
  assertEquals(body.error.retryable, retryable);
  assertNoUuid(body);
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(serialized)
  ) {
    throw new Error(
      `Player Store negative-state response leaked an internal UUID: ${serialized}`,
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
