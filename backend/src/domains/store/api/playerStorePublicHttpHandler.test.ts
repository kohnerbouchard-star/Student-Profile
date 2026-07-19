import { handlePlayerStorePublicRequest } from "./playerStorePublicHttpHandler.ts";
import { readPlayerStorePublicRoutePath } from "./playerStorePublicRoutePaths.ts";
import type {
  PlayerStorePublicRepository,
  PlayerStorePublicScope,
} from "../contracts/playerStorePublicContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const QUOTE_KEY = "quote_0123456789abcdef0123456789abcdef";
const RECEIPT_KEY = "receipt_0123456789abcdef0123456789abcdef";

Deno.test("Player Store route parser accepts only reviewed collection paths", () => {
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/items"), { kind: "items" });
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/quotes"), { kind: "quotes" });
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/purchases"), { kind: "purchases" });
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/quote"), null);
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/items/private"), null);
});

Deno.test("Player Store list and quote responses expose public keys only", async () => {
  const repository = new CapturingRepository();
  const listResponse = await handlePlayerStorePublicRequest(
    request("GET", "/players/me/store/items"),
    { kind: "items" },
    dependencies(repository),
  );
  const listBody = await listResponse.json();

  assertEquals(listResponse.status, 200);
  assertEquals(listBody.items[0].itemKey, "field_permit");
  assertNoUuid(listBody);

  const quoteResponse = await handlePlayerStorePublicRequest(
    request("POST", "/players/me/store/quotes", {
      itemKey: "field_permit",
      quantity: 2,
    }),
    { kind: "quotes" },
    dependencies(repository),
  );
  const quoteBody = await quoteResponse.json();

  assertEquals(quoteResponse.status, 200);
  assertEquals(quoteBody.quote.quoteKey, QUOTE_KEY);
  assertEquals(repository.quoteInputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    itemKey: "field_permit",
    quantity: 2,
    nowIso: "2026-07-19T02:00:00.000Z",
  });
  assertNoUuid(quoteBody);
});

Deno.test("Player Store purchase uses session scope and returns public receipt", async () => {
  const repository = new CapturingRepository();
  const response = await handlePlayerStorePublicRequest(
    request("POST", "/players/me/store/purchases", {
      quoteKey: QUOTE_KEY,
      idempotencyKey: "store.test.12345678",
      clientSubmittedAt: "2026-07-19T02:01:00.000Z",
    }),
    { kind: "purchases" },
    dependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.receipt.receiptKey, RECEIPT_KEY);
  assertEquals(body.receipt.itemKey, "field_permit");
  assertEquals(body.refreshRequired, true);
  assertEquals(repository.purchaseInputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    quoteKey: QUOTE_KEY,
    idempotencyKey: "store.test.12345678",
    clientSubmittedAt: "2026-07-19T02:01:00.000Z",
  });
  assertNoUuid(body);
});

Deno.test("Player Store rejects browser-owned scope and unexpected request fields", async () => {
  const repository = new CapturingRepository();
  const bodyScope = await handlePlayerStorePublicRequest(
    request("POST", "/players/me/store/quotes", {
      itemKey: "field_permit",
      quantity: 1,
      gameSessionId: GAME_ID,
    }),
    { kind: "quotes" },
    dependencies(repository),
  );
  const queryScope = await handlePlayerStorePublicRequest(
    request("GET", "/players/me/store/items?gameSessionId=anything"),
    { kind: "items" },
    dependencies(repository),
  );
  const headerScope = await handlePlayerStorePublicRequest(
    request("GET", "/players/me/store/items", undefined, {
      "x-player-id": PLAYER_ID,
    }),
    { kind: "items" },
    dependencies(repository),
  );

  await assertError(bodyScope, 400, "invalid_player_store_request");
  await assertError(queryScope, 400, "invalid_player_store_request");
  await assertError(headerScope, 400, "invalid_player_store_request");
  assertEquals(repository.quoteInputs.length, 0);
});

function dependencies(repository: CapturingRepository) {
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
    resolveScope: () => Promise.resolve({
      gameId: GAME_ID,
      playerUuid: PLAYER_ID,
      playerSessionId: "00000000-0000-4000-8000-000000000003",
      sessionTokenHash: "hash",
    }),
    createRepository: () => repository,
    now: () => "2026-07-19T02:00:00.000Z",
  };
}

function request(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Request {
  const headers = new Headers({
    "x-player-session-token": "player-token",
    ...extraHeaders,
  });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
}

class CapturingRepository implements PlayerStorePublicRepository {
  readonly quoteInputs: unknown[] = [];
  readonly purchaseInputs: unknown[] = [];

  listItems(_scope: PlayerStorePublicScope) {
    return Promise.resolve([{
      itemKey: "field_permit",
      name: "Field Permit",
      description: "Access permit",
      category: "license",
      price: 50,
      currencyCode: "NRC",
      stockQuantity: 10,
      status: "active" as const,
      visibility: "visible" as const,
      sortOrder: 1,
      updatedAt: "2026-07-19T01:59:00.000Z",
    }]);
  }

  createQuote(input: any) {
    this.quoteInputs.push(input);
    return Promise.resolve({
      quoteKey: QUOTE_KEY,
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
      expiresAt: "2026-07-19T02:03:00.000Z",
      pricingVersion: "store-pricing-v1",
    });
  }

  purchase(input: any) {
    this.purchaseInputs.push(input);
    return Promise.resolve({
      receiptKey: RECEIPT_KEY,
      quoteKey: QUOTE_KEY,
      itemKey: "field_permit",
      itemName: "Field Permit",
      quantity: 2,
      finalUnitPrice: 50,
      finalTotalPrice: 100,
      currencyCode: "NRC",
      inventoryQuantityOwned: 2,
      completedAt: "2026-07-19T02:01:01.000Z",
      alreadyCompleted: false,
    });
  }

  listPurchases(_input: any) {
    return Promise.resolve([]);
  }
}

async function assertError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
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
