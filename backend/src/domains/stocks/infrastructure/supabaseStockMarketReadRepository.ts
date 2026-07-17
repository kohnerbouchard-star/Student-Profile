import type {
  StockMarketBoardStockDto,
  StockMarketHistoryPointDto,
  StockMarketReadInput,
  StockMarketReadRepository,
  StockMarketReadResult,
} from "../contracts/stockMarketReadContracts.ts";
import { StockMarketReadError } from "../contracts/stockMarketReadContracts.ts";
import type {
  StockMarketPlayerAssetBatchInput,
  StockMarketPlayerAssetBatchReadResult,
  StockMarketPlayerAssetDetailInput,
  StockMarketPlayerAssetDetailReadResult,
  StockMarketPlayerAssetListInput,
  StockMarketPlayerAssetListReadResult,
  StockMarketPlayerAssetReadRepository,
} from "../contracts/stockMarketPlayerAssetReadContracts.ts";
import {
  StockMarketPlayerAssetReadError,
} from "../contracts/stockMarketPlayerAssetReadContracts.ts";

interface SupabaseReadQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseReadQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseReadQueryError | null;
}

type StockMarketReadTableName =
  | "game_sessions"
  | "game_session_stock_assets"
  | "stock_price_ticks";

interface SupabaseStockMarketReadClient {
  from(
    tableName: StockMarketReadTableName,
  ): SupabaseStockMarketReadQueryBuilder;
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<SupabaseReadQueryResponse<Data>>;
}

interface SupabaseStockMarketReadQueryBuilder {
  select(columns: string): SupabaseStockMarketReadFilterBuilder;
}

interface SupabaseStockMarketReadFilterBuilder
  extends PromiseLike<SupabaseReadQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseStockMarketReadFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseStockMarketReadFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseStockMarketReadFilterBuilder;
  limit(count: number): SupabaseStockMarketReadFilterBuilder;
  range(from: number, to: number): SupabaseStockMarketReadFilterBuilder;
}

interface GameSessionReadRow {
  readonly id: string;
}

interface GameSessionStockAssetReadRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly current_price: number | string;
  readonly previous_close: number | string;
  readonly open_price: number | string;
  readonly day_high: number | string;
  readonly day_low: number | string;
  readonly market_cap?: number | string | null;
  readonly current_volatility: number | string;
  readonly long_run_volatility: number | string;
}

interface StockPriceTickReadRow {
  readonly game_session_id: string;
  readonly stock_asset_id: string;
  readonly tick_index: number | string;
  readonly ticker: string;
  readonly price: number | string;
  readonly previous_price: number | string;
  readonly change_pct: number | string;
  readonly volume: number | string;
  readonly created_at: string;
}

const STOCK_ASSET_READ_SELECT = [
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
].join(",");

