import {
  type PlayerStockAssetListRepository,
  type PlayerStockAssetListRepositoryResult,
  PlayerStockAssetListPersistenceError,
  type PlayerStockAssetRecord,
  type PlayerStockLatestTickRecord,
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
  range(from: number, to: number): FilterBuilder;
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
}

interface PlayerStockAssetListClient {
  from(tableName: "game_session_stock_assets"): QueryBuilder;
  rpc<T>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<QueryResponse<T>>;
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

export class SupabasePlayerStockAssetListRepository
  implements PlayerStockAssetListRepository {
  constructor(private readonly client: PlayerStockAssetListClient) {}

  async listAssets(input: {
    readonly gameId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<PlayerStockAssetListRepositoryResult> {
    const [assetResponse, tickResponse] = await Promise.all([
      this.client
        .from("game_session_stock_assets")
        .select(ASSET_SELECT)
        .eq("game_session_id", input.gameId)
        .eq("is_active", true)
        .order("ticker", { ascending: true })
        .order("id", { ascending: true })
        .range(input.offset, input.offset + input.limit - 1),
      this.client.rpc<readonly Record<string, unknown>[]>(
        "read_latest_stock_market_ticks_for_game",
        {
          p_game_session_id: input.gameId,
          p_ticker: null,
        },
      ),
    ]);

    if (assetResponse.error) throw mapPersistenceError(assetResponse.error);
    if (tickResponse.error) throw mapPersistenceError(tickResponse.error);

    return {
      gameId: input.gameId,
      assets: (assetResponse.data ?? []).map(toAssetRecord),
      latestTicks: (tickResponse.data ?? []).map(toLatestTickRecord),
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

function mapPersistenceError(error: QueryError): PlayerStockAssetListPersistenceError {
  const message = error.message.toLowerCase();
  const schemaMissing = error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");

  return new PlayerStockAssetListPersistenceError(
    schemaMissing
      ? "player_stock_asset_schema_not_applied"
      : "player_stock_asset_read_failed",
    "Player stock assets could not be read.",
  );
}

function readFailed(): PlayerStockAssetListPersistenceError {
  return new PlayerStockAssetListPersistenceError(
    "player_stock_asset_read_failed",
    "Player stock assets could not be read.",
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
