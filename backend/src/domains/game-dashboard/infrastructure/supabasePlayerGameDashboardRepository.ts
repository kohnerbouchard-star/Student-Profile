import type {
  PlayerGameDashboardCashBalanceDto,
  PlayerGameDashboardInventoryItemDto,
  PlayerGameDashboardLeaderboardEntryDto,
  PlayerGameDashboardMarketNewsDto,
  PlayerGameDashboardPublicPlayerDto,
  PlayerGameDashboardPublicStoreListingDto,
  PlayerGameDashboardReadInput,
  PlayerGameDashboardRepository,
  PlayerGameDashboardSnapshot,
} from "../contracts/playerGameDashboardContracts.ts";
import {
  PlayerGameDashboardError,
} from "../contracts/playerGameDashboardContracts.ts";
import type {
  StockMarketBoardStockDto,
} from "../../stocks/contracts/stockMarketReadContracts.ts";
import {
  StockMarketReadError,
} from "../../stocks/contracts/stockMarketReadContracts.ts";
import type {
  StockMarketPlayerHoldingDto,
  StockMarketPlayerOrderDto,
  StockMarketPlayerOrderStatus,
  StockMarketPlayerPortfolioSummaryDto,
  StockMarketPlayerTradeDto,
} from "../../stocks/contracts/stockMarketPlayerReadContracts.ts";
import {
  SupabaseStockMarketReadRepository,
} from "../../stocks/infrastructure/supabaseStockMarketReadRepository.ts";
import type {
  StoreItemDto,
} from "../../store/contracts/storeCatalogContracts.ts";
import type {
  StorePurchaseHistoryItemDto,
  StorePurchaseStatus,
} from "../../store/contracts/storePurchaseContracts.ts";

interface DashboardQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface DashboardQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: DashboardQueryError | null;
}

type DashboardTableName =
  | "account_balances"
  | "country_profiles"
  | "game_session_stock_assets"
  | "game_sessions"
  | "inventory_holdings"
  | "player_country_assignments"
  | "players"
  | "stock_market_events"
  | "stock_price_ticks"
  | "stock_holdings"
  | "stock_orders"
  | "stock_trades"
  | "store_items"
  | "store_purchases";

interface SupabasePlayerGameDashboardClient {
  from(tableName: DashboardTableName): SupabasePlayerGameDashboardQueryBuilder;
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<DashboardQueryResponse<Data>>;
}

interface SupabasePlayerGameDashboardQueryBuilder {
  select(columns: string): SupabasePlayerGameDashboardFilterBuilder;
}

interface SupabasePlayerGameDashboardFilterBuilder
  extends PromiseLike<DashboardQueryResponse<unknown[]>> {
  eq(
    column: string,
    value: unknown,
  ): SupabasePlayerGameDashboardFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabasePlayerGameDashboardFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabasePlayerGameDashboardFilterBuilder;
  limit(count: number): SupabasePlayerGameDashboardFilterBuilder;
  maybeSingle(): PromiseLike<DashboardQueryResponse<unknown>>;
}

interface GameSessionRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly updated_at?: string | null;
}

interface PlayerRow {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label?: string | null;
}

interface CountryAssignmentRow {
  readonly player_id: string;
  readonly country_profile_id: string;
  readonly assigned_at: string;
}

interface CountryProfileRow {
  readonly id: string;
  readonly country_code: string;
  readonly currency_code?: string | null;
}

