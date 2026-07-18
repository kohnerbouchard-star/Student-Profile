export type PlayerInventoryRoute =
  | { readonly kind: "inventory" }
  | { readonly kind: "malformed" };

export interface PlayerInventoryReadScope {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly effectiveAt: string;
}

export interface PlayerInventoryRecord {
  readonly internalHoldingUuid: string;
  readonly internalStoreItemUuid: string;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly itemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly unitValue: number;
  readonly currencyCode: string;
  readonly itemStatus: "active" | "disabled" | "archived";
  readonly itemVisibility: "visible" | "hidden";
  readonly quantityOwned: number;
  readonly quantityReserved: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerInventoryRepositoryResult {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly records: readonly PlayerInventoryRecord[];
}

export interface PlayerInventoryReadRepository {
  readInventory(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly limit: number;
  }): Promise<PlayerInventoryRepositoryResult>;
}

export interface PlayerInventoryItemDto {
  /** Public per-game item key. Internal holding and Store UUIDs are never serialized. */
  readonly id: string;
  /** Compatibility alias for the Player Terminal read model; also the public item key. */
  readonly storeItemId: string;
  readonly itemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly quantityOwned: number;
  readonly quantityReserved: number;
  readonly quantityAvailable: number;
  readonly unitValue: number;
  readonly totalOwnedValue: number;
  readonly currencyCode: string;
  readonly itemStatus: "active" | "disabled" | "archived";
  readonly itemVisibility: "player" | "hidden";
  readonly availableActions: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerInventoryValueSummaryDto {
  readonly currencyCode: string;
  readonly totalOwnedValue: number;
}

export interface PlayerInventoryReadResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly availability: "available";
  readonly capacity: null;
  readonly categories: readonly string[];
  readonly summary: {
    readonly itemTypes: number;
    readonly quantityOwned: number;
    readonly quantityReserved: number;
    readonly quantityAvailable: number;
    readonly values: readonly PlayerInventoryValueSummaryDto[];
  };
  readonly items: readonly PlayerInventoryItemDto[];
  readonly emptyState: {
    readonly reason: "inventory_empty";
  } | null;
}

export class PlayerInventoryReadError extends Error {
  constructor(
    readonly code:
      | "invalid_player_inventory_request"
      | "player_inventory_scope_violation"
      | "player_inventory_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerInventoryReadError";
  }
}

export class PlayerInventoryReadPersistenceError extends Error {
  constructor(
    readonly code:
      | "player_inventory_schema_not_applied"
      | "player_inventory_read_failed"
      | "player_inventory_metadata_missing",
    message: string,
  ) {
    super(message);
    this.name = "PlayerInventoryReadPersistenceError";
  }
}
