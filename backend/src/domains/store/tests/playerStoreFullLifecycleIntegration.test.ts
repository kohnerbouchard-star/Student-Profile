import { handlePlayerStorePublicRequest } from "../api/playerStorePublicHttpHandler.ts";
import type {
  PlayerStorePublicItemDto,
  PlayerStorePublicPurchaseHistoryItemDto,
  PlayerStorePublicQuoteDto,
  PlayerStorePublicReceiptDto,
  PlayerStorePublicRepository,
} from "../contracts/playerStorePublicContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const QUOTE_KEY = "quote_11111111111111111111111111111111";
const RECEIPT_KEY = "receipt_22222222222222222222222222222222";
const ITEM_KEY = "field_permit";
const IDEMPOTENCY_KEY = "store.lifecycle.12345678";

Deno.test("public Player Store lifecycle settles once and refreshes catalog, receipt, ledger, and inventory state", async () => {
  const repository = new SharedStoreRepository();
  const dependencies = {
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
    now: () => "2026-07-19T03:00:00.000Z",
  };
  const playerBodies: unknown[] = [];

  const catalog = await handlePlayerStorePublicRequest(
    request("GET", "/players/me/store/items"),
    { kind: "items" },
    dependencies,
  );
  const catalogBody = await catalog.json();
  playerBodies.push(catalogBody);
  assertEquals(catalog.status, 200);
  assertEquals(catalogBody.items[0].itemKey, ITEM_KEY);
  assertEquals(catalogBody.items[0].stockQuantity, 5);

  const quote = await handlePlayerStorePublicRequest(
    request("POST", "/players/me/store/quotes", {
      itemKey: ITEM_KEY,
      quantity: 2,
    }),
    { kind: "quotes" },
    dependencies,
  );
  const quoteBody = await quote.json();
  playerBodies.push(quoteBody);
  assertEquals(quote.status, 200);
  assertEquals(quoteBody.quote.quoteKey, QUOTE_KEY);
  assertEquals(quoteBody.quote.finalTotalPrice, 100);
  assertEquals(repository.cashBalance, 500);
  assertEquals(repository.inventoryQuantity, 0);

  const purchase = await handlePlayerStorePublicRequest(
    request("POST", "/players/me/store/purchases", {
      quoteKey: QUOTE_KEY,
      idempotencyKey: IDEMPOTENCY_KEY,
      clientSubmittedAt: "2026-07-19T03:00:30.000Z",
    }),
    { kind: "purchases" },
    dependencies,
  );
  const purchaseBody = await purchase.json();
  playerBodies.push(purchaseBody);
  assertEquals(purchase.status, 200);
  assertEquals(purchaseBody.receipt.receiptKey, RECEIPT_KEY);
  assertEquals(purchaseBody.receipt.alreadyCompleted, false);
  assertEquals(purchaseBody.receipt.inventoryQuantityOwned, 2);
  assertEquals(repository.cashBalance, 400);
  assertEquals(repository.inventoryQuantity, 2);
  assertEquals(repository.items[0].stockQuantity, 3);
  assertEquals(repository.ledgerWrites, 1);
  assertEquals(repository.inventoryEvents, 1);

  const replay = await handlePlayerStorePublicRequest(
    request("POST", "/players/me/store/purchases", {
      quoteKey: QUOTE_KEY,
      idempotencyKey: IDEMPOTENCY_KEY,
      clientSubmittedAt: "2026-07-19T03:00:30.000Z",
    }),
    { kind: "purchases" },
    dependencies,
  );
  const replayBody = await replay.json();
  playerBodies.push(replayBody);
  assertEquals(replay.status, 200);
  assertEquals(replayBody.receipt.receiptKey, RECEIPT_KEY);
  assertEquals(replayBody.receipt.alreadyCompleted, true);
  assertEquals(repository.cashBalance, 400);
  assertEquals(repository.inventoryQuantity, 2);
  assertEquals(repository.items[0].stockQuantity, 3);
  assertEquals(repository.ledgerWrites, 1);
  assertEquals(repository.inventoryEvents, 1);

  const history = await handlePlayerStorePublicRequest(
    request("GET", "/players/me/store/purchases"),
    { kind: "purchases" },
    dependencies,
  );
  const historyBody = await history.json();
  playerBodies.push(historyBody);
  assertEquals(history.status, 200);
  assertEquals(historyBody.purchases.length, 1);
  assertEquals(historyBody.purchases[0].receiptKey, RECEIPT_KEY);
  assertEquals(historyBody.purchases[0].itemKey, ITEM_KEY);

  const refreshedCatalog = await handlePlayerStorePublicRequest(
    request("GET", "/players/me/store/items"),
    { kind: "items" },
    dependencies,
  );
  const refreshedCatalogBody = await refreshedCatalog.json();
  playerBodies.push(refreshedCatalogBody);
  assertEquals(refreshedCatalogBody.items[0].stockQuantity, 3);

  for (const body of playerBodies) assertNoUuid(body);
});

