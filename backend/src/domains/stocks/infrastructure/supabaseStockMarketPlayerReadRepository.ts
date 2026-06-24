import type {
  StockMarketPlayerCashDto,
  StockMarketPlayerHoldingDto,
  StockMarketPlayerOrderDto,
  StockMarketPlayerReadInput,
  StockMarketPlayerReadRepository,
  StockMarketPlayerReadResult,
  StockMarketPlayerTradeDto,
} from "../contracts/stockMarketPlayerReadContracts.ts";
import {
  StockMarketPlayerReadError,
} from "../contracts/stockMarketPlayerReadContracts.ts";

interface SupabasePlayerReadQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabasePlayerReadQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabasePlayerReadQueryError | null;
}

type StockMarketPlayerReadTableName =
  | "account_balances"
  | "game_session_stock_assets"
  | "player_sessions"
  | "stock_holdings"
  | "stock_orders"
  | "stock_trades";

interface SupabaseStockMarketPlayerReadClient {
  from(
    tableName: StockMarketPlayerReadTableName,
  ): SupabaseStockMarketPlayerReadQueryBuilder;
}

interface SupabaseStockMarketPlayerReadQueryBuilder {
  select(columns: string): SupabaseStockMarketPlayerReadFilterBuilder;
}

interface SupabaseStockMarketPlayerReadFilterBuilder
  extends PromiseLike<SupabasePlayerReadQueryResponse<unknown[]>> {
  eq(
    column: string,
    value: unknown,
  ): SupabaseStockMarketPlayerReadFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseStockMarketPlayerReadFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseStockMarketPlayerReadFilterBuilder;
  limit(count: number): SupabaseStockMarketPlayerReadFilterBuilder;
}

interface PlayerSessionReadRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly status: string;
  readonly expires_at: string;
  readonly revoked_at?: string | null;
}

interface AccountBalanceReadRow {
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

interface StockHoldingReadRow {
  readonly game_session_id: string;
  readonly player_session_id: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly quantity: number | string;
  readonly average_cost: number | string;
  readonly realized_pnl: number | string;
}

interface GameSessionStockAssetReadRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly current_price: number | string;
}

interface StockOrderReadRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_session_id: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly side: string;
  readonly quantity: number | string;
  readonly execution_price?: number | string | null;
  readonly gross_value: number | string;
  readonly status: string;
  readonly rejection_reason?: string | null;
  readonly idempotency_key: string;
  readonly created_at: string;
}

interface StockTradeReadRow {
  readonly id: string;
  readonly order_id: string;
  readonly game_session_id: string;
  readonly player_session_id: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly side: string;
  readonly quantity: number | string;
  readonly execution_price: number | string;
  readonly gross_value: number | string;
  readonly created_at: string;
}

interface SupabaseStockMarketPlayerReadRepositoryOptions {
  readonly now?: () => Date;
}

const PLAYER_SESSION_SELECT = [
  "id",
  "game_session_id",
  "player_id",
  "status",
  "expires_at",
  "revoked_at",
].join(",");

const CASH_SELECT = [
  "account_type",
  "balance",
  "currency_code",
].join(",");

const HOLDING_SELECT = [
  "game_session_id",
  "player_session_id",
  "player_id",
  "stock_asset_id",
  "ticker",
  "quantity",
  "average_cost",
  "realized_pnl",
].join(",");

const ASSET_SELECT = [
  "id",
  "game_session_id",
  "ticker",
  "company_name",
  "sector_key",
  "country_code",
  "current_price",
].join(",");

const ORDER_SELECT = [
  "id",
  "game_session_id",
  "player_session_id",
  "player_id",
  "stock_asset_id",
  "ticker",
  "side",
  "quantity",
  "execution_price",
  "gross_value",
  "status",
  "rejection_reason",
  "idempotency_key",
  "created_at",
].join(",");

const TRADE_SELECT = [
  "id",
  "order_id",
  "game_session_id",
  "player_session_id",
  "player_id",
  "stock_asset_id",
  "ticker",
  "side",
  "quantity",
  "execution_price",
  "gross_value",
  "created_at",
].join(",");

