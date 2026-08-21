import {
  createBusinessStoreQuote,
  purchaseBusinessStoreQuote,
  toBusinessStoreQuote,
  toBusinessStoreReceipt,
} from "./playerBusinessStoreProcurement.ts";
import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";
import type {
  BusinessSnapshotDto,
  PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
const QUOTE_KEY = `bsq_${"b".repeat(32)}`;
const RECEIPT_KEY = `bsr_${"c".repeat(32)}`;
const IDEMPOTENCY_KEY = "business-store-test-0001";

Deno.test(
  "Business Store quote derives scope server-side and returns public evidence",
  async () => {
    const repository = new CapturingRepository();
    const quote = await createBusinessStoreQuote(
      repository,
      { gameSessionId: GAME_ID, playerId: PLAYER_ID },
      {
        itemKey: "Steel_Plate",
        quantity: 3,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    );

    assertEqual(repository.calls[0], {
      command: "create_business_store_quote_v2",
      args: {
        p_game_session_id: GAME_ID,
        p_player_id: PLAYER_ID,
        p_item_key: "steel_plate",
        p_quantity: 3,
        p_idempotency_key: IDEMPOTENCY_KEY,
      },
    });
    assertEqual(quote.businessKey, BUSINESS_KEY);
    assertEqual(quote.quoteKey, QUOTE_KEY);
    assertEqual(quote.finalTotalPrice, 30.01);
    assertNoUuid(quote);
  },
);

Deno.test(
  "Business Store purchase carries public quote intent and stable receipt evidence",
  async () => {
    const repository = new CapturingRepository();
    const receipt = await purchaseBusinessStoreQuote(
      repository,
      { gameSessionId: GAME_ID, playerId: PLAYER_ID },
      {
        quoteKey: QUOTE_KEY.toUpperCase(),
        idempotencyKey: "business-store-purchase-0001",
        clientSubmittedAt: "2026-08-21T01:00:00Z",
      },
    );

    assertEqual(repository.calls[0], {
      command: "purchase_business_store_quote_v2",
      args: {
        p_game_session_id: GAME_ID,
        p_player_id: PLAYER_ID,
        p_quote_key: QUOTE_KEY,
        p_idempotency_key: "business-store-purchase-0001",
        p_client_submitted_at: "2026-08-21T01:00:00.000Z",
        p_request_metadata: {
          route: "players.me.business.store.purchases.v2",
        },
      },
    });
    assertEqual(receipt.receiptKey, RECEIPT_KEY);
    assertEqual(receipt.warehouseQuantityOwned, 8);
    assertEqual(receipt.warehouseAverageUnitCost, 9.8765);
    assertEqual(receipt.alreadyCompleted, false);
    assertNoUuid(receipt);
  },
);

Deno.test(
  "Business Store parser rejects malformed intent before repository execution",
  async () => {
    const repository = new CapturingRepository();

    await assertBusinessError(
      () =>
        createBusinessStoreQuote(
          repository,
          { gameSessionId: GAME_ID, playerId: PLAYER_ID },
          {
            itemKey: "not valid",
            quantity: 1,
            idempotencyKey: IDEMPOTENCY_KEY,
          },
        ),
      400,
      "invalid_business_store_request",
    );
    await assertBusinessError(
      () =>
        purchaseBusinessStoreQuote(
          repository,
          { gameSessionId: GAME_ID, playerId: PLAYER_ID },
          {
            quoteKey: `quote_${"d".repeat(32)}`,
            idempotencyKey: IDEMPOTENCY_KEY,
          },
        ),
      400,
      "invalid_business_store_request",
    );
    assertEqual(repository.calls.length, 0);
  },
);

Deno.test(
  "Business Store result adapters fail closed on malformed private output",
  () => {
    assertThrows(() =>
      toBusinessStoreQuote({
        ...quoteRow(),
        quote_key: "00000000-0000-4000-8000-000000000099",
      })
    );
    assertThrows(() =>
      toBusinessStoreReceipt({
        ...receiptRow(),
        warehouse_average_unit_cost: -1,
      })
    );
  },
);

Deno.test(
  "Business Store HTTP routes reject browser scope and expose UUID-free DTOs",
  async () => {
    const repository = new CapturingRepository();
    const dependencies = handlerDependencies(repository);

    const quoteResponse = await handlePlayerBusinessRequest(
      request("/players/me/business/store/quotes", {
        itemKey: "steel_plate",
        quantity: 3,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
      { kind: "businessStoreQuote" },
      dependencies,
    );
    const quoteBody = await quoteResponse.json();
    assertEqual(quoteResponse.status, 200);
    assertEqual(quoteBody.quote.quoteKey, QUOTE_KEY);
    assertNoUuid(quoteBody);

    const purchaseResponse = await handlePlayerBusinessRequest(
      request("/players/me/business/store/purchases", {
        quoteKey: QUOTE_KEY,
        idempotencyKey: "business-store-purchase-0001",
      }),
      { kind: "businessStorePurchase" },
      dependencies,
    );
    const purchaseBody = await purchaseResponse.json();
    assertEqual(purchaseResponse.status, 200);
    assertEqual(purchaseBody.receipt.receiptKey, RECEIPT_KEY);
    assertEqual(purchaseBody.refreshRequired, true);
    assertNoUuid(purchaseBody);

    const scopeInjectionResponse = await handlePlayerBusinessRequest(
      request("/players/me/business/store/quotes", {
        itemKey: "steel_plate",
        quantity: 1,
        idempotencyKey: "business-store-scope-0001",
        gameSessionId: GAME_ID,
      }),
      { kind: "businessStoreQuote" },
      dependencies,
    );
    assertEqual(scopeInjectionResponse.status, 400);
    assertEqual(repository.calls.length, 2);
  },
);

class CapturingRepository implements PlayerBusinessRepository {
  readonly calls: Array<{
    readonly command: string;
    readonly args: Readonly<Record<string, unknown>>;
  }> = [];

  readBusiness(_input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessSnapshotDto> {
    return Promise.reject(
      new Error("readBusiness is not used by Business Store tests."),
    );
  }

  execute(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    this.calls.push({ command, args });
    if (command === "create_business_store_quote_v2") {
      return Promise.resolve(quoteRow());
    }
    if (command === "purchase_business_store_quote_v2") {
      return Promise.resolve(receiptRow());
    }
    return Promise.reject(new Error(`Unexpected command: ${command}`));
  }
}

function quoteRow(): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    quote_key: QUOTE_KEY,
    item_key: "steel_plate",
    item_name: "Steel Plate",
    quantity: 3,
    country_code: "NRC",
    item_currency_code: "NRC",
    settlement_currency_code: "SOLV",
    base_unit_price: 8,
    inflation_multiplier: 1.05,
    location_multiplier: 1.1,
    scarcity_multiplier: 1.08,
    item_local_final_unit_price: 9.98,
    item_local_final_total_price: 29.94,
    exchange_rate: 1.00233801,
    final_unit_price: 10,
    final_total_price: 30.01,
    pricing_version: "store-pricing-v1:country-snapshot:test:1",
    expires_at: "2026-08-21T01:03:00.000Z",
    replayed: false,
  };
}

function receiptRow(): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    receipt_key: RECEIPT_KEY,
    quote_key: QUOTE_KEY,
    item_key: "steel_plate",
    item_name: "Steel Plate",
    quantity: 3,
    final_unit_price: 10,
    final_total_price: 30.01,
    currency_code: "SOLV",
    warehouse_quantity_owned: 8,
    warehouse_average_unit_cost: 9.8765,
    completed_at: "2026-08-21T01:00:01.000Z",
    already_completed: false,
  };
}

function handlerDependencies(repository: CapturingRepository) {
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
      Promise.resolve({
        gameId: GAME_ID,
        playerUuid: PLAYER_ID,
      }),
    createRepository: () => repository,
  };
}

function request(path: string, body: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-player-session-token": "session-token",
    },
    body: JSON.stringify(body),
  });
}

async function assertBusinessError(
  run: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    const candidate = error as { status?: unknown; code?: unknown };
    assertEqual(candidate.status, status);
    assertEqual(candidate.code, code);
    return;
  }
  throw new Error("Expected Business error.");
}

function assertThrows(run: () => unknown): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error("Expected operation to throw.");
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
      .test(serialized)
  ) {
    throw new Error(`Internal UUID leaked: ${serialized}`);
  }
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
