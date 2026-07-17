import type {
  PlayerInventoryReadInput,
  PlayerInventoryRecord,
} from "../contracts/playerInventoryContracts.ts";
import type { PlayerInventoryRepository } from "./playerInventoryRepository.ts";

interface QueryError {
  readonly message: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface FilterBuilder
  extends PromiseLike<QueryResponse<readonly Record<string, unknown>[]>> {
  eq(column: string, value: unknown): FilterBuilder;
  in(column: string, values: readonly unknown[]): FilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FilterBuilder;
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
}

interface PlayerInventoryClient {
  from(tableName: string): QueryBuilder;
}

interface InventoryHoldingRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quantity_owned: number | string;
  readonly quantity_reserved: number | string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface StoreItemRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly item_key: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly price: number | string;
  readonly currency_code: string;
  readonly status: string;
  readonly visibility: string;
}

const INVENTORY_HOLDING_SELECT = [
  "id",
  "game_session_id",
  "player_id",
  "store_item_id",
  "quantity_owned",
  "quantity_reserved",
  "created_at",
  "updated_at",
].join(",");

const STORE_ITEM_SELECT = [
  "id",
  "game_session_id",
  "item_key",
  "name",
  "description",
  "category",
  "price",
  "currency_code",
  "status",
  "visibility",
].join(",");

export class PlayerInventoryPersistenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PlayerInventoryPersistenceError";
    this.code = code;
  }
}

export class SupabasePlayerInventoryRepository
  implements PlayerInventoryRepository {
  constructor(private readonly client: PlayerInventoryClient) {}

  async readPlayerInventory(
    input: PlayerInventoryReadInput,
  ): Promise<readonly PlayerInventoryRecord[]> {
    const holdingsResponse = await this.client
      .from("inventory_holdings")
      .select(INVENTORY_HOLDING_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("updated_at", { ascending: false });

    if (holdingsResponse.error) {
      throw inventoryReadFailed();
    }

    const holdings = (holdingsResponse.data ??
      []) as unknown as readonly InventoryHoldingRow[];

    if (holdings.length === 0) {
      return [];
    }

    const itemIds = [...new Set(holdings.map((row) => row.store_item_id))];
    const itemsResponse = await this.client
      .from("store_items")
      .select(STORE_ITEM_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .in("id", itemIds);

    if (itemsResponse.error) {
      throw inventoryReadFailed();
    }

    const items =
      (itemsResponse.data ?? []) as unknown as readonly StoreItemRow[];
    const itemById = new Map(items.map((item) => [item.id, item]));

    return holdings.map((holding) => {
      const item = itemById.get(holding.store_item_id);

      if (!item || item.game_session_id !== input.gameSessionId) {
        throw new PlayerInventoryPersistenceError(
          "player_inventory_metadata_missing",
          "Inventory item metadata could not be loaded.",
        );
      }

      return {
        id: holding.id,
        gameSessionId: holding.game_session_id,
        playerId: holding.player_id,
        storeItemId: holding.store_item_id,
        itemKey: item.item_key,
        name: item.name,
        description: item.description ?? null,
        category: item.category,
        unitValue: toFiniteNumber(item.price),
        currencyCode: item.currency_code,
        itemStatus: item.status,
        itemVisibility: item.visibility,
        quantityOwned: toNonNegativeInteger(holding.quantity_owned),
        quantityReserved: toNonNegativeInteger(holding.quantity_reserved),
        createdAt: holding.created_at,
        updatedAt: holding.updated_at,
      };
    });
  }
}

function inventoryReadFailed(): PlayerInventoryPersistenceError {
  return new PlayerInventoryPersistenceError(
    "player_inventory_read_failed",
    "Player inventory could not be loaded.",
  );
}

function toFiniteNumber(value: number | string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw inventoryReadFailed();
  }

  return parsed;
}

function toNonNegativeInteger(value: number | string): number {
  const parsed = toFiniteNumber(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw inventoryReadFailed();
  }

  return parsed;
}
