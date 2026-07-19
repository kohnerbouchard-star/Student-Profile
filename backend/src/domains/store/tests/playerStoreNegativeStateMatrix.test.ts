import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { handlePlayerStorePublicRequest } from "../api/playerStorePublicHttpHandler.ts";
import type {
  PlayerStorePublicPurchaseHistoryItemDto,
  PlayerStorePublicReceiptDto,
  PlayerStorePublicRepository,
  PlayerStorePublicScope,
} from "../contracts/playerStorePublicContracts.ts";
import { SupabasePlayerStorePublicRepository } from "../infrastructure/supabasePlayerStorePublicRepository.ts";

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
  "../../../../supabase/migrations/20260624084500_add_store_country_currency_purchase_fields_v1.sql",
  import.meta.url,
);
const SESSION_HELPERS = new URL(
  "../../players/api/playerSessionHttpHelpers.ts",
  import.meta.url,
);

Deno.test("Store settlement source enforces quote expiry, stock, balance, and idempotency guards", async () => {
  const source = await Deno.readTextFile(SETTLEMENT_MIGRATION);
  for (const fragment of [
    "RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'",
    "IF v_idempotency.status = 'COMPLETED' THEN",
    "IF v_quote.expires_at <= v_now THEN",
    "RAISE EXCEPTION 'QUOTE_EXPIRED'",
    "IF v_item.stock_quantity < v_quote.quantity THEN",
    "RAISE EXCEPTION 'INSUFFICIENT_STOCK'",
    "IF NOT FOUND OR v_balance.balance < v_quote.final_total_price THEN",
    "RAISE EXCEPTION 'INSUFFICIENT_BALANCE'",
  ]) {
    assertEquals(source.includes(fragment), true);
  }
});

Deno.test("Player session resolution rejects paused and ended games before Store repository work", async () => {
  const source = await Deno.readTextFile(SESSION_HELPERS);
  assertEquals(source.includes('.from("game_sessions")'), true);
  assertEquals(source.includes('.eq("status", "active")'), true);

  for (const gameStatus of ["paused", "ended"]) {
    const repository = new CountingRepository();
    const response = await handlePlayerStorePublicRequest(
      request("POST", "/players/me/store/purchases", purchaseBody()),
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

Deno.test("Player Store maps authoritative purchase failures to stable public errors", async () => {
  const cases = [
    ["QUOTE_EXPIRED", "store_quote_expired", false],
    ["INSUFFICIENT_STOCK", "store_insufficient_stock", false],
    ["INSUFFICIENT_BALANCE", "store_insufficient_balance", false],
    ["IDEMPOTENCY_CONFLICT", "store_idempotency_conflict", false],
    ["IDEMPOTENCY_IN_PROGRESS", "store_purchase_in_progress", true],
  ] as const;

  for (const [rpcMessage, expectedCode, retryable] of cases) {
    const repository = new SupabasePlayerStorePublicRepository(
      errorClient(rpcMessage) as never,
    );
    const response = await handlePlayerStorePublicRequest(
      request("POST", "/players/me/store/purchases", purchaseBody()),
      { kind: "purchases" },
      dependencies(repository),
    );

    await assertError(response, 409, expectedCode, retryable);
  }
});

Deno.test("Duplicate Store request replays one receipt without duplicate economic writes", async () => {
  const repository = new ReplayRepository();
  const first = await handlePlayerStorePublicRequest(
    request("POST", "/players/me/store/purchases", purchaseBody()),
    { kind: "purchases" },
    dependencies(repository),
  );
  const replay = await handlePlayerStorePublicRequest(
    request("POST", "/players/me/store/purchases", purchaseBody()),
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

function purchaseBody() {
  return {
    quoteKey: QUOTE_KEY,
    idempotencyKey: IDEMPOTENCY_KEY,
    clientSubmittedAt: "2026-07-19T04:00:00.000Z",
  };
}

function dependencies(repository: PlayerStorePublicRepository) {
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

function errorClient(message: string) {
  return {
    rpc: () => Promise.resolve({ data: null, error: { message } }),
    from: () => {
      throw new Error("Unexpected table query in purchase error test.");
    },
  };
}

class CountingRepository implements PlayerStorePublicRepository {
  purchaseCalls = 0;

  listItems(_scope: PlayerStorePublicScope) {
    return Promise.resolve([]);
  }

  createQuote(_input: any) {
    return Promise.reject(new Error("Not used."));
  }

  purchase(_input: any) {
    this.purchaseCalls += 1;
    return Promise.reject(new Error("Store purchase must not run."));
  }

  listPurchases(
    _input: PlayerStorePublicScope & { readonly limit: number },
  ): Promise<readonly PlayerStorePublicPurchaseHistoryItemDto[]> {
    return Promise.resolve([]);
  }
}

class ReplayRepository extends CountingRepository {
  economicWrites = 0;
  private receipt: PlayerStorePublicReceiptDto | null = null;

  override purchase(_input: any): Promise<PlayerStorePublicReceiptDto> {
    this.purchaseCalls += 1;
    if (this.receipt) {
      return Promise.resolve({ ...this.receipt, alreadyCompleted: true });
    }
    this.economicWrites += 1;
    this.receipt = {
      receiptKey: RECEIPT_KEY,
      quoteKey: QUOTE_KEY,
      itemKey: "field_permit",
      itemName: "Field Permit",
      quantity: 1,
      finalUnitPrice: 50,
      finalTotalPrice: 50,
      currencyCode: "NRC",
      inventoryQuantityOwned: 1,
      completedAt: "2026-07-19T04:00:01.000Z",
      alreadyCompleted: false,
    };
    return Promise.resolve(this.receipt);
  }
}

function request(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({ "x-player-session-token": "player-token" });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
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
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) {
    throw new Error(`Player Store negative-state response leaked an internal UUID: ${serialized}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
