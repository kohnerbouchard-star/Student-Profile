import type {
  PlayerStoreOfferPublicRepository,
  PlayerStoreOfferPublicScope,
} from "../contracts/playerStoreOfferPublicContracts.ts";
import type {
  PlayerStorePublicRepository,
  PlayerStorePublicScope,
} from "../contracts/playerStorePublicContracts.ts";

export const GAME_ID = "00000000-0000-4000-8000-000000000001";
export const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
export const QUOTE_KEY = "quote_0123456789abcdef0123456789abcdef";
export const RECEIPT_KEY = "receipt_0123456789abcdef0123456789abcdef";
export const OFFER_KEY = "sof_0123456789abcdef0123456789abcdef";
export const OFFER_RECEIPT_KEY = "spr_0123456789abcdef0123456789abcdef";
export const BUSINESS_KEY = "biz_0123456789abcdef0123456789abcdef";
export const SELLER_PARTY_KEY = "pty_0123456789abcdef0123456789abcdef";
export const CATALOG_ITEM_KEY = "itm_0123456789abcdef0123456789abcdef";

export function createPlayerStoreHandlerDependencies(
  repository: PlayerStorePublicRepository,
  offerRepository: PlayerStoreOfferPublicRepository =
    new CapturingOfferRepository(),
) {
  return {
    createServiceClient: () => ({} as never),
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "test-anon-key",
        supabaseServiceRoleKey: "test-service-key",
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
    createRepository: () => repository,
    createOfferRepository: () => offerRepository,
    now: () => "2026-07-19T02:00:00.000Z",
  };
}

export function validOfferQuoteBody(): Record<string, unknown> {
  return {
    offerKey: OFFER_KEY,
    quantity: 2,
    expectedVersion: 7,
    idempotencyKey: "store.offer.quote.12345678",
  };
}