interface AccountBalanceRow {
  readonly player_id: string;
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

interface StockHoldingRow {
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly quantity: number | string;
  readonly average_cost: number | string;
  readonly realized_pnl: number | string;
}

interface StockOrderRow {
  readonly id: string;
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

interface StockTradeRow {
  readonly id: string;
  readonly order_id: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly side: string;
  readonly quantity: number | string;
  readonly execution_price: number | string;
  readonly gross_value: number | string;
  readonly created_at: string;
}

interface StoreItemRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly item_key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly category: string;
  readonly price: number | string;
  readonly currency_code: string;
  readonly stock_quantity: number | string;
  readonly status: StoreItemDto["status"];
  readonly visibility: StoreItemDto["visibility"];
  readonly sort_order: number | string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface InventoryHoldingRow {
  readonly id: string;
  readonly store_item_id: string;
  readonly quantity_owned: number | string;
  readonly quantity_reserved: number | string;
  readonly updated_at: string;
}

interface StorePurchaseRow {
  readonly id: string;
  readonly store_item_id: string;
  readonly quantity: number | string;
  readonly final_total_price: number | string;
  readonly currency_code: string;
  readonly status: StorePurchaseStatus;
  readonly created_at: string;
}

interface StockMarketEventRow {
  readonly id: string;
  readonly shock_id: string;
  readonly category?: string | null;
  readonly sentiment?: string | null;
  readonly source?: string | null;
  readonly visibility?: string | null;
  readonly scope: string;
  readonly target_key?: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number | string;
  readonly expires_tick?: number | string | null;
  readonly created_at: string;
}

interface CountryInfo {
  readonly countryCode: string | null;
  readonly currencyCode: string | null;
}

const GAME_SESSION_SELECT = "id,name,status,updated_at";
const PLAYER_SELECT = "id,display_name,roster_label";
const COUNTRY_ASSIGNMENT_SELECT = "player_id,country_profile_id,assigned_at";
const COUNTRY_PROFILE_SELECT = "id,country_code,currency_code";
const CASH_SELECT = "player_id,account_type,balance,currency_code";
const HOLDING_SELECT =
  "player_id,stock_asset_id,ticker,quantity,average_cost,realized_pnl";
const ORDER_SELECT = [
  "id",
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
  "player_id",
  "stock_asset_id",
  "ticker",
  "side",
  "quantity",
  "execution_price",
  "gross_value",
  "created_at",
].join(",");
const STORE_ITEM_SELECT = [
  "id",
  "game_session_id",
  "item_key",
  "name",
  "description",
  "category",
  "price",
  "currency_code",
  "stock_quantity",
  "status",
  "visibility",
  "sort_order",
  "created_at",
  "updated_at",
].join(",");
const INVENTORY_SELECT =
  "id,store_item_id,quantity_owned,quantity_reserved,updated_at";
const STORE_PURCHASE_SELECT =
  "id,store_item_id,quantity,final_total_price,currency_code,status,created_at";
const MARKET_NEWS_SELECT = [
  "id",
  "shock_id",
  "category",
  "sentiment",
  "source",
  "visibility",
  "scope",
  "target_key",
  "headline",
  "explanation",
  "created_tick",
  "expires_tick",
  "created_at",
].join(",");

export class SupabasePlayerGameDashboardRepository
  implements PlayerGameDashboardRepository {
  constructor(private readonly client: SupabasePlayerGameDashboardClient) {}

  async read(
    input: PlayerGameDashboardReadInput,
  ): Promise<PlayerGameDashboardSnapshot> {
    const [
      gameSession,
      publicMarket,
      players,
      countryByPlayerId,
      cashBalances,
      holdings,
      orders,
      trades,
      storeListings,
      inventory,
      purchases,
      marketNews,
    ] = await Promise.all([
      this.readGameSession(input.gameSessionId),
      this.readPublicStockMarket(input.gameSessionId),
      this.readActivePlayers(input.gameSessionId),
      this.readCountryAssignments(input.gameSessionId),
      this.readCashBalances(input.gameSessionId),
      this.readStockHoldings(input.gameSessionId),
      this.readStockOrders(input),
      this.readStockTrades(input),
      this.readStoreListings(input.gameSessionId),
      this.readInventory(input),
      this.readRecentPurchases(input),
      this.readMarketNews(input.gameSessionId),
    ]);

    const stockByAssetId = new Map(
      publicMarket.stocks.map((stock) => [stock.assetId, stock] as const),
    );
    const storeItemById = new Map(
      storeListings.map((item) => [item.id, item] as const),
    );
    const meCountry = countryByPlayerId.get(input.playerId) ?? {
      countryCode: null,
      currencyCode: null,
    };
    const meCash = toCashDto(
      cashBalances.filter((balance) => balance.player_id === input.playerId),
      meCountry.currencyCode,
    );
    const meHoldings = holdings
      .filter((holding) => holding.player_id === input.playerId)
      .map((holding) =>
        toHoldingDto(holding, stockByAssetId.get(holding.stock_asset_id))
      );
    const portfolio = summarizePortfolio(meCash, meHoldings);
    const leaderboard = toLeaderboard(
      players,
      countryByPlayerId,
      cashBalances,
      holdings,
      stockByAssetId,
    );
    const myLeaderboardEntry = leaderboard.find((entry) =>
      entry.playerId === input.playerId
    );

    return {
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
        marketStatus: gameSession.status === "active" ? "open" : "closed",
        currentTick: publicMarket.tickIndex,
        updatedAt: gameSession.updated_at ?? null,
      },
      me: {
        playerId: input.playerId,
        displayName: input.playerDisplayName,
        rosterLabel: input.playerRosterLabel,
        countryCode: meCountry.countryCode,
        netWorth: myLeaderboardEntry?.netWorth ?? portfolio.totalEquity,
        cash: meCash,
        stocks: {
          portfolio,
          holdings: meHoldings,
          orders,
          trades,
        },
        store: {
          currencyCode: meCountry.currencyCode ?? meCash.primaryCurrencyCode,
          listings: storeListings,
          inventory: inventory.map((row) => toInventoryDto(row, storeItemById)),
          recentPurchases: purchases.map((row) =>
            toPurchaseHistoryDto(row, storeItemById)
          ),
        },
        contracts: {
          available: [],
          progress: [],
        },
      },
      public: {
        leaderboard,
        players: players.map((player) =>
          toPublicPlayerDto(player, countryByPlayerId.get(player.id))
        ),
        market: {
          stocks: publicMarket.stocks,
          news: marketNews.map(toMarketNewsDto),
        },
        contracts: [],
        storeListings: storeListings.map(toPublicStoreListingDto),
      },
      unseenCutscenes: [],
    };
  }

