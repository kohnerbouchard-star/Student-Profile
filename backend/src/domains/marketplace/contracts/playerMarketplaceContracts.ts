export const MARKETPLACE_LISTING_KEY_PATTERN = /^lst_[0-9a-f]{32}$/;
export const MARKETPLACE_RESERVATION_KEY_PATTERN = /^mpr_[0-9a-f]{32}$/;
export const MARKETPLACE_ORDER_KEY_PATTERN = /^ord_[0-9a-f]{32}$/;
export const MARKETPLACE_DISPUTE_KEY_PATTERN = /^dsp_[0-9a-f]{32}$/;
export const MARKETPLACE_ITEM_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const MARKETPLACE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

export type PlayerMarketplaceListingStatus =
  | "draft"
  | "active"
  | "moderation_hold"
  | "sold_out"
  | "cancelled"
  | "expired"
  | "rejected";
export type PlayerMarketplaceReservationStatus =
  | "reserved"
  | "settling"
  | "settled"
  | "released"
  | "expired";
export type PlayerMarketplaceOrderStatus =
  | "settling"
  | "completed"
  | "disputed"
  | "refunded";
export type PlayerMarketplaceDisputeStatus =
  | "open"
  | "resolved_buyer"
  | "resolved_seller"
  | "rejected";

export interface PlayerMarketplaceScope {
  readonly gameId: string;
  readonly playerUuid: string;
}

export interface PlayerMarketplacePolicyDto {
  readonly marketplaceEnabled: boolean;
  readonly crossCountryTradingEnabled: boolean;
  readonly moderationRequired: boolean;
  readonly feeRate: number;
  readonly taxRate: number;
  readonly listingDurationHours: number;
  readonly purchaseReservationMinutes: number;
  readonly disputeWindowDays: number;
  readonly disputesEnabled: boolean;
}

export interface PlayerMarketplaceListingDto {
  readonly id: string;
  readonly itemId: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly image: string | null;
  readonly country: string;
  readonly condition: "New" | "Like New" | "Used" | "Damaged";
  readonly seller: string;
  readonly sellerReference: string | null;
  readonly unitPrice: number;
  readonly currencyCode: string;
  readonly quantity: number;
  readonly status: PlayerMarketplaceListingStatus;
  readonly version: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly moderationReason: string | null;
  readonly mine: boolean;
}

export interface PlayerMarketplaceReservationDto {
  readonly id: string;
  readonly listingId: string;
  readonly quantity: number;
  readonly total: number;
  readonly currencyCode: string;
  readonly status: PlayerMarketplaceReservationStatus;
  readonly version: number;
  readonly expiresAt: string;
  readonly releaseReason: string | null;
}

export interface PlayerMarketplaceOrderDto {
  readonly id: string;
  readonly reservationId: string;
  readonly listingId: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly feeAmount: number;
  readonly taxAmount: number;
  readonly total: number;
  readonly sellerProceeds: number;
  readonly currencyCode: string;
  readonly status: PlayerMarketplaceOrderStatus;
  readonly version: number;
  readonly role: "buyer" | "seller";
  readonly completedAt: string | null;
  readonly refundedAt: string | null;
}

export interface PlayerMarketplaceDisputeDto {
  readonly id: string;
  readonly orderId: string;
  readonly reason: string;
  readonly status: PlayerMarketplaceDisputeStatus;
  readonly version: number;
  readonly resolutionNote: string | null;
  readonly openedAt: string;
  readonly resolvedAt: string | null;
}

export interface PlayerMarketplaceSnapshotDto {
  readonly policy: PlayerMarketplacePolicyDto;
  readonly listings: readonly PlayerMarketplaceListingDto[];
  readonly myListings: readonly PlayerMarketplaceListingDto[];
  readonly reservations: readonly PlayerMarketplaceReservationDto[];
  readonly orders: readonly PlayerMarketplaceOrderDto[];
  readonly disputes: readonly PlayerMarketplaceDisputeDto[];
  readonly summary: {
    readonly listingCount: number;
    readonly activeSellers: number;
    readonly volume: number;
  };
}

export interface CreateMarketplaceListingInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly itemKey: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currencyCode: string;
  readonly condition: "New" | "Like New" | "Used" | "Damaged";
  readonly durationHours: number | null;
  readonly idempotencyKey: string;
}
export interface ActivateMarketplaceListingInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly listingKey: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}
export interface PurchaseMarketplaceListingInput extends ActivateMarketplaceListingInput {
  readonly quantity: number;
}
export interface CancelMarketplaceListingInput extends ActivateMarketplaceListingInput {}
export interface OpenMarketplaceDisputeInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly orderKey: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface MarketplaceCommittedResult {
  readonly outcome: "applied" | "replayed";
  readonly targetId: string;
  readonly status: string;
  readonly version: number | null;
  readonly committedAt: string | null;
}

export interface PlayerMarketplaceRepository {
  read(scope: PlayerMarketplaceScope): Promise<PlayerMarketplaceSnapshotDto>;
  createListing(input: CreateMarketplaceListingInput): Promise<MarketplaceCommittedResult>;
  activateListing(input: ActivateMarketplaceListingInput): Promise<MarketplaceCommittedResult>;
  purchase(input: PurchaseMarketplaceListingInput): Promise<MarketplaceCommittedResult>;
  cancel(input: CancelMarketplaceListingInput): Promise<MarketplaceCommittedResult>;
  openDispute(input: OpenMarketplaceDisputeInput): Promise<MarketplaceCommittedResult>;
}

export class PlayerMarketplaceError extends Error {
  constructor(
    readonly code:
      | "invalid_player_marketplace_request"
      | "player_marketplace_not_found"
      | "player_marketplace_conflict"
      | "player_marketplace_insufficient_funds"
      | "player_marketplace_disabled"
      | "player_marketplace_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PlayerMarketplaceError";
  }
}

export class PlayerMarketplacePersistenceError extends Error {
  constructor(readonly sourceCode: string, message: string) {
    super(message);
    this.name = "PlayerMarketplacePersistenceError";
  }
}