const STOCK_TICK_READ_SELECT = [
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

export class SupabaseStockMarketReadRepository
  implements StockMarketReadRepository, StockMarketPlayerAssetReadRepository {
  constructor(private readonly client: SupabaseStockMarketReadClient) {}

  async read(input: StockMarketReadInput): Promise<StockMarketReadResult> {
    await this.assertGameSessionExists(input.gameSessionId);

    const requestedTicker = input.ticker
      ? normalizeTicker(input.ticker)
      : undefined;
    const [assetRows, latestTickRows] = await Promise.all([
      this.readAssets(input.gameSessionId, requestedTicker),
      this.readLatestTicks(input.gameSessionId, requestedTicker),
    ]);
    const latestTickByAssetId = new Map<string, StockPriceTickReadRow>();

    for (const tick of latestTickRows) {
      latestTickByAssetId.set(tick.stock_asset_id, tick);
    }

    const stocks = assetRows.map((asset) =>
      toBoardStock(asset, latestTickByAssetId.get(asset.id))
    );
    const tickIndex = latestTickRows.length > 0
      ? Math.max(
        ...latestTickRows.map((row) => Math.trunc(toNumber(row.tick_index))),
      )
      : 0;
    const result: StockMarketReadResult = {
      gameSessionId: input.gameSessionId,
      tickIndex,
      stocks,
    };

    if (!requestedTicker && stocks.length === 0) {
      return {
        ...result,
        history: input.includeHistory ? [] : undefined,
        emptyState: {
          reason: "stock_market_not_initialized",
          recommendedAction: "run_stock_market_seed_copy",
        },
      };
    }

    if (!requestedTicker) {
      return result;
    }

    const stock = stocks[0] ?? null;

    return {
      ...result,
      ticker: requestedTicker,
      stock,
      history: input.includeHistory
        ? await this.readHistory(
          input.gameSessionId,
          requestedTicker,
          input.historyLimit,
        )
        : undefined,
    };
  }

  async listPlayerAssets(
    input: StockMarketPlayerAssetListInput,
  ): Promise<StockMarketPlayerAssetListReadResult> {
    const assetRowsWithLookahead = await this.readAssets(
      input.gameSessionId,
      undefined,
      {
        limit: input.limit + 1,
        offset: input.offset,
      },
    );
    const hasMore = assetRowsWithLookahead.length > input.limit;
    const assetRows = assetRowsWithLookahead.slice(0, input.limit);
    const latestTickRows = await this.readLatestTicks(
      input.gameSessionId,
      undefined,
    );
    const latestTickByAssetId = new Map(
      latestTickRows.map((row) => [row.stock_asset_id, row] as const),
    );

    return {
      tickIndex: latestTickIndex(latestTickRows),
      assets: assetRows.map((asset) =>
        toBoardStock(asset, latestTickByAssetId.get(asset.id))
      ),
      pagination: {
        limit: input.limit,
        offset: input.offset,
        returned: assetRows.length,
        hasMore,
        nextOffset: hasMore ? input.offset + input.limit : null,
      },
    };
  }

  async readPlayerAsset(
    input: StockMarketPlayerAssetDetailInput,
  ): Promise<StockMarketPlayerAssetDetailReadResult> {
    const assetRows = await this.readAssets(
      input.gameSessionId,
      undefined,
      {
        assetId: input.assetId,
        limit: 1,
        offset: 0,
      },
    );
    const asset = assetRows[0];

    if (!asset) {
      throw new StockMarketPlayerAssetReadError(
        "stock_asset_not_available",
        "Stock asset is not available in the authenticated game session.",
        404,
      );
    }

    const [latestTickRows, history] = await Promise.all([
      this.readLatestTicks(input.gameSessionId, asset.ticker),
      this.readHistory(
        input.gameSessionId,
        asset.ticker,
        input.historyLimit,
        asset.id,
      ),
    ]);
    const latestTick = latestTickRows.find((row) =>
      row.stock_asset_id === asset.id
    );

    return {
      tickIndex: latestTickIndex(latestTickRows),
      asset: toBoardStock(asset, latestTick),
      history,
    };
  }

  async readPlayerAssetsByIds(
    input: StockMarketPlayerAssetBatchInput,
  ): Promise<StockMarketPlayerAssetBatchReadResult> {
    const assetIds = unique(input.assetIds);
    const [assetRows, latestTickRows] = await Promise.all([
      assetIds.length > 0
        ? this.readAssets(input.gameSessionId, undefined, { assetIds })
        : Promise.resolve([]),
      this.readLatestTicks(input.gameSessionId, undefined),
    ]);
    const latestTickByAssetId = new Map(
      latestTickRows.map((row) => [row.stock_asset_id, row] as const),
    );

    return {
      tickIndex: latestTickIndex(latestTickRows),
      assets: assetRows.map((asset) =>
        toBoardStock(asset, latestTickByAssetId.get(asset.id))
      ),
    };
  }

  private async assertGameSessionExists(gameSessionId: string): Promise<void> {
    const response = await this.client
      .from("game_sessions")
      .select("id")
      .eq("id", gameSessionId)
      .limit(1);

    if (response.error) {
      throw mapReadError(response.error);
    }

    const rows = (response.data ?? []) as GameSessionReadRow[];

    if (!rows[0]?.id) {
      throw new StockMarketReadError(
        "game_session_not_found",
        "Game session could not be found.",
        404,
      );
    }
  }

  private async readAssets(
    gameSessionId: string,
    ticker: string | undefined,
    options: {
      readonly assetId?: string;
      readonly assetIds?: readonly string[];
      readonly limit?: number;
      readonly offset?: number;
    } = {},
  ): Promise<readonly GameSessionStockAssetReadRow[]> {
    let query = this.client
      .from("game_session_stock_assets")
      .select(STOCK_ASSET_READ_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true);

    if (ticker) {
      query = query.eq("ticker", ticker);
    }

    if (options.assetId) {
      query = query.eq("id", options.assetId);
    }

    if (options.assetIds && options.assetIds.length > 0) {
      query = query.in("id", options.assetIds);
    }

    query = query.order("ticker", { ascending: true });

    if (options.limit !== undefined) {
      const offset = options.offset ?? 0;
      query = query.range(offset, offset + options.limit - 1);
    }

    const response = await query;

    if (response.error) {
      throw mapReadError(response.error);
    }

    return (response.data ?? []) as GameSessionStockAssetReadRow[];
  }

  private async readLatestTicks(
    gameSessionId: string,
    ticker: string | undefined,
  ): Promise<readonly StockPriceTickReadRow[]> {
    const response = await this.client.rpc<readonly StockPriceTickReadRow[]>(
      "read_latest_stock_market_ticks_for_game",
      {
        p_game_session_id: gameSessionId,
        p_ticker: ticker ?? null,
      },
    );

    if (response.error) {
      throw mapReadError(response.error);
    }

    return response.data ?? [];
  }

  private async readHistory(
    gameSessionId: string,
    ticker: string,
    historyLimit: number,
    stockAssetId?: string,
  ): Promise<readonly StockMarketHistoryPointDto[]> {
    let query = this.client
      .from("stock_price_ticks")
      .select(STOCK_TICK_READ_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("ticker", ticker);

    if (stockAssetId) {
      query = query.eq("stock_asset_id", stockAssetId);
    }

    const response = await query
      .order("tick_index", { ascending: false })
      .limit(historyLimit);

    if (response.error) {
      throw mapReadError(response.error);
    }

    return ((response.data ?? []) as StockPriceTickReadRow[])
      .map(toHistoryPoint)
      .sort((left, right) => left.tickIndex - right.tickIndex);
  }
}

function latestTickIndex(rows: readonly StockPriceTickReadRow[]): number {
  return rows.length > 0
    ? Math.max(...rows.map((row) => Math.trunc(toNumber(row.tick_index))))
    : 0;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function toBoardStock(
  row: GameSessionStockAssetReadRow,
  latestTick: StockPriceTickReadRow | undefined,
): StockMarketBoardStockDto {
  const currentPrice = toNumber(row.current_price);
  const previousClose = toNumber(row.previous_close);

  return {
    assetId: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    sector: row.sector_key,
    countryCode: row.country_code,
    currentPrice,
    previousClose,
    changePct: previousClose > 0
      ? round(((currentPrice - previousClose) / previousClose) * 100)
      : 0,
    openPrice: toNumber(row.open_price),
    dayHigh: toNumber(row.day_high),
    dayLow: toNumber(row.day_low),
    volume: latestTick ? Math.trunc(toNumber(latestTick.volume)) : 0,
    marketCap: toNullableNumber(row.market_cap),
    currentVolatility: toNumber(row.current_volatility),
    longRunVolatility: toNumber(row.long_run_volatility),
    description: row.description ?? null,
  };
}

function toHistoryPoint(
  row: StockPriceTickReadRow,
): StockMarketHistoryPointDto {
  return {
    tickIndex: Math.trunc(toNumber(row.tick_index)),
    price: toNumber(row.price),
    previousPrice: toNumber(row.previous_price),
    changePct: toNumber(row.change_pct),
    volume: Math.trunc(toNumber(row.volume)),
    createdAt: row.created_at,
  };
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toNullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return toNumber(value);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mapReadError(error: SupabaseReadQueryError): StockMarketReadError {
  if (isSchemaNotAppliedError(error)) {
    return new StockMarketReadError(
      "stock_market_schema_not_applied",
      "Stock market read schema is not applied.",
      500,
    );
  }

  return new StockMarketReadError(
    "stock_market_read_failed",
    "Stock market data could not be read.",
    500,
  );
}

function isSchemaNotAppliedError(error: SupabaseReadQueryError): boolean {
  const message = error.message.toLowerCase();

  return error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}