  private async readGameSession(
    gameSessionId: string,
  ): Promise<GameSessionRow> {
    const response = await this.client
      .from("game_sessions")
      .select(GAME_SESSION_SELECT)
      .eq("id", gameSessionId)
      .maybeSingle();

    if (response.error) {
      throw readFailed();
    }

    const row = response.data as GameSessionRow | null;

    if (!row?.id) {
      throw new PlayerGameDashboardError(
        "game_dashboard_game_session_not_found",
        "Game dashboard game session could not be found.",
        404,
      );
    }

    return row;
  }

  private async readPublicStockMarket(
    gameSessionId: string,
  ): Promise<{
    readonly tickIndex: number;
    readonly stocks: readonly StockMarketBoardStockDto[];
  }> {
    try {
      const result = await new SupabaseStockMarketReadRepository(
        this.client as any,
      )
        .read({
          gameSessionId,
          includeHistory: false,
          historyLimit: 1,
        });

      return {
        tickIndex: result.tickIndex,
        stocks: result.stocks,
      };
    } catch (error) {
      if (error instanceof StockMarketReadError) {
        throw new PlayerGameDashboardError(
          error.code === "game_session_not_found"
            ? "game_dashboard_game_session_not_found"
            : "game_dashboard_read_failed",
          error.message,
          error.status,
        );
      }

      throw error;
    }
  }

