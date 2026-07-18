import {
  type PlayerInventoryItemDto,
  type PlayerInventoryReadRepository,
  type PlayerInventoryReadResponseBody,
  type PlayerInventoryReadScope,
  PlayerInventoryReadError,
  PlayerInventoryReadPersistenceError,
  type PlayerInventoryRecord,
  type PlayerInventoryValueSummaryDto,
} from "../contracts/playerInventoryReadContracts.ts";

export const MAX_PLAYER_INVENTORY_HOLDINGS = 200;

export class PlayerInventoryReadService {
  constructor(private readonly repository: PlayerInventoryReadRepository) {}

  async readInventory(
    scope: PlayerInventoryReadScope,
  ): Promise<PlayerInventoryReadResponseBody> {
    try {
      const result = await this.repository.readInventory({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        limit: MAX_PLAYER_INVENTORY_HOLDINGS,
      });

      if (
        result.gameId !== scope.gameId ||
        result.playerUuid !== scope.playerUuid ||
        result.records.length > MAX_PLAYER_INVENTORY_HOLDINGS ||
        result.records.some((record) =>
          record.gameId !== scope.gameId ||
          record.playerUuid !== scope.playerUuid
        )
      ) {
        throw scopeViolation();
      }

      const visibleRecords = result.records.filter((record) =>
        record.quantityOwned > 0
      );
      const publicIds = visibleRecords.map((record) => record.itemKey);
      if (new Set(publicIds).size !== publicIds.length) throw scopeViolation();

      const ordered = [...visibleRecords].sort((left, right) =>
        left.category.localeCompare(right.category) ||
        left.name.localeCompare(right.name) ||
        left.itemKey.localeCompare(right.itemKey)
      );
      const items = ordered.map(toItemDto);
      const categories = [...new Set(items.map((item) => item.category))]
        .sort((left, right) => left.localeCompare(right));

      return {
        ok: true,
        generatedAt: scope.effectiveAt,
        availability: "available",
        capacity: null,
        categories,
        summary: buildSummary(items),
        items,
        emptyState: items.length === 0 ? { reason: "inventory_empty" } : null,
      };
    } catch (error) {
      if (error instanceof PlayerInventoryReadError) throw error;
      if (error instanceof PlayerInventoryReadPersistenceError) {
        throw new PlayerInventoryReadError(
          "player_inventory_service_unavailable",
          "Player inventory is temporarily unavailable.",
          503,
          true,
        );
      }
      throw error;
    }
  }
}

function toItemDto(record: PlayerInventoryRecord): PlayerInventoryItemDto {
  if (record.quantityReserved > record.quantityOwned) {
    throw scopeViolation();
  }

  const quantityAvailable = record.quantityOwned - record.quantityReserved;
  const publicItemId = record.itemKey;

  return {
    id: publicItemId,
    storeItemId: publicItemId,
    itemKey: publicItemId,
    name: record.name,
    description: record.description,
    category: record.category,
    quantityOwned: record.quantityOwned,
    quantityReserved: record.quantityReserved,
    quantityAvailable,
    unitValue: record.unitValue,
    totalOwnedValue: roundMoney(record.unitValue * record.quantityOwned),
    currencyCode: record.currencyCode,
    itemStatus: record.itemStatus,
    itemVisibility: record.itemVisibility === "visible" ? "player" : "hidden",
    // Generic item use remains disabled until the redemption contract is implemented.
    availableActions: [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildSummary(
  items: readonly PlayerInventoryItemDto[],
): PlayerInventoryReadResponseBody["summary"] {
  const values = new Map<string, number>();
  for (const item of items) {
    values.set(
      item.currencyCode,
      roundMoney(
        (values.get(item.currencyCode) ?? 0) + item.totalOwnedValue,
      ),
    );
  }

  const valueSummary: PlayerInventoryValueSummaryDto[] = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, totalOwnedValue]) => ({
      currencyCode,
      totalOwnedValue,
    }));

  return {
    itemTypes: items.length,
    quantityOwned: sum(items, (item) => item.quantityOwned),
    quantityReserved: sum(items, (item) => item.quantityReserved),
    quantityAvailable: sum(items, (item) => item.quantityAvailable),
    values: valueSummary,
  };
}

function sum<T>(
  values: readonly T[],
  readValue: (value: T) => number,
): number {
  return values.reduce((total, value) => total + readValue(value), 0);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function scopeViolation(): PlayerInventoryReadError {
  return new PlayerInventoryReadError(
    "player_inventory_scope_violation",
    "Player inventory could not be loaded.",
    500,
    false,
  );
}
