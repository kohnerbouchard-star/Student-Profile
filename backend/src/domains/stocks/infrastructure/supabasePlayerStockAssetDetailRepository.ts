import {
  type PlayerStockAssetDetailRepository,
  type PlayerStockAssetDetailRepositoryResult,
  PlayerStockAssetDetailPersistenceError,
  type PlayerStockAssetHistoryRecord,
} from "../contracts/playerStockAssetDetailContracts.ts";
import type {
  PlayerStockAssetRecord,
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
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FilterBuilder;
  limit(count: number): FilterBuilder;
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
}

interface PlayerStockAssetDetailClient {
  from(
    tableName: "game_session_stock_assets" | "stock_price_ticks",
  ): QueryBuilder;
}

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

const HISTORY_SELECT = [
  "game_session_id",
  "stock_asset_id",
  "tick_index",
  "ticker",
  "price",
  "previous_price",
  "change_pct",
  "volume",
  "created_at",
].join(",");

export class SupabasePlayerStockAssetDetailRepository
  implements PlayerStockAssetDetailRepository {
  constructor(private readonly client: PlayerStockAssetDetailClient) {}

  async readAsset(input: {
    readonly gameId: string;
    readonly ticker: string;
    readonly historyLimit: number;
  }): Promise<PlayerStockAssetDetailRepositoryResult> {
    const assetResponse = await this.client
      .from("game_session_stock_assets")
      .select(ASSET_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("ticker", input.ticker)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(2);

    if (assetResponse.error) throw mapPersistenceError(assetResponse.error);

    const assetRows = assetResponse.data ?? [];
    if (assetRows.length > 1) throw readFailed();
    if (assetRows.length === 0) {
      return {
        gameId: input.gameId,
        asset: null,
        history: [],
      };
    }

    const asset = toAssetRecord(assetRows[0]);
    const historyResponse = await this.client
      .from("stock_price_ticks")
      .select(HISTORY_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("stock_asset_id", asset.internalAssetUuid)
      .eq("ticker", asset.ticker)
      .order("tick_index", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(input.historyLimit);

    if (historyResponse.error) throw mapPersistenceError(historyResponse.error);

    return {
      gameId: input.gameId,
      asset,
      history: (historyResponse.data ?? []).map(toHistoryRecord),
    };
  }
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

function toHistoryRecord(
  row: Record<string, unknown>,
): PlayerStockAssetHistoryRecord {
  return {
    gameId: requireUuid(row.game_session_id),
    internalAssetUuid: requireUuid(row.stock_asset_id),
    ticker: requireTicker(row.ticker),
    tickIndex: requireNonNegativeInteger(row.tick_index),
    price: requireFiniteNumber(row.price),
    previousPrice: requireFiniteNumber(row.previous_price),
    changePct: requireFiniteNumber(row.change_pct),
    volume: requireNonNegativeInteger(row.volume),
    createdAt: requireTimestamp(row.created_at),
  };
}

function mapPersistenceError(
  error: QueryError,
): PlayerStockAssetDetailPersistenceError {
  const message = error.message.toLowerCase();
  const schemaMissing = error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");

  return new PlayerStockAssetDetailPersistenceError(
    schemaMissing
      ? "player_stock_asset_detail_schema_not_applied"
      : "player_stock_asset_detail_read_failed",
    "Player stock asset detail could not be read.",
  );
}

function readFailed(): PlayerStockAssetDetailPersistenceError {
  return new PlayerStockAssetDetailPersistenceError(
    "player_stock_asset_detail_read_failed",
    "Player stock asset detail could not be read.",
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
  ) {
    throw readFailed();
  }
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

function requireTimestamp(value: unknown): string {
  const text = requireText(value);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw readFailed();
  return new Date(timestamp).toISOString();
}
