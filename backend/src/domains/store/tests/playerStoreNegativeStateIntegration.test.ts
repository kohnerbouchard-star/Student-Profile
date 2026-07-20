import { handlePlayerStorePublicRequest } from "../api/playerStorePublicHttpHandler.ts";
import { SupabasePlayerStorePublicRepository } from "../infrastructure/supabasePlayerStorePublicRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const QUOTE_KEY = "quote_11111111111111111111111111111111";
const RECEIPT_KEY = "receipt_22222222222222222222222222222222";
const IDEMPOTENCY_KEY = "store.negative.12345678";

const FAILURE_CASES = [
  {
    rpcError: "QUOTE_EXPIRED",
    status: 409,
    code: "store_quote_expired",
    retryable: false,
  },
  {
    rpcError: "INSUFFICIENT_BALANCE",
    status: 409,
    code: "store_insufficient_balance",
    retryable: false,
  },
  {
    rpcError: "INSUFFICIENT_STOCK",
    status: 409,
    code: "store_insufficient_stock",
    retryable: false,
  },
  {
    rpcError: "IDEMPOTENCY_CONFLICT",
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
    assertEquals(client.calls[0].functionName, "purchase_quoted_store_item_public_v1");
    assertEquals(client.calls[0].args, {
      p_game_session_id: GAME_ID,
      p_player_id: PLAYER_ID,
      p_quote_key: QUOTE_KEY,
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_client_submitted_at: "2026-07-19T03:15:00.000Z",
      p_request_metadata: {
        route: "players.me.store.purchases.public.v1",
      },
    });
    assertNoUuid(body);
  }
});

Deno.test("Player Store preserves an authoritative completed replay response", async () => {
  const client = new PublicPurchaseClient(null, [{
    receipt_key: RECEIPT_KEY,
    quote_key: QUOTE_KEY,
    item_key: "field_permit",
    item_name: "Field Permit",
    quantity: 2,
    final_unit_price: 50,
    final_total_price: 100,
    currency_code: "NRC",
    inventory_quantity_owned: 2,
    completed_at: "2026-07-19T03:15:01.000Z",
    already_completed: true,
  }]);
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
    private readonly rows: unknown[] | null = null,
  ) {}

  from(_table: string): never {
    throw new Error("Negative-state purchase tests must not query a browser-owned scope.");
  }

  rpc(functionName: string, args: Record<string, unknown>) {
    this.calls.push({ functionName, args });
    return Promise.resolve({
      data: this.errorMessage ? null : this.rows,
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
    resolveScope: () => Promise.resolve({
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
    createRepository: () =>
      new SupabasePlayerStorePublicRepository(client as never),
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
      clientSubmittedAt: "2026-07-19T03:15:00.000Z",
    }),
  });
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) {
    throw new Error(`Player Store response leaked an internal UUID: ${serialized}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
