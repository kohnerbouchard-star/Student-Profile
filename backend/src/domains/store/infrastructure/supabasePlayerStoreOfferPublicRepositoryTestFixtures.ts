import { PlayerStorePublicError } from "../contracts/playerStorePublicContracts.ts";

export const GAME_ID = "11111111-1111-4111-8111-111111111111";
export const BUYER_ID = "22222222-2222-4222-8222-222222222222";
export const SELLER_ID = "33333333-3333-4333-8333-333333333333";
export const COUNTRY_PROFILE_ID = "44444444-4444-4444-8444-444444444444";
export const INVENTORY_ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
export const GAME_ITEM_ID = "66666666-6666-4666-8666-666666666666";
export const BUSINESS_ID = "77777777-7777-4777-8777-777777777777";
export const BUSINESS_PARTY_KEY = `pty_${"a".repeat(32)}`;
export const SEEDED_PARTY_KEY = `pty_${"b".repeat(32)}`;
export const NPC_PARTY_KEY = `pty_${"6".repeat(32)}`;
export const BUSINESS_KEY = `biz_${"c".repeat(32)}`;
export const BUSINESS_OFFER_KEY = `sof_${"d".repeat(32)}`;
export const SEEDED_OFFER_KEY = `sof_${"e".repeat(32)}`;
export const NPC_OFFER_KEY = `sof_${"7".repeat(32)}`;
export const CATALOG_ITEM_KEY = `itm_${"f".repeat(32)}`;
export const QUOTE_KEY = `quote_${"1".repeat(32)}`;
export const RECEIPT_KEY = `spr_${"2".repeat(32)}`;

export interface FakeClientOptions {
  readonly rpc?: Readonly<Record<string, unknown>>;
  readonly rpcErrors?: Readonly<Record<string, string>>;
  readonly identities?: readonly BusinessIdentityFixture[];
  readonly receipt?: Record<string, unknown> | null;
  readonly offerState?: Record<string, unknown> | null;
  readonly countryAssignment?: Record<string, unknown> | null;
  readonly countryProfile?: Record<string, unknown> | null;
  readonly offerCustody?: readonly Record<string, unknown>[];
  readonly holdingReservations?: readonly Record<string, unknown>[];
  readonly ownershipPositions?: readonly Record<string, unknown>[];
}

export interface BusinessIdentityFixture {
  readonly public_key: string;
  readonly business: {
    readonly id: string;
    readonly public_key: string;
    readonly legal_name: string;
    readonly owner_player_id: string;
    readonly status: "active" | "restructuring" | "distressed" | "closed";
    readonly currency_code: string;
  };
}

export class FakeClient {
  readonly rpcCalls: Array<{
    functionName: string;
    args: Record<string, unknown>;
  }> = [];
  readonly queries: FakeQuery[] = [];

  constructor(private readonly options: FakeClientOptions) {}

  rpc<T = unknown>(functionName: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ functionName, args });
    const message = this.options.rpcErrors?.[functionName];
    return Promise.resolve({
      data: message ? null : (this.options.rpc?.[functionName] ?? null) as T,
      error: message ? { message } : null,
    });
  }

  from(table: string) {
    const query = new FakeQuery(this, table);
    this.queries.push(query);
    return query;
  }

  response(query: FakeQuery): { data: unknown; error: null } {
    const table = query.table;
    if (table === "economic_parties") {
      return { data: this.options.identities ?? [], error: null };
    }
    if (table === "store_offer_purchase_receipts") {
      return { data: this.options.receipt ?? null, error: null };
    }
    if (table === "store_seller_offers") {
      if (query.selection === "status,version") {
        return { data: this.options.offerState ?? null, error: null };
      }
      return {
        data: this.options.offerCustody ?? [{
          public_key: BUSINESS_OFFER_KEY,
          inventory_account_id: INVENTORY_ACCOUNT_ID,
          game_item_id: GAME_ITEM_ID,
        }],
        error: null,
      };
    }
    if (table === "player_country_assignments") {
      return {
        data: this.options.countryAssignment === undefined
          ? { country_profile_id: COUNTRY_PROFILE_ID }
          : this.options.countryAssignment,
        error: null,
      };
    }
    if (table === "country_profiles") {
      return {
        data: this.options.countryProfile === undefined
          ? { currency_code: "ECO" }
          : this.options.countryProfile,
        error: null,
      };
    }
    if (table === "inventory_holdings") {
      return {
        data: this.options.holdingReservations ?? [{
          inventory_account_id: INVENTORY_ACCOUNT_ID,
          game_item_id: GAME_ITEM_ID,
          quantity_reserved: "0.0000",
        }],
        error: null,
      };
    }
    if (table === "business_ownership_positions") {
      return { data: this.options.ownershipPositions ?? [], error: null };
    }
    throw new Error(`Unexpected fake table ${table}`);
  }
}

