import type {
  StockMarketPlayerHoldingDto,
  StockMarketPlayerOrderDto,
  StockMarketPlayerTradeDto,
} from "../contracts/stockMarketPlayerReadContracts.ts";
import { StockMarketPlayerReadError } from "../contracts/stockMarketPlayerReadContracts.ts";

export interface SupabasePlayerReadQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface PlayerSessionReadRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly status: string;
  readonly expires_at: string;
  readonly revoked_at?: string | null;
}

export interface AccountBalanceReadRow {
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

export interface StockHoldingReadRow {
  readonly game_session_id: string;
  readonly player_session_id: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly quantity: number | string;
  readonly average_cost: number | string;
  readonly realized_pnl: number | string;
}

export interface GameSessionStockAssetReadRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly current_price: number | string;
  readonly listing_currency_code: string;
}

export interface StockOrderReadRow {
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

export interface StockTradeReadRow {
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

export function isUsablePlayerSession(
  row: PlayerSessionReadRow,
  now: Date,
): boolean {
  if (row.status !== "active" || row.revoked_at) {
    return false;
  }

  const expiresAtMs = Date.parse(row.expires_at);

  return Number.isFinite(expiresAtMs) && expiresAtMs > now.getTime();
}

export function toHoldingDto(
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
    currencyCode: asset?.listing_currency_code ?? "UNKNOWN",
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

export function toOrderDto(row: StockOrderReadRow): StockMarketPlayerOrderDto {
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

export function toTradeDto(row: StockTradeReadRow): StockMarketPlayerTradeDto {
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

export function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

export function toNumber(value: number | string | null | undefined): number {
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

export function mapPlayerReadError(
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