export function createPlayerStoreRequest(
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

export class CapturingRepository implements PlayerStorePublicRepository {
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

  createQuote(input: unknown) {
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

  purchase(input: unknown) {
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

  listPurchases(_input: unknown) {
    return Promise.resolve([]);
  }
}

export class CapturingOfferRepository
  implements PlayerStoreOfferPublicRepository {
  readonly productInputs: unknown[] = [];
  readonly quoteInputs: unknown[] = [];
  readonly purchaseInputs: unknown[] = [];
  readonly receiptInputs: unknown[] = [];
  quoteError: unknown = null;

  listOfferProducts(scope: PlayerStoreOfferPublicScope) {
    this.productInputs.push(scope);
    return Promise.resolve([{
      catalogItemKey: CATALOG_ITEM_KEY,
      canonicalItemKey: "field_permit",
      storeItemKey: "field_permit",
      name: "Field Permit",
      description: "Access permit",
      category: "license",
      currencyCode: "NRC",
      bestOfferKey: OFFER_KEY,
      bestUnitPrice: 45,
      totalAvailableQuantity: 7,
      sellerCount: 2,
      offerCount: 3,
      offers: [{
        offerKey: OFFER_KEY,
        sellerKind: "business" as const,
        sellerPartyKey: SELLER_PARTY_KEY,
        sellerName: "North Field Supply",
        businessKey: BUSINESS_KEY,
        businessName: "North Field Supply",
        unitPrice: 45,
        currencyCode: "NRC",
        availableQuantity: 4,
        status: "active" as const,
        purchasability: "business_offer" as const,
        purchasable: true,
        version: 7,
        inventoryAccountKey: GAME_ID,
      }, {
        offerKey: `sof_${"1".repeat(32)}`,
        sellerKind: "seeded" as const,
        sellerPartyKey: `pty_${"1".repeat(32)}`,
        sellerName: "Econovaria Store",
        businessKey: null,
        businessName: null,
        unitPrice: 50,
        currencyCode: "NRC",
        availableQuantity: 3,
        status: "active" as const,
        purchasability: "seeded_offer" as const,
        purchasable: true,
        version: 2,
      }, {
        offerKey: `sof_${"2".repeat(32)}`,
        sellerKind: "npc" as const,
        sellerPartyKey: `pty_${"2".repeat(32)}`,
        sellerName: "NPC Wholesale",
        businessKey: null,
        businessName: null,
        unitPrice: 55,
        currencyCode: "NRC",
        availableQuantity: 2,
        status: "active" as const,
        purchasability: "unsupported" as const,
        purchasable: false,
        version: 1,
      }],
      updatedAt: "2026-07-19T02:00:00.000Z",
      storeItemId: GAME_ID,
    }]);
  }

  createBusinessOfferQuote(input: unknown) {
    this.quoteInputs.push(input);
    if (this.quoteError) return Promise.reject(this.quoteError);
    return Promise.resolve({
      quoteKey: QUOTE_KEY,
      quoteStatus: "created" as const,
      offerKey: OFFER_KEY,
      offerVersion: 7,
      businessKey: BUSINESS_KEY,
      businessName: "North Field Supply",
      sellerPartyKey: SELLER_PARTY_KEY,
      sellerName: "North Field Supply",
      catalogItemKey: CATALOG_ITEM_KEY,
      canonicalItemKey: "field_permit",
      storeItemKey: "field_permit",
      quantity: 2,
      availableQuantityAtQuote: 4,
      unitPrice: 45,
      totalPrice: 90,
      currencyCode: "NRC",
      expiresAt: "2026-07-19T02:03:00.000Z",
      pricingVersion: "business-offer-fixed-price-v2" as const,
      replayed: false,
      inventoryAccountKey: GAME_ID,
      immutableRequestHash: "private-hash",
    });
  }

  purchaseBusinessOffer(input: unknown) {
    this.purchaseInputs.push(input);
    return Promise.resolve(this.receipt());
  }

  readBusinessOfferReceipt(input: unknown) {
    this.receiptInputs.push(input);
    return Promise.resolve({ ...this.receipt(), alreadyCompleted: true });
  }

  totalCalls(): number {
    return this.productInputs.length + this.quoteInputs.length +
      this.purchaseInputs.length + this.receiptInputs.length;
  }

  private receipt() {
    return {
      receiptKey: OFFER_RECEIPT_KEY,
      quoteKey: QUOTE_KEY,
      offerKey: OFFER_KEY,
      businessKey: BUSINESS_KEY,
      businessName: "North Field Supply",
      sellerPartyKey: SELLER_PARTY_KEY,
      sellerName: "North Field Supply",
      catalogItemKey: CATALOG_ITEM_KEY,
      canonicalItemKey: "field_permit",
      storeItemKey: "field_permit",
      quantity: 2,
      unitPrice: 45,
      totalPrice: 90,
      currencyCode: "NRC",
      offerVersionBefore: 7,
      offerVersionAfter: 8,
      remainingListedQuantity: 2,
      completedAt: "2026-07-19T02:01:01.000Z",
      alreadyCompleted: false,
      buyerInventoryAccountKey: GAME_ID,
      buyerDebitTransactionKey: "private-ledger-key",
      sourceUnitCost: 20,
      costOfGoodsSold: 40,
      grossMargin: 50,
    };
  }
}

export async function assertError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
}

export function assertNoUuid(value: unknown): void {
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

export function assertNoInternalFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (
    const field of [
      "inventoryAccountKey",
      "storeItemId",
      "immutableRequestHash",
      "buyerInventoryAccountKey",
      "buyerDebitTransactionKey",
      "sourceUnitCost",
      "costOfGoodsSold",
      "grossMargin",
    ]
  ) {
    if (serialized.includes(field)) {
      throw new Error(
        `Player Store response leaked internal field ${field}: ${serialized}`,
      );
    }
  }
}

export function assertPrivateNoStore(response: Response): void {
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(
    response.headers.get("vary"),
    "authorization, x-player-session-token",
  );
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
