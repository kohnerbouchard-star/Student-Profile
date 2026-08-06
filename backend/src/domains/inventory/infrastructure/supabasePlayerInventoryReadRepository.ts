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
  gt(column: string, value: unknown): FilterBuilder;
  in(column: string, values: readonly unknown[]): FilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FilterBuilder;
  limit(count: number): FilterBuilder;
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
  "inventory_account_id",
  "game_item_id",
  "quantity_owned",
  "quantity_reserved",
  "average_unit_cost",
  "cost_currency_code",
  "created_at",
  "updated_at",
].join(",");

const GAME_ITEM_SELECT = [
  "id",
  "game_session_id",
  "canonical_key",
  "name",
  "description",
  "item_class",
  "subtype",
  "status",
  "metadata",
].join(",");

const STORE_ITEM_SELECT = [
  "id",
  "game_session_id",
  "game_item_id",
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
    readonly limit: number;
  }): Promise<PlayerInventoryRepositoryResult> {
    const holdingResponse = await this.client
      .from("inventory_holdings")
      .select(HOLDING_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .gt("quantity_owned", 0)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(input.limit + 1);

    if (holdingResponse.error) throw mapPersistenceError(holdingResponse.error);

    const holdings = holdingResponse.data ?? [];
    if (holdings.length > input.limit) throw readFailed();
    if (holdings.length === 0) {
      return {
        gameId: input.gameId,
        playerUuid: input.playerUuid,
        records: [],
      };
    }

    const gameItemUuids = [...new Set(
      holdings.map((row) => requireUuid(row.game_item_id)),
    )];
    const gameItemResponse = await this.client
      .from("game_items")
      .select(GAME_ITEM_SELECT)
      .eq("game_session_id", input.gameId)
      .in("id", gameItemUuids)
      .order("canonical_key", { ascending: true })
      .order("id", { ascending: true })
      .limit(gameItemUuids.length + 1);

    if (gameItemResponse.error) throw mapPersistenceError(gameItemResponse.error);
    const gameItemRows = gameItemResponse.data ?? [];
    if (gameItemRows.length !== gameItemUuids.length) throw metadataMissing();

    const storeItemUuids = [...new Set(
      holdings
        .map((row) => optionalUuid(row.store_item_id))
        .filter((value): value is string => Boolean(value)),
    )];
    const storeItemResponse: QueryResponse<readonly Record<string, unknown>[]> =
      storeItemUuids.length
        ? await this.client
          .from("store_items")
          .select(STORE_ITEM_SELECT)
          .eq("game_session_id", input.gameId)
          .in("id", storeItemUuids)
          .order("id", { ascending: true })
          .limit(storeItemUuids.length + 1)
        : { data: [], error: null };

    if (storeItemResponse.error) throw mapPersistenceError(storeItemResponse.error);
    const storeItemRows = storeItemResponse.data ?? [];
    if (storeItemRows.length !== storeItemUuids.length) throw metadataMissing();

    const gameItemByUuid = new Map(
      gameItemRows.map((row) => [requireUuid(row.id), row]),
    );
    const storeItemByUuid = new Map(
      storeItemRows.map((row) => [requireUuid(row.id), row]),
    );
    const records = holdings.map((holding) =>
      toInventoryRecord(input, holding, gameItemByUuid, storeItemByUuid)
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
  gameItemByUuid: ReadonlyMap<string, Record<string, unknown>>,
  storeItemByUuid: ReadonlyMap<string, Record<string, unknown>>,
): PlayerInventoryRecord {
  const internalHoldingUuid = requireUuid(holding.id);
  const internalGameItemUuid = requireUuid(holding.game_item_id);
  const internalStoreItemUuid = optionalUuid(holding.store_item_id);
  const gameId = requireUuid(holding.game_session_id);
  const playerUuid = requireUuid(holding.player_id);
  const item = gameItemByUuid.get(internalGameItemUuid);
  const storeItem = internalStoreItemUuid
    ? storeItemByUuid.get(internalStoreItemUuid)
    : undefined;

  if (!item) throw metadataMissing();
  if (gameId !== input.gameId || playerUuid !== input.playerUuid) throw readFailed();
  if (requireUuid(item.game_session_id) !== input.gameId) throw metadataMissing();
  if (storeItem && requireUuid(storeItem.game_session_id) !== input.gameId) {
    throw metadataMissing();
  }
  if (
    storeItem && optionalUuid(storeItem.game_item_id) !== internalGameItemUuid
  ) {
    throw metadataMissing();
  }

  const metadata = object(item.metadata);
  const averageUnitCost = requireNonNegativeNumber(holding.average_unit_cost ?? 0);
  const storeUnitValue = storeItem
    ? requireNonNegativeNumber(storeItem.price)
    : 0;
  const currencyCode = firstCurrencyCode(
    holding.cost_currency_code,
    storeItem?.currency_code,
    metadata.currencyCode,
    "ECO",
  );

  return {
    internalHoldingUuid,
    internalGameItemUuid,
    internalStoreItemUuid,
    gameId,
    playerUuid,
    itemKey: requireItemKey(item.canonical_key),
    name: requireText(item.name),
    description: optionalText(item.description),
    category: requireText(item.item_class),
    unitValue: averageUnitCost > 0 ? averageUnitCost : storeUnitValue,
    currencyCode,
    itemStatus: requireGameItemStatus(item.status),
    itemVisibility: "visible",
    usable: metadata.effectEnabled === true,
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
    "player_inventory_metadata_missing",
    "Inventory item metadata could not be loaded.",
  );
}

function readFailed(): PlayerInventoryReadPersistenceError {
  return new PlayerInventoryReadPersistenceError(
    "player_inventory_read_failed",
    "Player inventory could not be read.",
  );
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

function optionalUuid(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requireUuid(value);
}

function requireItemKey(value: unknown): string {
  const text = requireText(value).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,159}$/.test(text)) throw readFailed();
  return text;
}

function firstCurrencyCode(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    const text = value.trim().toUpperCase();
    if (/^[A-Z0-9_]{3,16}$/.test(text)) return text;
  }
  throw readFailed();
}

function requireGameItemStatus(
  value: unknown,
): "active" | "disabled" | "archived" {
  const status = requireText(value).toLowerCase();
  if (status === "active" || status === "disabled") return status;
  if (status === "retired") return "archived";
  throw readFailed();
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