export class SupabaseStockMarketPlayerReadRepository
  implements StockMarketPlayerReadRepository {
  constructor(
    private readonly client: SupabaseStockMarketPlayerReadClient,
    private readonly options: SupabaseStockMarketPlayerReadRepositoryOptions =
      {},
  ) {}

  async read(
    input: StockMarketPlayerReadInput,
  ): Promise<StockMarketPlayerReadResult> {
    const playerSession = await this.readActivePlayerSession(input);

    if (input.action === "read_orders") {
      return {
        action: "read_orders",
        gameSessionId: input.gameSessionId,
        playerSessionId: input.playerSessionId,
        playerId: playerSession.player_id,
        orders: await this.readOrders(input, playerSession.player_id),
      };
    }

    if (input.action === "read_trades") {
      return {
        action: "read_trades",
        gameSessionId: input.gameSessionId,
        playerSessionId: input.playerSessionId,
        playerId: playerSession.player_id,
        trades: await this.readTrades(input, playerSession.player_id),
      };
    }

    const [cash, holdings] = await Promise.all([
      this.readCash(input.gameSessionId, playerSession.player_id),
      this.readHoldings(input.gameSessionId, playerSession.player_id),
    ]);
    const summary = summarizePortfolio(cash, holdings);

    return {
      action: input.action,
      gameSessionId: input.gameSessionId,
      playerSessionId: input.playerSessionId,
      playerId: playerSession.player_id,
      cash,
      summary,
      holdings,
    };
  }

  private async readActivePlayerSession(
    input: StockMarketPlayerReadInput,
  ): Promise<PlayerSessionReadRow> {
    const response = await this.client
      .from("player_sessions")
      .select(PLAYER_SESSION_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("id", input.playerSessionId)
      .limit(1);

    if (response.error) {
      throw mapPlayerReadError(response.error);
    }

    const row = ((response.data ?? []) as PlayerSessionReadRow[])[0];

    if (!row?.id) {
      throw new StockMarketPlayerReadError(
        "player_session_not_found",
        "Player session could not be found in this game session.",
        404,
      );
    }

    if (!isUsablePlayerSession(row, this.options.now?.() ?? new Date())) {
      throw new StockMarketPlayerReadError(
        "invalid_player_session",
        "Player session is not active.",
        409,
      );
    }

    return row;
  }

  private async readCash(
    gameSessionId: string,
    playerId: string,
  ): Promise<StockMarketPlayerCashDto> {
    const response = await this.client
      .from("account_balances")
      .select(CASH_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .eq("account_type", "cash")
      .eq("currency_code", "ECO")
      .limit(1);

    if (response.error) {
      throw mapPlayerReadError(response.error);
    }

    const row = ((response.data ?? []) as AccountBalanceReadRow[])[0];

    return {
      accountType: "cash",
      currencyCode: row?.currency_code ?? "ECO",
      balance: toNumber(row?.balance),
    };
  }

  private async readHoldings(
    gameSessionId: string,
    playerId: string,
  ): Promise<readonly StockMarketPlayerHoldingDto[]> {
    const response = await this.client
      .from("stock_holdings")
      .select(HOLDING_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .order("ticker", { ascending: true });

    if (response.error) {
      throw mapPlayerReadError(response.error);
    }

    const holdingRows = (response.data ?? []) as StockHoldingReadRow[];

    if (holdingRows.length === 0) {
      return [];
    }

    const assetRows = await this.readAssets(
      gameSessionId,
      unique(holdingRows.map((holding) => holding.stock_asset_id)),
    );
    const assetsById = new Map(
      assetRows.map((asset) => [asset.id, asset] as const),
    );

    return holdingRows.map((holding) =>
      toHoldingDto(holding, assetsById.get(holding.stock_asset_id))
    );
  }

  private async readAssets(
    gameSessionId: string,
    stockAssetIds: readonly string[],
  ): Promise<readonly GameSessionStockAssetReadRow[]> {
    const response = await this.client
      .from("game_session_stock_assets")
      .select(ASSET_SELECT)
      .eq("game_session_id", gameSessionId)
      .in("id", stockAssetIds);

    if (response.error) {
      throw mapPlayerReadError(response.error);
    }

    return (response.data ?? []) as GameSessionStockAssetReadRow[];
  }

  private async readOrders(
    input: StockMarketPlayerReadInput,
    playerId: string,
  ): Promise<readonly StockMarketPlayerOrderDto[]> {
    const response = await this.client
      .from("stock_orders")
      .select(ORDER_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_session_id", input.playerSessionId)
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(input.limit);

    if (response.error) {
      throw mapPlayerReadError(response.error);
    }

    return ((response.data ?? []) as StockOrderReadRow[]).map(toOrderDto);
  }

  private async readTrades(
    input: StockMarketPlayerReadInput,
    playerId: string,
  ): Promise<readonly StockMarketPlayerTradeDto[]> {
    const response = await this.client
      .from("stock_trades")
      .select(TRADE_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_session_id", input.playerSessionId)
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(input.limit);

    if (response.error) {
      throw mapPlayerReadError(response.error);
    }

    return ((response.data ?? []) as StockTradeReadRow[]).map(toTradeDto);
  }
}

function isUsablePlayerSession(
  row: PlayerSessionReadRow,
  now: Date,
): boolean {
  if (row.status !== "active" || row.revoked_at) {
    return false;
  }

  const expiresAtMs = Date.parse(row.expires_at);

  return Number.isFinite(expiresAtMs) && expiresAtMs > now.getTime();
}

function toHoldingDto(
  holding: StockHoldingReadRow,
  asset: GameSessionStockAssetReadRow | undefined,
): StockMarketPlayerHoldingDto {
  const quantity = toNumber(holding.quantity);
  const averageCost = toNumber(holding.average_cost);
  const currentPrice = toNumber(asset?.current_price);
  const marketValue = round(quantity * currentPrice);
  const costBasis = round(quantity * averageCost);
  const unrealizedPnl = round(marketValue - costBasis);

  return {
    stockAssetId: holding.stock_asset_id,
    ticker: asset?.ticker ?? holding.ticker,
    companyName: asset?.company_name ?? holding.ticker,
    sector: asset?.sector_key ?? "",
    countryCode: asset?.country_code ?? "",
    quantity,
    averageCost,
    currentPrice,
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPct: costBasis > 0
      ? round((unrealizedPnl / costBasis) * 100)
      : 0,
    realizedPnl: toNumber(holding.realized_pnl),
  };
}

function summarizePortfolio(
  cash: StockMarketPlayerCashDto,
  holdings: readonly StockMarketPlayerHoldingDto[],
) {
  const holdingsMarketValue = round(sum(holdings, (holding) => holding.marketValue));
  const totalCostBasis = round(sum(holdings, (holding) => holding.costBasis));
  const unrealizedPnl = round(sum(holdings, (holding) => holding.unrealizedPnl));
  const realizedPnl = round(sum(holdings, (holding) => holding.realizedPnl));

  return {
    cashBalance: cash.balance,
    holdingsMarketValue,
    totalEquity: round(cash.balance + holdingsMarketValue),
    totalCostBasis,
    unrealizedPnl,
    realizedPnl,
    positionsCount: holdings.filter((holding) => holding.quantity > 0).length,
  };
}

function toOrderDto(row: StockOrderReadRow): StockMarketPlayerOrderDto {
  return {
    orderId: row.id,
    stockAssetId: row.stock_asset_id,
    ticker: row.ticker,
    side: normalizeSide(row.side),
    quantity: toNumber(row.quantity),
    executionPrice: toNumber(row.execution_price),
    grossValue: toNumber(row.gross_value),
    status: row.status === "rejected" ? "rejected" : "filled",
    rejectionReason: row.rejection_reason ?? null,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

function toTradeDto(row: StockTradeReadRow): StockMarketPlayerTradeDto {
  return {
    tradeId: row.id,
    orderId: row.order_id,
    stockAssetId: row.stock_asset_id,
    ticker: row.ticker,
    side: normalizeSide(row.side),
    quantity: toNumber(row.quantity),
    executionPrice: toNumber(row.execution_price),
    grossValue: toNumber(row.gross_value),
    createdAt: row.created_at,
  };
}

function normalizeSide(value: string): "buy" | "sell" {
  return value === "sell" ? "sell" : "buy";
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function sum<T>(values: readonly T[], select: (value: T) => number): number {
  return values.reduce((total, value) => total + select(value), 0);
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

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mapPlayerReadError(
  error: SupabasePlayerReadQueryError,
): StockMarketPlayerReadError {
  if (isSchemaNotAppliedError(error)) {
    return new StockMarketPlayerReadError(
      "stock_market_player_read_schema_not_applied",
      "Stock market player read schema is not applied.",
      500,
    );
  }

  return new StockMarketPlayerReadError(
    "stock_market_player_read_failed",
    "Stock market player data could not be read.",
    500,
  );
}

function isSchemaNotAppliedError(error: SupabasePlayerReadQueryError): boolean {
  const message = error.message.toLowerCase();

  return error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}
