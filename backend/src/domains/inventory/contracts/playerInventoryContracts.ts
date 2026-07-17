export interface PlayerInventoryReadInput {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface PlayerInventoryRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly storeItemId: string;
  readonly itemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly unitValue: number;
  readonly currencyCode: string;
  readonly itemStatus: string;
  readonly itemVisibility: string;
  readonly quantityOwned: number;
  readonly quantityReserved: number;
  readonly createdAt: string;
  readonly updatedAt: string;
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
  readonly itemStatus: string;
  readonly itemVisibility: string;
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
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  };
  readonly generatedAt: string;
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
}
