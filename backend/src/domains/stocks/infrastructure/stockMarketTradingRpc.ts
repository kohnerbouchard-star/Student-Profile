export interface SupabaseTradingQueryError {
  readonly message?: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface SupabaseTradingQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseTradingQueryError | null;
}

export interface SupabaseStockMarketTradingClient {
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<SupabaseTradingQueryResponse<Data>>;
}

export type StockMarketTradingPhase =
  | "buy_quote"
  | "buy_settlement"
  | "sell_settlement";

export function unwrapStockTradingRpcJson(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 1) return value[0];
  return value;
}