interface FakeQueryResponse {
  readonly data: unknown;
  readonly error: null;
}

export class FakeQuery implements PromiseLike<FakeQueryResponse> {
  selection = "";
  readonly filters: Array<[string, unknown]> = [];
  readonly inFilters: Array<[string, readonly unknown[]]> = [];

  constructor(
    private readonly client: FakeClient,
    readonly table: string,
  ) {}

  select(selection: string) {
    this.selection = selection;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.inFilters.push([column, values]);
    return this;
  }

  maybeSingle() {
    return this;
  }

  then<TResult1 = FakeQueryResponse, TResult2 = never>(
    onfulfilled?:
      | (
        (value: FakeQueryResponse) => TResult1 | PromiseLike<TResult1>
      )
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.client.response(this)).then(
      onfulfilled,
      onrejected,
    );
  }
}

export function businessIdentity(
  overrides: {
    readonly ownerPlayerId?: string;
    readonly status?: "active" | "restructuring" | "distressed" | "closed";
    readonly currencyCode?: string;
  } = {},
): BusinessIdentityFixture {
  return {
    public_key: BUSINESS_PARTY_KEY,
    business: {
      id: BUSINESS_ID,
      public_key: BUSINESS_KEY,
      legal_name: "Orchard Works",
      owner_player_id: overrides.ownerPlayerId ?? SELLER_ID,
      status: overrides.status ?? "active",
      currency_code: overrides.currencyCode ?? "ECO",
    },
  };
}

export function catalogGroup() {
  return {
    catalog_item_key: CATALOG_ITEM_KEY,
    canonical_item_key: "curriculum.apple",
    store_item_key: "apple",
    name: "Apple",
    description: "A canonical apple.",
    category: "food",
    currency_code: "ECO",
    best_unit_price: 5,
    total_available_quantity: 35,
    seller_count: 3,
    offer_count: 3,
    offers: [
      {
        offerKey: BUSINESS_OFFER_KEY,
        sellerKey: BUSINESS_PARTY_KEY,
        sellerKind: "business",
        sellerName: "Orchard Works",
        unitPrice: 5,
        currencyCode: "ECO",
        availableQuantity: 10,
        status: "active",
        version: 3,
      },
      {
        offerKey: SEEDED_OFFER_KEY,
        sellerKey: SEEDED_PARTY_KEY,
        sellerKind: "seeded",
        sellerName: "Econovaria Store",
        unitPrice: 6,
        currencyCode: "ECO",
        availableQuantity: 20,
        status: "active",
        version: 1,
      },
      {
        offerKey: NPC_OFFER_KEY,
        sellerKey: NPC_PARTY_KEY,
        sellerKind: "npc",
        sellerName: "Market Bot",
        unitPrice: 7,
        currencyCode: "ECO",
        availableQuantity: 5,
        status: "active",
        version: 2,
      },
    ],
    updated_at: "2026-08-25T01:00:00.000Z",
  };
}

export function quoteResult() {
  return {
    quoteKey: QUOTE_KEY,
    quoteStatus: "created",
    offerKey: BUSINESS_OFFER_KEY,
    offerVersion: 3,
    businessKey: BUSINESS_KEY,
    sellerPartyKey: BUSINESS_PARTY_KEY,
    catalogItemKey: CATALOG_ITEM_KEY,
    canonicalItemKey: "curriculum.apple",
    storeItemKey: "apple",
    inventoryAccountKey: `iac_${"3".repeat(32)}`,
    buyerCountryCode: "KOR",
    quantity: 2,
    availableQuantityAtQuote: 10,
    sellerUnitPrice: 5,
    finalUnitPrice: 5,
    sellerTotalPrice: 10,
    finalTotalPrice: 10,
    sellerCurrencyCode: "ECO",
    buyerCurrencyCode: "ECO",
    exchangeRate: 1,
    pricingVersion: "business-offer-fixed-price-v2",
    createdAt: "2026-08-25T01:00:00.000Z",
    expiresAt: "2026-08-25T01:02:00.000Z",
    replayed: false,
  };
}