  private async readActivePlayers(
    gameSessionId: string,
  ): Promise<readonly PlayerRow[]> {
    const response = await this.client
      .from("players")
      .select(PLAYER_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .order("display_name", { ascending: true });

    if (response.error) {
      throw readFailed();
    }

    return (response.data ?? []) as PlayerRow[];
  }

  private async readCountryAssignments(
    gameSessionId: string,
  ): Promise<ReadonlyMap<string, CountryInfo>> {
    const response = await this.client
      .from("player_country_assignments")
      .select(COUNTRY_ASSIGNMENT_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false });

    if (response.error) {
      throw readFailed();
    }

    const assignments = (response.data ?? []) as CountryAssignmentRow[];
    const countryProfileIds = unique(
      assignments.map((assignment) => assignment.country_profile_id),
    );

    if (countryProfileIds.length === 0) {
      return new Map();
    }

    const countriesResponse = await this.client
      .from("country_profiles")
      .select(COUNTRY_PROFILE_SELECT)
      .in("id", countryProfileIds);

    if (countriesResponse.error) {
      throw readFailed();
    }

    const countryById = new Map(
      ((countriesResponse.data ?? []) as CountryProfileRow[])
        .map((country) => [country.id, country] as const),
    );
    const countryByPlayerId = new Map<string, CountryInfo>();

    for (const assignment of assignments) {
      if (countryByPlayerId.has(assignment.player_id)) {
        continue;
      }

      const country = countryById.get(assignment.country_profile_id);
      countryByPlayerId.set(assignment.player_id, {
        countryCode: country?.country_code ?? null,
        currencyCode: country?.currency_code ?? null,
      });
    }

    return countryByPlayerId;
  }

