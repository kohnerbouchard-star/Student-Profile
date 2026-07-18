import type {
  PlayerStockWatchlistEntryRecord,
  PlayerStockWatchlistListRepositoryResult,
  PlayerStockWatchlistMutationRepositoryResult,
  PlayerStockWatchlistRepository,
} from "../contracts/playerStockWatchlistContracts.ts";
import {
  PlayerStockWatchlistPersistenceError,
} from "../contracts/playerStockWatchlistContracts.ts";
import type {
  PlayerStockAssetRecord,
  PlayerStockLatestTickRecord,
} from "../contracts/playerStockAssetListContracts.ts";

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
  range(from: number, to: number): FilterBuilder;
  limit(count: number): FilterBuilder;
}

interface DeleteBuilder
  extends PromiseLike<QueryResponse<readonly Record<string, unknown>[]>> {
  eq(column: string, value: unknown): DeleteBuilder;
  select(columns: string): PromiseLike<
    QueryResponse<readonly Record<string, unknown>[]>
  >;
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
  insert(values: unknown): PromiseLike<
    QueryResponse<readonly Record<string, unknown>[]>
  >;
  delete(): DeleteBuilder;
}

interface PlayerStockWatchlistClient {
  from(
    tableName: "player_stock_watchlist" | "game_session_stock_assets",
  ): QueryBuilder;
  rpc<T>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<QueryResponse<T>>;
}

const WATCHLIST_SELECT =
  "id,game_session_id,player_id,stock_asset_id,created_at";
const ASSET_SELECT = [
  "id",
  "game_session_id",
  "ticker",
  "company_name",
  "sector_key",
  "country_code",
  "description",
  "current_price",
  "previous_close",
  "open_price",
  "day_high",
  "day_low",
  "market_cap",
  "current_volatility",
  "long_run_volatility",
  "is_active",
].join(",");

export class SupabasePlayerStockWatchlistRepository
  implements PlayerStockWatchlistRepository {
  constructor(private readonly client: PlayerStockWatchlistClient) {}

  async listWatchlist(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<PlayerStockWatchlistListRepositoryResult> {
    const watchlistResponse = await this.client
      .from("player_stock_watchlist")
      .select(WATCHLIST_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);

    if (watchlistResponse.error) {
      throw mapPersistenceError(watchlistResponse.error, "read");
    }

    const entries = (watchlistResponse.data ?? []).map(toWatchlistEntry);
    const assetIds = [...new Set(entries.map((entry) =>
      entry.internalAssetUuid
    ))];

    if (assetIds.length === 0) {
      return {
        gameId: input.gameId,
        playerUuid: input.playerUuid,
        entries,
        assets: [],
        latestTicks: [],
      };
    }

    const [assetResponse, tickResponse] = await Promise.all([
      this.client
        .from("game_session_stock_assets")
        .select(ASSET_SELECT)
        .eq("game_session_id", input.gameId)
        .eq("is_active", true)
        .in("id", assetIds)
        .order("ticker", { ascending: true })
        .order("id", { ascending: true }),
      this.client.rpc<readonly Record<string, unknown>[]>(
        "read_latest_stock_market_ticks_for_game",
        {
          p_game_session_id: input.gameId,
          p_ticker: null,
        },
      ),
    ]);

    if (assetResponse.error) {
      throw mapPersistenceError(assetResponse.error, "read");
    }
    if (tickResponse.error) {
      throw mapPersistenceError(tickResponse.error, "read");
    }

    const assetIdSet = new Set(assetIds);
    return {
      gameId: input.gameId,
      playerUuid: input.playerUuid,
      entries,
      assets: (assetResponse.data ?? []).map(toAssetRecord),
      latestTicks: (tickResponse.data ?? [])
        .map(toLatestTickRecord)
        .filter((tick) => assetIdSet.has(tick.internalAssetUuid)),
    };
  }

  async setWatchlisted(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly ticker: string;
    readonly isWatchlisted: boolean;
  }): Promise<PlayerStockWatchlistMutationRepositoryResult> {
    const asset = await this.resolveAsset(
      input.gameId,
      input.ticker,
      input.isWatchlisted,
    );

    const changed = input.isWatchlisted
      ? await this.addEntry(input.gameId, input.playerUuid, asset.id)
      : await this.removeEntry(input.gameId, input.playerUuid, asset.id);

    return {
      gameId: input.gameId,
      playerUuid: input.playerUuid,
      internalAssetUuid: asset.id,
      ticker: asset.ticker,
      isWatchlisted: input.isWatchlisted,
      changed,
    };
  }

  private async resolveAsset(
    gameId: string,
    ticker: string,
    requireActive: boolean,
  ): Promise<{ readonly id: string; readonly ticker: string }> {
    let query = this.client
      .from("game_session_stock_assets")
      .select("id,game_session_id,ticker,is_active")
      .eq("game_session_id", gameId)
      .eq("ticker", ticker);

    if (requireActive) query = query.eq("is_active", true);

    const response = await query
      .order("id", { ascending: true })
      .range(0, 1);

    if (response.error) {
      throw mapPersistenceError(response.error, "read");
    }

    const rows = response.data ?? [];
    if (rows.length === 0) throw assetNotFound();
    if (rows.length !== 1) throw readFailed();

    const row = rows[0];
    if (requireUuid(row.game_session_id) !== gameId) throw readFailed();
    const resolvedTicker = requireTicker(row.ticker);
    if (resolvedTicker !== ticker) throw readFailed();
    if (requireActive && row.is_active !== true) throw assetNotFound();

    return { id: requireUuid(row.id), ticker: resolvedTicker };
  }

  private async addEntry(
    gameId: string,
    playerUuid: string,
    internalAssetUuid: string,
  ): Promise<boolean> {
    const response = await this.client
      .from("player_stock_watchlist")
      .insert({
        game_session_id: gameId,
        player_id: playerUuid,
        stock_asset_id: internalAssetUuid,
      });

    if (response.error?.code === "23505") return false;
    if (response.error) {
      throw mapPersistenceError(response.error, "write");
    }
    return true;
  }

  private async removeEntry(
    gameId: string,
    playerUuid: string,
    internalAssetUuid: string,
  ): Promise<boolean> {
    const response = await this.client
      .from("player_stock_watchlist")
      .delete()
      .eq("game_session_id", gameId)
      .eq("player_id", playerUuid)
      .eq("stock_asset_id", internalAssetUuid)
      .select("id");

    if (response.error) {
      throw mapPersistenceError(response.error, "write");
    }
    return (response.data ?? []).length > 0;
  }
}