export function settlementResult(replayed: boolean) {
  return {
    receiptKey: RECEIPT_KEY,
    quoteKey: QUOTE_KEY,
    offerKey: BUSINESS_OFFER_KEY,
    businessKey: BUSINESS_KEY,
    sellerPartyKey: BUSINESS_PARTY_KEY,
    catalogItemKey: CATALOG_ITEM_KEY,
    canonicalItemKey: "curriculum.apple",
    storeItemKey: "apple",
    buyerInventoryAccountKey: `iac_${"4".repeat(32)}`,
    inventoryTransactionKey: `itx_${"5".repeat(32)}`,
    quantity: 2,
    unitPrice: 5,
    totalPrice: 10,
    currencyCode: "ECO",
    buyerDebit: 10,
    businessCredit: 10,
    grossRevenue: 10,
    costOfGoodsSold: 4,
    grossMargin: 6,
    sourceUnitCost: 2,
    costCurrencyCode: "ECO",
    offerVersionBefore: 3,
    offerVersionAfter: 4,
    remainingListedQuantity: 8,
    completedAt: "2026-08-25T01:00:30.000Z",
    replayed,
  };
}

export function receiptRow() {
  return {
    public_key: RECEIPT_KEY,
    quote_key: QUOTE_KEY,
    offer_key: BUSINESS_OFFER_KEY,
    business_key: BUSINESS_KEY,
    seller_party_key: BUSINESS_PARTY_KEY,
    catalog_item_key: CATALOG_ITEM_KEY,
    canonical_item_key: "curriculum.apple",
    store_item_key: "apple",
    inventory_transaction_key: `itx_${"5".repeat(32)}`,
    quantity: 2,
    unit_price: "5.0000",
    total_price: "10.0000",
    business_credit: "10.0000",
    currency_code: "ECO",
    offer_version_before: 3,
    offer_version_after: 4,
    remaining_listed_quantity: 8,
    completed_at: "2026-08-25T01:00:30.000Z",
  };
}

export function expectedPublicReceipt(alreadyCompleted: boolean) {
  return {
    receiptKey: RECEIPT_KEY,
    quoteKey: QUOTE_KEY,
    offerKey: BUSINESS_OFFER_KEY,
    businessKey: BUSINESS_KEY,
    businessName: "Orchard Works",
    sellerPartyKey: BUSINESS_PARTY_KEY,
    sellerName: "Orchard Works",
    catalogItemKey: CATALOG_ITEM_KEY,
    canonicalItemKey: "curriculum.apple",
    storeItemKey: "apple",
    inventoryTransactionKey: `itx_${"5".repeat(32)}`,
    quantity: 2,
    unitPrice: 5,
    totalPrice: 10,
    sellerProceeds: 10,
    currencyCode: "ECO",
    offerVersionBefore: 3,
    offerVersionAfter: 4,
    remainingListedQuantity: 8,
    completedAt: "2026-08-25T01:00:30.000Z",
    alreadyCompleted,
  };
}

export function assertPrivateFieldsAbsent(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (
    const forbidden of [
      "gameSessionId",
      "playerId",
      "ownerPlayerId",
      "businessStatus",
      "inventoryAccountKey",
      "buyerInventoryAccountKey",
      "buyerDebit",
      "businessCredit",
      "grossRevenue",
      "costOfGoodsSold",
      "grossMargin",
      "sourceUnitCost",
      "costCurrencyCode",
    ]
  ) {
    if (serialized.includes(forbidden)) {
      throw new Error(
        `Public projection contains forbidden field ${forbidden}`,
      );
    }
  }
  assertEquals(serialized.includes(GAME_ID), false);
  assertEquals(serialized.includes(BUYER_ID), false);
  assertEquals(serialized.includes(SELLER_ID), false);
  assertEquals(serialized.includes(BUSINESS_ID), false);
  assertEquals(serialized.includes(INVENTORY_ACCOUNT_ID), false);
  assertEquals(serialized.includes(GAME_ITEM_ID), false);
}

export async function captureError(
  run: () => Promise<unknown>,
): Promise<Error> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error("Expected an Error instance.");
  }
  throw new Error("Expected operation to reject.");
}

export function assertPublicError(
  error: Error,
  code: string,
  status: number,
): asserts error is PlayerStorePublicError {
  if (!(error instanceof PlayerStorePublicError)) {
    throw new Error(`Expected PlayerStorePublicError, received ${error.name}`);
  }
  assertEquals(error.code, code);
  assertEquals(error.status, status);
  assertEquals(error.retryable, false);
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
