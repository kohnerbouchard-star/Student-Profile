import type {
  AccountBalanceReadRow,
  GameSessionStockAssetReadRow,
  PlayerSessionReadRow,
  StockHoldingReadRow,
  StockOrderReadRow,
  StockTradeReadRow,
  SupabasePlayerReadQueryError,
} from "./stockMarketPlayerReadRows.ts";
import {
  isUsablePlayerSession,
  mapPlayerReadError,
  toHoldingDto,
  toNumber,
  toOrderDto,
  toTradeDto,
  unique,
} from "./stockMarketPlayerReadRows.ts";
import { summarizePortfolio } from "../services/stockPortfolioValuation.ts";
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

interface SupabasePlayerReadQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabasePlayerReadQueryError | null;
}

type StockMarketPlayerReadTableName =
  | "account_balances"
  | "game_session_stock_assets"
  | "player_sessions"
  | "stock_orders"
  | "stock_trades";

interface SupabaseStockMarketPlayerReadClient {
  rpc<T>(
    functionName: string,
    args: unknown,
  ): PromiseLike<SupabasePlayerReadQueryResponse<T>>;
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

const ASSET_SELECT = [
  "id",
  "game_session_id",
  "ticker",
  "company_name",
  "sector_key",
  "country_code",
  "current_price",
  "listing_currency_code",
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
      .eq("account_type", "checking")
      .eq("currency_code", "ECO")
      .limit(1);

    if (response.error) {
      throw mapPlayerReadError(response.error);
    }

    const row = ((response.data ?? []) as AccountBalanceReadRow[])[0];

    return {
      accountType: "checking",
      currencyCode: row?.currency_code ?? "ECO",
      balance: toNumber(row?.balance),
    };
  }

  private async readHoldings(
    gameSessionId: string,
    playerId: string,
  ): Promise<readonly StockMarketPlayerHoldingDto[]> {
    const response = await this.client.rpc<readonly StockHoldingReadRow[]>(
      "read_player_stock_positions_v1",
      { p_game_session_id: gameSessionId, p_player_id: playerId },
    );

    if (response.error) {
      throw mapPlayerReadError(response.error);
    }

    const holdingRows = response.data ?? [];
    if (
      holdingRows.some((row) =>
        row.game_session_id !== gameSessionId || row.player_id !== playerId
      )
    ) {
      throw new StockMarketPlayerReadError(
        "stock_market_player_read_failed",
        "Stock position scope mismatch.",
      );
    }

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