function toWatchlistEntry(
  row: Record<string, unknown>,
): PlayerStockWatchlistEntryRecord {
  return {
    internalWatchlistUuid: requireUuid(row.id),
    gameId: requireUuid(row.game_session_id),
    playerUuid: requireUuid(row.player_id),
    internalAssetUuid: requireUuid(row.stock_asset_id),
    createdAt: requireTimestamp(row.created_at),
  };
}

function toAssetRecord(row: Record<string, unknown>): PlayerStockAssetRecord {
  if (row.is_active !== true) throw readFailed();
  return {
    internalAssetUuid: requireUuid(row.id),
    gameId: requireUuid(row.game_session_id),
    ticker: requireTicker(row.ticker),
    companyName: requireText(row.company_name),
    sector: requireText(row.sector_key),
    countryCode: requireCountryCode(row.country_code),
    description: optionalText(row.description),
    currentPrice: requireFiniteNumber(row.current_price),
    previousClose: requireFiniteNumber(row.previous_close),
    openPrice: requireFiniteNumber(row.open_price),
    dayHigh: requireFiniteNumber(row.day_high),
    dayLow: requireFiniteNumber(row.day_low),
    marketCap: optionalFiniteNumber(row.market_cap),
    currentVolatility: requireFiniteNumber(row.current_volatility),
    longRunVolatility: requireFiniteNumber(row.long_run_volatility),
  };
}

function toLatestTickRecord(
  row: Record<string, unknown>,
): PlayerStockLatestTickRecord {
  return {
    gameId: requireUuid(row.game_session_id),
    internalAssetUuid: requireUuid(row.stock_asset_id),
    tickIndex: requireNonNegativeInteger(row.tick_index),
    volume: requireNonNegativeInteger(row.volume),
  };
}

function mapPersistenceError(
  error: QueryError,
  operation: "read" | "write",
): PlayerStockWatchlistPersistenceError {
  if (
    error.code === "P0001" &&
    error.message.includes("player_stock_watchlist_asset_not_available")
  ) {
    return assetNotFound();
  }

  const message = error.message.toLowerCase();
  const schemaMissing = error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache");

  return new PlayerStockWatchlistPersistenceError(
    schemaMissing
      ? "player_stock_watchlist_schema_not_applied"
      : operation === "read"
      ? "player_stock_watchlist_read_failed"
      : "player_stock_watchlist_write_failed",
    "Player stock watchlist persistence failed.",
  );
}

function assetNotFound(): PlayerStockWatchlistPersistenceError {
  return new PlayerStockWatchlistPersistenceError(
    "player_stock_watchlist_asset_not_found",
    "Stock asset is not available in the authenticated game.",
  );
}

function readFailed(): PlayerStockWatchlistPersistenceError {
  return new PlayerStockWatchlistPersistenceError(
    "player_stock_watchlist_read_failed",
    "Player stock watchlist could not be read.",
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
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      text,
    )
  ) throw readFailed();
  return text;
}

function requireTicker(value: unknown): string {
  const text = requireText(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(text)) throw readFailed();
  return text;
}

function requireCountryCode(value: unknown): string {
  const text = requireText(value).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(text)) throw readFailed();
  return text;
}

function requireTimestamp(value: unknown): string {
  const timestamp = Date.parse(requireText(value));
  if (!Number.isFinite(timestamp)) throw readFailed();
  return new Date(timestamp).toISOString();
}

function requireFiniteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw readFailed();
  return number;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return requireFiniteNumber(value);
}

function requireNonNegativeInteger(value: unknown): number {
  const number = requireFiniteNumber(value);
  if (!Number.isSafeInteger(number) || number < 0) throw readFailed();
  return number;
}
