export interface PlayerInventoryScope {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly effectiveAt: string;
}

export interface PlayerInventoryHoldingRecord {
  readonly internalHoldingUuid: string;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly internalStoreItemUuid: string;
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
  readonly holdings: readonly PlayerInventoryHoldingRecord[];
}

export interface PlayerInventoryRepository {
  readInventory(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly limit: number;
  }): Promise<PlayerInventoryRepositoryResult>;
}

export interface PlayerInventoryItemDto {
  readonly id: string;
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

export interface PlayerInventoryResponseBody {
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

export class PlayerInventoryError extends Error {
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
    this.name = "PlayerInventoryError";
  }
}

export class PlayerInventoryPersistenceError extends Error {
  constructor(
    readonly code:
      | "player_inventory_schema_not_applied"
      | "player_inventory_read_failed"
      | "player_inventory_metadata_missing",
    message: string,
  ) {
    super(message);
    this.name = "PlayerInventoryPersistenceError";
  }
}
