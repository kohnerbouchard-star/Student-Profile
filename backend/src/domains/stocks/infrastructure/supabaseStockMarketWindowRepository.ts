interface StockMarketOpenStateRpcError {
  readonly message: string;
  readonly code?: string;
}

interface StockMarketOpenStateRpcResponse<T> {
  readonly data: T | null;
  readonly error: StockMarketOpenStateRpcError | null;
}

export interface StockMarketOpenStateClient {
  rpc<T = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<StockMarketOpenStateRpcResponse<T>>;
}

export class StockMarketOpenStateReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockMarketOpenStateReadError";
  }
}

export async function readStockMarketOpenState(
  client: StockMarketOpenStateClient,
  gameSessionId: string,
  at: Date = new Date(),
): Promise<boolean> {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    throw new StockMarketOpenStateReadError(
      "A valid server market-evaluation time is required.",
    );
  }

  const response = await client.rpc<boolean>("is_stock_market_open_at", {
    p_game_session_id: gameSessionId,
    p_at: at.toISOString(),
  });

  if (response.error || typeof response.data !== "boolean") {
    throw new StockMarketOpenStateReadError(
      "Authoritative game market-session state could not be read.",
    );
  }

  return response.data;
}
