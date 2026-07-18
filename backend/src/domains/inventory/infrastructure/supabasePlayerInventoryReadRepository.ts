import {
  type PlayerInventoryReadRepository,
  PlayerInventoryReadPersistenceError,
  type PlayerInventoryRecord,
  type PlayerInventoryRepositoryResult,
} from "../contracts/playerInventoryReadContracts.ts";

interface QueryError {
  readonly message: string;
  readonly code?: string;
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

interface PlayerInventoryReadClient {
  from(tableName: string): QueryBuilder;
}

const HOLDING_SELECT = [
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

export class SupabasePlayerInventoryReadRepository
  implements PlayerInventoryReadRepository {
  constructor(private readonly client: PlayerInventoryReadClient) {}

  async readInventory(input: {
    readonly gameId: string;
    readonly playerUuid: string;
  }): Promise<PlayerInventoryRepositoryResult> {
    const holdingResponse = await this.client
      .from("inventory_holdings")
      .select(HOLDING_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true });

    if (holdingResponse.error) {
      throw mapPersistenceError(holdingResponse.error);
    }

    const holdings = holdingResponse.data ?? [];
    if (holdings.length === 0) {
      return {
        gameId: input.gameId,
        playerUuid: input.playerUuid,
        records: [],
      };
    }

    const storeItemUuids = [...new Set(
      holdings.map((row) => requireUuid(row.store_item_id)),
    )];
    const itemResponse = await this.client
      .from("store_items")
      .select(STORE_ITEM_SELECT)
      .eq("game_session_id", input.gameId)
      .in("id", storeItemUuids)
      .order("item_key", { ascending: true })
      .order("id", { ascending: true });

    if (itemResponse.error) {
      throw mapPersistenceError(itemResponse.error);
    }

    const itemByUuid = new Map(
      (itemResponse.data ?? []).map((row) => [requireUuid(row.id), row]),
    );
    const records = holdings.map((holding) =>
      toInventoryRecord(input, holding, itemByUuid)
    );

    return {
      gameId: input.gameId,
      playerUuid: input.playerUuid,
      records,
    };
  }
}

function toInventoryRecord(
  input: { readonly gameId: string; readonly playerUuid: string },
  holding: Record<string, unknown>,
  itemByUuid: ReadonlyMap<string, Record<string, unknown>>,
): PlayerInventoryRecord {
  const internalHoldingUuid = requireUuid(holding.id);
  const internalStoreItemUuid = requireUuid(holding.store_item_id);
  const gameId = requireUuid(holding.game_session_id);
  const playerUuid = requireUuid(holding.player_id);
  const item = itemByUuid.get(internalStoreItemUuid);

  if (!item) throw metadataMissing();
  if (gameId !== input.gameId || playerUuid !== input.playerUuid) throw readFailed();
  if (requireUuid(item.game_session_id) !== input.gameId) throw metadataMissing();

  return {
    internalHoldingUuid,
    internalStoreItemUuid,
    gameId,
    playerUuid,
    itemKey: requireItemKey(item.item_key),
    name: requireText(item.name),
    description: optionalText(item.description),
    category: requireText(item.category),
    unitValue: requireNonNegativeNumber(item.price),
    currencyCode: requireCurrencyCode(item.currency_code),
    itemStatus: requireText(item.status).toLowerCase(),
    itemVisibility: requireText(item.visibility).toLowerCase(),
    quantityOwned: requireNonNegativeInteger(holding.quantity_owned),
    quantityReserved: requireNonNegativeInteger(holding.quantity_reserved),
    createdAt: requireIsoDateTime(holding.created_at),
    updatedAt: requireIsoDateTime(holding.updated_at),
  };
}

function mapPersistenceError(
  error: QueryError,
): PlayerInventoryReadPersistenceError {
  const message = error.message.toLowerCase();
  const schemaMissing = error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");

  return new PlayerInventoryReadPersistenceError(
    schemaMissing
      ? "player_inventory_schema_not_applied"
      : "player_inventory_read_failed",
    "Player inventory could not be read.",
  );
}

function metadataMissing(): PlayerInventoryReadPersistenceError {
  return new PlayerInventoryReadPersistenceError(
    "player_inventory_read_failed",
    "Inventory item metadata could not be loaded.",
  );
}

function readFailed(): PlayerInventoryReadPersistenceError {
  return new PlayerInventoryReadPersistenceError(
    "player_inventory_read_failed",
    "Player inventory could not be read.",
  );
}

function requireText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw readFailed();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireUuid(value: unknown): string {
  const text = requireText(value).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw readFailed();
  }
  return text;
}

function requireItemKey(value: unknown): string {
  const text = requireText(value).toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(text)) throw readFailed();
  return text;
}

function requireCurrencyCode(value: unknown): string {
  const text = requireText(value).toUpperCase();
  if (!/^[A-Z0-9_]{3,16}$/.test(text)) throw readFailed();
  return text;
}

function requireFiniteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw readFailed();
  return number;
}

function requireNonNegativeNumber(value: unknown): number {
  const number = requireFiniteNumber(value);
  if (number < 0) throw readFailed();
  return number;
}

function requireNonNegativeInteger(value: unknown): number {
  const number = requireFiniteNumber(value);
  if (!Number.isSafeInteger(number) || number < 0) throw readFailed();
  return number;
}

function requireIsoDateTime(value: unknown): string {
  const text = requireText(value);
  if (Number.isNaN(Date.parse(text))) throw readFailed();
  return text;
}