  private async readCashBalances(
    gameSessionId: string,
  ): Promise<readonly AccountBalanceRow[]> {
    const response = await this.client
      .from("account_balances")
      .select(CASH_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("account_type", "cash")
      .order("currency_code", { ascending: true });

    if (response.error) {
      throw readFailed();
    }

    return (response.data ?? []) as AccountBalanceRow[];
  }

  private async readStockHoldings(
    gameSessionId: string,
  ): Promise<readonly StockHoldingRow[]> {
    const response = await this.client
      .from("stock_holdings")
      .select(HOLDING_SELECT)
      .eq("game_session_id", gameSessionId)
      .order("ticker", { ascending: true });

    if (response.error) {
      throw readFailed();
    }

    return (response.data ?? []) as StockHoldingRow[];
  }

  private async readStockOrders(
    input: PlayerGameDashboardReadInput,
  ): Promise<readonly StockMarketPlayerOrderDto[]> {
    const response = await this.client
      .from("stock_orders")
      .select(ORDER_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (response.error) {
      throw readFailed();
    }

    return ((response.data ?? []) as StockOrderRow[]).map(toOrderDto);
  }

  private async readStockTrades(
    input: PlayerGameDashboardReadInput,
  ): Promise<readonly StockMarketPlayerTradeDto[]> {
    const response = await this.client
      .from("stock_trades")
      .select(TRADE_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (response.error) {
      throw readFailed();
    }

    return ((response.data ?? []) as StockTradeRow[]).map(toTradeDto);
  }

  private async readStoreListings(
    gameSessionId: string,
  ): Promise<readonly StoreItemDto[]> {
    const response = await this.client
      .from("store_items")
      .select(STORE_ITEM_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .eq("visibility", "visible")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (response.error) {
      throw readFailed();
    }

    return ((response.data ?? []) as StoreItemRow[]).map(toStoreItemDto);
  }

  private async readInventory(
    input: PlayerGameDashboardReadInput,
  ): Promise<readonly InventoryHoldingRow[]> {
    const response = await this.client
      .from("inventory_holdings")
      .select(INVENTORY_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("updated_at", { ascending: false });

    if (response.error) {
      throw readFailed();
    }

    return (response.data ?? []) as InventoryHoldingRow[];
  }

  private async readRecentPurchases(
    input: PlayerGameDashboardReadInput,
  ): Promise<readonly StorePurchaseRow[]> {
    const response = await this.client
      .from("store_purchases")
      .select(STORE_PURCHASE_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (response.error) {
      throw readFailed();
    }

    return (response.data ?? []) as StorePurchaseRow[];
  }

  private async readMarketNews(
    gameSessionId: string,
  ): Promise<readonly StockMarketEventRow[]> {
    const response = await this.client
      .from("stock_market_events")
      .select(MARKET_NEWS_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true)
      .order("created_tick", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(25);

    if (response.error) {
      throw readFailed();
    }

    return (response.data ?? []) as StockMarketEventRow[];
  }
}

function toCashDto(
  rows: readonly AccountBalanceRow[],
  preferredCurrencyCode: string | null,
): {
  readonly balances: readonly PlayerGameDashboardCashBalanceDto[];
  readonly primaryCurrencyCode: string | null;
  readonly totalBalance: number;
} {
  const balances = rows.map((row) => ({
    accountType: row.account_type,
    currencyCode: row.currency_code,
    balance: toNumber(row.balance),
  }));

  return {
    balances,
    primaryCurrencyCode: preferredCurrencyCode ?? balances[0]?.currencyCode ??
      null,
    totalBalance: round(sum(balances, (balance) => balance.balance)),
  };
}

function toHoldingDto(
  holding: StockHoldingRow,
  stock: StockMarketBoardStockDto | undefined,
): StockMarketPlayerHoldingDto {
  const quantity = toNumber(holding.quantity);
  const averageCost = toNumber(holding.average_cost);
  const currentPrice = stock?.currentPrice ?? 0;
  const marketValue = round(quantity * currentPrice);
  const costBasis = round(quantity * averageCost);
  const unrealizedPnl = round(marketValue - costBasis);

  return {
    stockAssetId: holding.stock_asset_id,
    ticker: stock?.ticker ?? holding.ticker,
    companyName: stock?.companyName ?? holding.ticker,
    sector: stock?.sector ?? "",
    countryCode: stock?.countryCode ?? "",
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
  cash: ReturnType<typeof toCashDto>,
  holdings: readonly StockMarketPlayerHoldingDto[],
): StockMarketPlayerPortfolioSummaryDto {
  const holdingsMarketValue = round(
    sum(holdings, (holding) => holding.marketValue),
  );
  const totalCostBasis = round(sum(holdings, (holding) => holding.costBasis));
  const unrealizedPnl = round(
    sum(holdings, (holding) => holding.unrealizedPnl),
  );
  const realizedPnl = round(sum(holdings, (holding) => holding.realizedPnl));

  return {
    cashBalance: cash.totalBalance,
    holdingsMarketValue,
    totalEquity: round(cash.totalBalance + holdingsMarketValue),
    totalCostBasis,
    unrealizedPnl,
    realizedPnl,
    positionsCount: holdings.filter((holding) => holding.quantity > 0).length,
  };
}

function toOrderDto(row: StockOrderRow): StockMarketPlayerOrderDto {
  return {
    orderId: row.id,
    stockAssetId: row.stock_asset_id,
    ticker: row.ticker,
    side: normalizeSide(row.side),
    quantity: toNumber(row.quantity),
    executionPrice: toNumber(row.execution_price),
    grossValue: toNumber(row.gross_value),
    status: normalizeOrderStatus(row.status),
    rejectionReason: row.rejection_reason ?? null,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

function toTradeDto(row: StockTradeRow): StockMarketPlayerTradeDto {
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

function toStoreItemDto(row: StoreItemRow): StoreItemDto {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    itemKey: row.item_key,
    name: row.name,
    description: row.description ?? null,
    category: row.category,
    price: toNumber(row.price),
    currencyCode: row.currency_code,
    stockQuantity: Math.trunc(toNumber(row.stock_quantity)),
    status: row.status,
    visibility: row.visibility,
    sortOrder: Math.trunc(toNumber(row.sort_order)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInventoryDto(
  row: InventoryHoldingRow,
  storeItemById: ReadonlyMap<string, StoreItemDto>,
): PlayerGameDashboardInventoryItemDto {
  const item = storeItemById.get(row.store_item_id);

  return {
    inventoryId: row.id,
    itemId: row.store_item_id,
    itemName: item?.name ?? "Unknown item",
    quantityOwned: Math.trunc(toNumber(row.quantity_owned)),
    quantityReserved: Math.trunc(toNumber(row.quantity_reserved)),
    updatedAt: row.updated_at,
  };
}

function toPurchaseHistoryDto(
  row: StorePurchaseRow,
  storeItemById: ReadonlyMap<string, StoreItemDto>,
): StorePurchaseHistoryItemDto {
  const item = storeItemById.get(row.store_item_id);

  return {
    purchaseId: row.id,
    itemId: row.store_item_id,
    itemName: item?.name ?? "Unknown item",
    quantity: Math.trunc(toNumber(row.quantity)),
    finalTotalPrice: toNumber(row.final_total_price),
    currencyCode: row.currency_code,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toPublicStoreListingDto(
  item: StoreItemDto,
): PlayerGameDashboardPublicStoreListingDto {
  return {
    itemId: item.id,
    itemKey: item.itemKey,
    name: item.name,
    description: item.description,
    category: item.category,
    stockQuantity: item.stockQuantity,
    status: item.status,
    visibility: item.visibility,
    sortOrder: item.sortOrder,
    updatedAt: item.updatedAt,
  };
}

function toMarketNewsDto(
  row: StockMarketEventRow,
): PlayerGameDashboardMarketNewsDto {
  return {
    id: row.id,
    shockId: row.shock_id,
    category: row.category ?? "sector",
    sentiment: row.sentiment ?? "neutral",
    source: row.source ?? "runner",
    scope: row.scope,
    targetKey: row.target_key ?? null,
    headline: row.headline,
    explanation: row.explanation,
    createdTick: Math.trunc(toNumber(row.created_tick)),
    expiresTick: row.expires_tick === null || row.expires_tick === undefined
      ? null
      : Math.trunc(toNumber(row.expires_tick)),
    createdAt: row.created_at,
  };
}

function toPublicPlayerDto(
  player: PlayerRow,
  country: CountryInfo | undefined,
): PlayerGameDashboardPublicPlayerDto {
  return {
    playerId: player.id,
    displayName: player.display_name,
    rosterLabel: player.roster_label ?? null,
    countryCode: country?.countryCode ?? null,
  };
}

function toLeaderboard(
  players: readonly PlayerRow[],
  countryByPlayerId: ReadonlyMap<string, CountryInfo>,
  cashBalances: readonly AccountBalanceRow[],
  holdings: readonly StockHoldingRow[],
  stockByAssetId: ReadonlyMap<string, StockMarketBoardStockDto>,
): readonly PlayerGameDashboardLeaderboardEntryDto[] {
  const cashByPlayerId = groupBy(cashBalances, (balance) => balance.player_id);
  const holdingsByPlayerId = groupBy(holdings, (holding) => holding.player_id);

  return players
    .map((player) => {
      const cashTotal = sum(
        cashByPlayerId.get(player.id) ?? [],
        (balance) => toNumber(balance.balance),
      );
      const holdingsMarketValue = sum(
        holdingsByPlayerId.get(player.id) ?? [],
        (holding) => {
          const stock = stockByAssetId.get(holding.stock_asset_id);
          return toNumber(holding.quantity) * (stock?.currentPrice ?? 0);
        },
      );

      return {
        ...toPublicPlayerDto(player, countryByPlayerId.get(player.id)),
        rank: 0,
        netWorth: round(cashTotal + holdingsMarketValue),
      };
    })
    .sort((left, right) =>
      right.netWorth - left.netWorth ||
      left.displayName.localeCompare(right.displayName) ||
      left.playerId.localeCompare(right.playerId)
    )
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

function normalizeSide(value: string): "buy" | "sell" {
  return value === "sell" ? "sell" : "buy";
}

function normalizeOrderStatus(value: string): StockMarketPlayerOrderStatus {
  return value === "rejected" ? "rejected" : "filled";
}

function groupBy<T>(
  values: readonly T[],
  keyForValue: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const key = keyForValue(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }

  return groups;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value))];
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

function readFailed(): PlayerGameDashboardError {
  return new PlayerGameDashboardError(
    "game_dashboard_read_failed",
    "Player game dashboard could not be loaded.",
    500,
  );
}
