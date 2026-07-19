export const PLAYER_STORE_ITEM_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/u;
export const PLAYER_STORE_QUOTE_KEY_PATTERN = /^quote_[a-f0-9]{32}$/u;
export const PLAYER_STORE_RECEIPT_KEY_PATTERN = /^receipt_[a-f0-9]{32}$/u;

export interface PlayerStorePublicItemDto {
  readonly itemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly price: number;
  readonly currencyCode: string;
  readonly stockQuantity: number;
  readonly status: "active";
  readonly visibility: "visible";
  readonly sortOrder: number;
  readonly updatedAt: string;
}

export interface PlayerStorePublicQuoteDto {
  readonly quoteKey: string;
  readonly itemKey: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly baseUnitPrice: number;
  readonly inflationMultiplier: number;
  readonly locationMultiplier: number;
  readonly scarcityMultiplier: number;
  readonly discountAmount: number;
  readonly finalUnitPrice: number;
  readonly finalTotalPrice: number;
  readonly currencyCode: string;
  readonly itemCurrencyCode: string;
  readonly playerCurrencyCode: string;
  readonly exchangeRate: number;
  readonly itemLocalFinalUnitPrice: number;
  readonly itemLocalFinalTotalPrice: number;
  readonly expiresAt: string;
  readonly pricingVersion: string;
}

export interface PlayerStorePublicReceiptDto {
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly itemKey: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly finalUnitPrice: number;
  readonly finalTotalPrice: number;
  readonly currencyCode: string;
  readonly inventoryQuantityOwned: number;
  readonly completedAt: string;
  readonly alreadyCompleted: boolean;
}

export interface PlayerStorePublicPurchaseHistoryItemDto {
  readonly receiptKey: string;
  readonly quoteKey: string | null;
  readonly itemKey: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly finalTotalPrice: number;
  readonly currencyCode: string;
  readonly status: "COMPLETED" | "FAILED" | "REVERSED";
  readonly createdAt: string;
}

export interface PlayerStorePublicScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface PlayerStorePublicRepository {
  listItems(
    scope: PlayerStorePublicScope,
  ): Promise<readonly PlayerStorePublicItemDto[]>;
  createQuote(
    input: PlayerStorePublicScope & {
      readonly itemKey: string;
      readonly quantity: number;
      readonly nowIso: string;
    },
  ): Promise<PlayerStorePublicQuoteDto>;
  purchase(
    input: PlayerStorePublicScope & {
      readonly quoteKey: string;
      readonly idempotencyKey: string;
      readonly clientSubmittedAt: string | null;
    },
  ): Promise<PlayerStorePublicReceiptDto>;
  listPurchases(
    input: PlayerStorePublicScope & { readonly limit: number },
  ): Promise<readonly PlayerStorePublicPurchaseHistoryItemDto[]>;
}

export class PlayerStorePublicError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerStorePublicError";
  }
}
