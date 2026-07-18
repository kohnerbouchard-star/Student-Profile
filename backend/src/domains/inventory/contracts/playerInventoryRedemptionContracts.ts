export type PlayerInventoryRedemptionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "fulfilled";

export type PlayerInventoryRedemptionRoute =
  | { readonly kind: "request"; readonly itemId: string }
  | { readonly kind: "collection" }
  | { readonly kind: "item"; readonly requestId: string }
  | { readonly kind: "malformed" };

export interface PlayerInventoryRedemptionCommand {
  readonly quantity: number;
  readonly note: string | null;
  readonly idempotencyKey: string;
}

export interface PlayerInventoryRedemptionListQuery {
  readonly status: PlayerInventoryRedemptionStatus | null;
  readonly limit: number;
  readonly offset: number;
}

export interface PlayerInventoryRedemptionDto {
  /** Public red_ identifier. Internal request and holding UUIDs are never serialized. */
  readonly id: string;
  /** Public Store item key. Internal Store UUIDs are never serialized. */
  readonly itemId: string;
  readonly quantity: number;
  readonly status: PlayerInventoryRedemptionStatus;
  readonly requestNote: string | null;
  readonly resolutionNote: string | null;
  readonly requestedAt: string;
  readonly reviewedAt: string | null;
  readonly fulfilledAt: string | null;
  readonly updatedAt: string;
}

export interface PlayerInventoryRedemptionRepository {
  request(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly itemId: string;
    readonly command: PlayerInventoryRedemptionCommand;
  }): Promise<{
    readonly outcome: "created" | "replayed";
    readonly redemption: PlayerInventoryRedemptionDto;
  }>;

  read(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly status: PlayerInventoryRedemptionStatus | null;
    readonly limit: number;
    readonly offset: number;
    readonly requestId: string | null;
  }): Promise<readonly PlayerInventoryRedemptionDto[]>;
}

export class PlayerInventoryRedemptionError extends Error {
  constructor(
    readonly code:
      | "invalid_player_inventory_redemption_request"
      | "player_inventory_redemption_not_found"
      | "player_inventory_redemption_unavailable"
      | "player_inventory_redemption_quantity_unavailable"
      | "player_inventory_redemption_idempotency_conflict"
      | "player_inventory_redemption_schema_not_applied"
      | "player_inventory_redemption_failed",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerInventoryRedemptionError";
  }
}
