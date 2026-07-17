import {
  type StockMarketWatchlistAssetIdsInput,
  StockMarketWatchlistError,
  type StockMarketWatchlistListInput,
  type StockMarketWatchlistListResult,
  type StockMarketWatchlistMutationInput,
  type StockMarketWatchlistMutationResult,
  type StockMarketWatchlistRepository,
} from "../contracts/stockMarketWatchlistContracts.ts";

interface SupabaseWatchlistQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseWatchlistQueryResponse<T = unknown[]> {
  readonly data: T | null;
  readonly error: SupabaseWatchlistQueryError | null;
}

type StockMarketWatchlistTableName =
  | "game_session_stock_assets"
  | "player_stock_watchlist";

interface SupabaseStockMarketWatchlistClient {
  from(
    tableName: StockMarketWatchlistTableName,
  ): SupabaseStockMarketWatchlistQueryBuilder;
}

interface SupabaseStockMarketWatchlistQueryBuilder {
  select(columns: string): SupabaseStockMarketWatchlistFilterBuilder;
  insert(
    values: unknown,
  ): PromiseLike<SupabaseWatchlistQueryResponse<unknown[]>>;
  delete(): SupabaseStockMarketWatchlistDeleteBuilder;
}

interface SupabaseStockMarketWatchlistFilterBuilder
  extends PromiseLike<SupabaseWatchlistQueryResponse<unknown[]>> {
  eq(
    column: string,
    value: unknown,
  ): SupabaseStockMarketWatchlistFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseStockMarketWatchlistFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseStockMarketWatchlistFilterBuilder;
  limit(count: number): SupabaseStockMarketWatchlistFilterBuilder;
  range(
    from: number,
    to: number,
  ): SupabaseStockMarketWatchlistFilterBuilder;
}

interface SupabaseStockMarketWatchlistDeleteBuilder
  extends PromiseLike<SupabaseWatchlistQueryResponse<unknown[]>> {
  eq(
    column: string,
    value: unknown,
  ): SupabaseStockMarketWatchlistDeleteBuilder;
  select(
    columns: string,
  ): PromiseLike<SupabaseWatchlistQueryResponse<unknown[]>>;
}

interface PlayerStockWatchlistRow {
  readonly id: string;
  readonly stock_asset_id: string;
  readonly created_at: string;
}

const WATCHLIST_SELECT = "id,stock_asset_id,created_at";

export class SupabaseStockMarketWatchlistRepository
  implements StockMarketWatchlistRepository {
  constructor(private readonly client: SupabaseStockMarketWatchlistClient) {}

  async listWatchlist(
    input: StockMarketWatchlistListInput,
  ): Promise<StockMarketWatchlistListResult> {
    const response = await this.client
      .from("player_stock_watchlist")
      .select(WATCHLIST_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(input.offset, input.offset + input.limit);

    assertNoWatchlistError(response.error);

    const rows = (response.data ?? []) as PlayerStockWatchlistRow[];
    const hasMore = rows.length > input.limit;
    const pageRows = rows.slice(0, input.limit);

    return {
      assetIds: pageRows.map((row) => row.stock_asset_id),
      pagination: {
        limit: input.limit,
        offset: input.offset,
        returned: pageRows.length,
        hasMore,
        nextOffset: hasMore ? input.offset + input.limit : null,
      },
    };
  }

  async listWatchlistedAssetIds(
    input: StockMarketWatchlistAssetIdsInput,
  ): Promise<ReadonlySet<string>> {
    const assetIds = unique(input.assetIds);

    if (assetIds.length === 0) {
      return new Set();
    }

    const response = await this.client
      .from("player_stock_watchlist")
      .select("stock_asset_id")
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .in("stock_asset_id", assetIds);

    assertNoWatchlistError(response.error);

    return new Set(
      ((response.data ?? []) as { readonly stock_asset_id: string }[]).map(
        (row) => row.stock_asset_id,
      ),
    );
  }

  async setWatchlisted(
    input: StockMarketWatchlistMutationInput,
  ): Promise<StockMarketWatchlistMutationResult> {
    await this.assertActiveSameGameAsset(input.gameSessionId, input.assetId);

    return input.isWatchlisted
      ? await this.addWatchlistRow(input)
      : await this.removeWatchlistRow(input);
  }

  private async assertActiveSameGameAsset(
    gameSessionId: string,
    assetId: string,
  ): Promise<void> {
    const response = await this.client
      .from("game_session_stock_assets")
      .select("id")
      .eq("game_session_id", gameSessionId)
      .eq("id", assetId)
      .eq("is_active", true)
      .limit(1);

    assertNoWatchlistError(response.error);

    const row = ((response.data ?? []) as { readonly id: string }[])[0];

    if (!row?.id) {
      throw unavailableAssetError();
    }
  }

  private async addWatchlistRow(
    input: StockMarketWatchlistMutationInput,
  ): Promise<StockMarketWatchlistMutationResult> {
    const response = await this.client
      .from("player_stock_watchlist")
      .insert({
        game_session_id: input.gameSessionId,
        player_id: input.playerId,
        stock_asset_id: input.assetId,
      });

    if (response.error?.code === "23505") {
      return { changed: false };
    }

    assertNoWatchlistError(response.error);

    return { changed: true };
  }

  private async removeWatchlistRow(
    input: StockMarketWatchlistMutationInput,
  ): Promise<StockMarketWatchlistMutationResult> {
    const response = await this.client
      .from("player_stock_watchlist")
      .delete()
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .eq("stock_asset_id", input.assetId)
      .select("id");

    assertNoWatchlistError(response.error);

    return {
      changed: (response.data ?? []).length > 0,
    };
  }
}

function assertNoWatchlistError(
  error: SupabaseWatchlistQueryError | null,
): void {
  if (!error) {
    return;
  }

  if (
    error.code === "P0001" &&
    error.message.includes("player_stock_watchlist_asset_not_available")
  ) {
    throw unavailableAssetError();
  }

  if (
    error.code === "P0001" &&
    error.message.includes("player_stock_watchlist_player_not_active")
  ) {
    throw new StockMarketWatchlistError(
      "invalid_player_session",
      "Player session is invalid or expired.",
      401,
    );
  }

  if (isSchemaNotAppliedError(error)) {
    throw new StockMarketWatchlistError(
      "stock_market_watchlist_schema_not_applied",
      "Player stock watchlist schema is not applied.",
      500,
    );
  }

  throw new StockMarketWatchlistError(
    "stock_market_watchlist_failed",
    "Player stock watchlist could not be updated or loaded.",
    500,
  );
}

function unavailableAssetError(): StockMarketWatchlistError {
  return new StockMarketWatchlistError(
    "stock_asset_not_available",
    "Stock asset is not available in the authenticated game session.",
    404,
  );
}

function isSchemaNotAppliedError(error: SupabaseWatchlistQueryError): boolean {
  const message = error.message.toLowerCase();

  return error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
