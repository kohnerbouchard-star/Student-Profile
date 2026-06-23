import type {
  InitializeStockMarketAssetsForGameRpcArgs,
  InitializeStockMarketAssetsForGameRpcRow,
  StockMarketSeedCopyInput,
  StockMarketSeedCopyRepository,
  StockMarketSeedCopyResult,
} from "../contracts/stockMarketSeedCopyContracts.ts";
import { StockMarketSeedCopyError } from "../contracts/stockMarketSeedCopyContracts.ts";

interface SupabaseSeedCopyQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseSeedCopyQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseSeedCopyQueryError | null;
}

interface SupabaseStockMarketSeedCopyClient {
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<SupabaseSeedCopyQueryResponse<Data>>;
}

export class SupabaseStockMarketSeedCopyRepository
  implements StockMarketSeedCopyRepository {
  constructor(private readonly client: SupabaseStockMarketSeedCopyClient) {}

  async initialize(
    input: StockMarketSeedCopyInput,
  ): Promise<StockMarketSeedCopyResult> {
    const args: InitializeStockMarketAssetsForGameRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_mode: input.mode,
    };
    const response = await this.client.rpc<
      readonly InitializeStockMarketAssetsForGameRpcRow[]
    >("initialize_stock_market_assets_for_game", args);

    if (response.error) {
      throw mapSeedCopyError(response.error);
    }

    const row = response.data?.[0];

    if (!row) {
      throw new StockMarketSeedCopyError(
        "stock_market_seed_copy_failed",
        "Stock market seed copy returned no result.",
        500,
      );
    }

    return {
      gameSessionId: row.game_session_id,
      templatesAvailable: Number(row.templates_available),
      assetsBefore: Number(row.assets_before),
      assetsInserted: Number(row.assets_inserted),
      baselineTicksInserted: Number(row.baseline_ticks_inserted),
      assetsAfter: Number(row.assets_after),
    };
  }
}

function mapSeedCopyError(
  error: SupabaseSeedCopyQueryError,
): StockMarketSeedCopyError {
  const message = error.message.toUpperCase();

  if (isSchemaNotAppliedError(error)) {
    return new StockMarketSeedCopyError(
      "stock_market_schema_not_applied",
      "Stock market seed/copy schema is not applied.",
      500,
    );
  }

  if (message.includes("GAME_SESSION_NOT_FOUND")) {
    return new StockMarketSeedCopyError(
      "game_session_not_found",
      "Game session could not be found.",
      404,
    );
  }

  if (
    message.includes("STOCK_MARKET_ALREADY_INITIALIZED") ||
    message.includes("STOCK_MARKET_RESET_EMPTY_ONLY_CONFLICT")
  ) {
    return new StockMarketSeedCopyError(
      "stock_market_already_initialized",
      "Stock market assets or ticks already exist for this game session.",
      409,
    );
  }

  return new StockMarketSeedCopyError(
    "stock_market_seed_copy_failed",
    "Stock market seed copy could not be completed.",
    500,
  );
}

function isSchemaNotAppliedError(error: SupabaseSeedCopyQueryError): boolean {
  const message = error.message.toLowerCase();

  return error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}