class SharedStoreRepository implements PlayerStorePublicRepository {
  readonly items: PlayerStorePublicItemDto[] = [{
    itemKey: ITEM_KEY,
    name: "Field Permit",
    description: "A permit used for field operations.",
    category: "license",
    price: 50,
    currencyCode: "NRC",
    stockQuantity: 5,
    status: "active",
    visibility: "visible",
    sortOrder: 1,
    updatedAt: "2026-07-19T02:59:00.000Z",
  }];
  cashBalance = 500;
  inventoryQuantity = 0;
  ledgerWrites = 0;
  inventoryEvents = 0;
  private quote: PlayerStorePublicQuoteDto | null = null;
  private receipt: PlayerStorePublicReceiptDto | null = null;
  private purchaseKey = "";

  listItems() {
    return Promise.resolve(this.items.map((item) => ({ ...item })));
  }

  createQuote(input: any): Promise<PlayerStorePublicQuoteDto> {
    const item = this.items.find((candidate) => candidate.itemKey === input.itemKey);
    if (!item) throw new Error("item unavailable");
    this.quote = {
      quoteKey: QUOTE_KEY,
      itemKey: item.itemKey,
      itemName: item.name,
      quantity: input.quantity,
      baseUnitPrice: item.price,
      inflationMultiplier: 1,
      locationMultiplier: 1,
      scarcityMultiplier: 1,
      discountAmount: 0,
      finalUnitPrice: item.price,
      finalTotalPrice: item.price * input.quantity,
      currencyCode: item.currencyCode,
      itemCurrencyCode: item.currencyCode,
      playerCurrencyCode: item.currencyCode,
      exchangeRate: 1,
      itemLocalFinalUnitPrice: item.price,
      itemLocalFinalTotalPrice: item.price * input.quantity,
      expiresAt: "2026-07-19T03:03:00.000Z",
      pricingVersion: "store-pricing-v1",
    };
    return Promise.resolve(this.quote);
  }

  purchase(input: any): Promise<PlayerStorePublicReceiptDto> {
    if (this.receipt && input.idempotencyKey === this.purchaseKey) {
      return Promise.resolve({ ...this.receipt, alreadyCompleted: true });
    }
    if (!this.quote || input.quoteKey !== this.quote.quoteKey) {
      throw new Error("quote not found");
    }
    const item = this.items[0];
    if (item.stockQuantity < this.quote.quantity) throw new Error("stock");
    if (this.cashBalance < this.quote.finalTotalPrice) throw new Error("balance");

    this.cashBalance -= this.quote.finalTotalPrice;
    item.stockQuantity -= this.quote.quantity;
    this.inventoryQuantity += this.quote.quantity;
    this.ledgerWrites += 1;
    this.inventoryEvents += 1;
    this.purchaseKey = input.idempotencyKey;
    this.receipt = {
      receiptKey: RECEIPT_KEY,
      quoteKey: QUOTE_KEY,
      itemKey: ITEM_KEY,
      itemName: item.name,
      quantity: this.quote.quantity,
      finalUnitPrice: this.quote.finalUnitPrice,
      finalTotalPrice: this.quote.finalTotalPrice,
      currencyCode: this.quote.currencyCode,
      inventoryQuantityOwned: this.inventoryQuantity,
      completedAt: "2026-07-19T03:00:31.000Z",
      alreadyCompleted: false,
    };
    return Promise.resolve(this.receipt);
  }

  listPurchases(): Promise<readonly PlayerStorePublicPurchaseHistoryItemDto[]> {
    if (!this.receipt) return Promise.resolve([]);
    return Promise.resolve([{
      receiptKey: this.receipt.receiptKey,
      quoteKey: this.receipt.quoteKey,
      itemKey: this.receipt.itemKey,
      itemName: this.receipt.itemName,
      quantity: this.receipt.quantity,
      finalTotalPrice: this.receipt.finalTotalPrice,
      currencyCode: this.receipt.currencyCode,
      status: "COMPLETED",
      createdAt: this.receipt.completedAt,
    }]);
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
