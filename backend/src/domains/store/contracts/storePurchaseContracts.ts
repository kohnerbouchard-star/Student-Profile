export type StorePurchaseQuoteStatus = "CREATED" | "USED" | "EXPIRED" | "CANCELLED";
export type StorePurchaseStatus = "COMPLETED" | "FAILED" | "REVERSED";
export type StoreInventoryEventType =
  | "PURCHASED"
  | "USED"
  | "RESERVED"
  | "RELEASED"
  | "ADJUSTED"
  | "REVERSED";

export interface StorePurchasePricingBreakdown {
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
  readonly pricingVersion: string;
}

export interface StorePurchaseQuoteRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly storeItemId: string;
  readonly quantity: number;
  readonly pricing: StorePurchasePricingBreakdown;
  readonly status: StorePurchaseQuoteStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly cancelledAt: string | null;
}

export interface StorePurchaseRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly storeItemId: string;
  readonly quoteId: string | null;
  readonly quantity: number;
  readonly finalUnitPrice: number;
  readonly finalTotalPrice: number;
  readonly currencyCode: string;
  readonly ledgerEntryId: string | null;
  readonly idempotencyKey: string;
  readonly status: StorePurchaseStatus;
  readonly clientSubmittedAt: string | null;
  readonly createdAt: string;
}

export interface InventoryHoldingRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly storeItemId: string;
  readonly quantityOwned: number;
  readonly quantityReserved: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InventoryEventRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly storeItemId: string;
  readonly quantityDelta: number;
  readonly eventType: StoreInventoryEventType;
  readonly sourceDomain: string;
  readonly sourceAction: string;
  readonly sourceId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

export interface StoreQuoteRequestInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly nowIso: string;
}

export interface StorePurchaseRequestInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly quoteId: string;
  readonly idempotencyKey: string;
  readonly clientSubmittedAt: string | null;
  readonly nowIso: string;
}

export interface StorePurchaseHistoryInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly limit?: number | null;
}

export interface StoreQuoteResponseDto {
  readonly quoteId: string;
  readonly itemId: string;
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

export interface StorePurchaseResponseDto {
  readonly message: string;
  readonly purchaseId: string;
  readonly quoteId: string;
  readonly finalTotalPrice: number;
  readonly currencyCode: string;
  readonly refreshRequired: true;
}

export interface StorePurchaseHistoryItemDto {
  readonly purchaseId: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly finalTotalPrice: number;
  readonly currencyCode: string;
  readonly status: StorePurchaseStatus;
  readonly createdAt: string;
}

export interface StorePurchaseRepository {
  readonly createQuote: (
    input: StoreQuoteRequestInput,
  ) => Promise<StorePurchaseQuoteRecord>;
  readonly purchaseQuotedItem: (
    input: StorePurchaseRequestInput,
  ) => Promise<StorePurchaseRecord>;
  readonly listPlayerPurchases: (
    input: StorePurchaseHistoryInput,
  ) => Promise<readonly StorePurchaseHistoryItemDto[]>;
}

export type StorePurchaseRouteResult =
  | StorePurchaseRouteSuccessResult
  | StorePurchaseRouteErrorResult;

export interface StorePurchaseRouteSuccessResult {
  readonly ok: true;
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface StorePurchaseRouteErrorResult {
  readonly ok: false;
  readonly status: number;
  readonly body: {
    readonly error: StorePurchaseErrorBody;
  };
}

export interface StorePurchaseErrorBody {
  readonly code: StorePurchaseErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: unknown;
}

export type StorePurchaseErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "item_not_found"
  | "item_unavailable"
  | "insufficient_stock"
  | "insufficient_balance"
  | "quote_not_found"
  | "quote_expired"
  | "quote_already_used"
  | "idempotency_conflict"
  | "purchase_failed";
