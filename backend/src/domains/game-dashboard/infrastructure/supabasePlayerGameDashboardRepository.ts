import {
  type AccountBalanceRow,
  balanceTotalForCurrency,
  normalizeCurrencyCode,
  round,
  type StockHoldingRow,
  summarizePortfolio,
  toCashDto,
  toHoldingDto,
  unique,
} from "./dashboardFinancialProjection.ts";
import type {
  PlayerGameDashboardReadInput,
  PlayerGameDashboardRepository,
  PlayerGameDashboardSnapshot,
} from "../contracts/playerGameDashboardContracts.ts";
import {
  PlayerGameDashboardError,
} from "../contracts/playerGameDashboardContracts.ts";
import {
  type StockMarketBoardStockDto,
  type StockMarketOpenStateReadRepository,
  type StockMarketPlayerOrderDto,
  type StockMarketPlayerTradeDto,
  type StockMarketReadRepository,
  StockMarketReadError,
} from "../../stocks/index.ts";
import {
  DashboardStoreListingsReadError,
  type DashboardStoreListingsReadQuery,
  type StoreItemDto,
} from "../../store/dashboardReadModel.ts";
import type { PlayerContractsReadQuery } from "../../contracts/index.ts";

import {
  CASH_SELECT,
  COUNTRY_ASSIGNMENT_SELECT,
  COUNTRY_PROFILE_SELECT,
  type CountryAssignmentRow,
  type CountryInfo,
  type CountryProfileRow,
  GAME_SESSION_SELECT,
  type GameSessionRow,
  INVENTORY_SELECT,
  type InventoryHoldingRow,
  MARKET_NEWS_SELECT,
  ORDER_SELECT,
  PLAYER_SELECT,
  type PlayerRow,
  type StockMarketEventRow,
  type StockOrderRow,
  type StockTradeRow,
  STORE_PURCHASE_SELECT,
  type StorePurchaseRow,
  type SupabasePlayerGameDashboardClient,
  TRADE_SELECT,
} from "./dashboardReadRows.ts";
import {
  toInventoryDto,
  toLeaderboard,
  toMarketNewsDto,
  toOrderDto,
  toPublicPlayerDto,
  toPublicStoreListingDto,
  toPurchaseHistoryDto,
  toTradeDto,
} from "./dashboardReadProjection.ts";

export interface PlayerGameDashboardReadDependencies {
  readonly stockMarketReadRepository: StockMarketReadRepository;
  readonly stockMarketOpenStateReadRepository: StockMarketOpenStateReadRepository;
  readonly playerContractsReadQuery: PlayerContractsReadQuery;
  readonly storeListingsReadQuery: DashboardStoreListingsReadQuery;
}

export class SupabasePlayerGameDashboardRepository
  implements PlayerGameDashboardRepository {
  private readonly dependencies: PlayerGameDashboardReadDependencies;

  constructor(
    private readonly client: SupabasePlayerGameDashboardClient,
    dependencies: PlayerGameDashboardReadDependencies,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.dependencies = {
      stockMarketReadRepository: dependencies.stockMarketReadRepository,
      stockMarketOpenStateReadRepository: dependencies.stockMarketOpenStateReadRepository,
      playerContractsReadQuery: dependencies.playerContractsReadQuery,
      storeListingsReadQuery: dependencies.storeListingsReadQuery,
    };
  }

  async read(
    input: PlayerGameDashboardReadInput,
  ): Promise<PlayerGameDashboardSnapshot> {
    const [
      gameSession,
      marketOpen,
      publicMarket,
      players,
      countryByPlayerId,
      financialBalances,
      holdings,
      orders,
      trades,
      storeListings,
      inventory,
      purchases,
      marketNews,
      playerContracts,
    ] = await Promise.all([
      this.readGameSession(input.gameSessionId),
      this.dependencies.stockMarketOpenStateReadRepository.read(input.gameSessionId, this.now()),
      this.readPublicStockMarket(input.gameSessionId),
      this.readActivePlayers(input.gameSessionId),
      this.readCountryAssignments(input.gameSessionId),
      this.readFinancialBalances(input.gameSessionId),
      this.readStockHoldings(input.gameSessionId),
      this.readStockOrders(input),
      this.readStockTrades(input),
      this.readStoreListings(input.gameSessionId),
      this.readInventory(input),
      this.readRecentPurchases(input),
      this.readMarketNews(input.gameSessionId),
      this.dependencies.playerContractsReadQuery.read({
        gameSessionId: input.gameSessionId,
        playerId: input.playerId,
      }),
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
    const meBalances = financialBalances.filter((balance) =>
      balance.player_id === input.playerId
    );
    const meCheckingBalances = meBalances.filter((balance) =>
      balance.account_type === "checking"
    );
    const meSavingsTotal = balanceTotalForCurrency(
      meBalances.filter((balance) => balance.account_type === "savings"),
      meCountry.currencyCode,
    );
    const meCash = toCashDto(
      meCheckingBalances,
      meCountry.currencyCode,
    );
    const stockCash = toCashDto(meCheckingBalances, "ECO");
    const meHoldings = holdings
      .filter((holding) => holding.player_id === input.playerId)
      .map((holding) =>
        toHoldingDto(holding, stockByAssetId.get(holding.stock_asset_id))
      );
    const portfolio = summarizePortfolio(stockCash, meHoldings);
    const leaderboard = toLeaderboard(
      players,
      countryByPlayerId,
      financialBalances,
      holdings,
      stockByAssetId,
    );
    const myLeaderboardEntry = leaderboard.find((entry) =>
      entry.playerId === input.playerId
    );
    const valuationCurrencyCode = meCash.primaryCurrencyCode;
    const excludedStocksByCurrency = (portfolio.byCurrency ?? []).filter((
      value,
    ) =>
      value.currencyCode !== valuationCurrencyCode && value.marketValue !== 0
    );
    const excludedStockMarketValue = valuationCurrencyCode === "ECO"
      ? 0
      : portfolio.holdingsMarketValue;
    const matchingHoldingsMarketValue =
      portfolio.byCurrency?.find((value) =>
        value.currencyCode === valuationCurrencyCode
      )?.marketValue ?? 0;

    return {
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
        marketStatus: gameSession.status === "active" && marketOpen
          ? "open"
          : "closed",
        currentTick: publicMarket.tickIndex,
        updatedAt: gameSession.updated_at ?? null,
      },
      me: {
        playerId: input.playerId,
        displayName: input.playerDisplayName,
        rosterLabel: input.playerRosterLabel,
        countryCode: meCountry.countryCode,
        netWorth: myLeaderboardEntry?.netWorth ??
          round(
            meCash.totalBalance + meSavingsTotal +
              matchingHoldingsMarketValue,
          ),
        netWorthValuation: {
          currencyCode: valuationCurrencyCode,
          status: excludedStocksByCurrency.length === 0
            ? "complete"
            : "partial_unconverted",
          excludedStockMarketValue,
          excludedStocksByCurrency,
        },
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
          available: playerContracts.available,
          progress: playerContracts.progress,
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
        contracts: playerContracts.available,
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
      const result = await this.dependencies.stockMarketReadRepository.read({
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
        currencyCode: normalizeCurrencyCode(country?.currency_code),
      });
    }

    return countryByPlayerId;
  }

  private async readFinancialBalances(
    gameSessionId: string,
  ): Promise<readonly AccountBalanceRow[]> {
    const response = await this.client
      .from("account_balances")
      .select(CASH_SELECT)
      .eq("game_session_id", gameSessionId)
      .in("account_type", ["checking", "savings"])
      .order("account_type", { ascending: true })
      .order("currency_code", { ascending: true });

    if (response.error) {
      throw readFailed();
    }

    return (response.data ?? []) as AccountBalanceRow[];
  }

  private async readStockHoldings(
    gameSessionId: string,
  ): Promise<readonly StockHoldingRow[]> {
    const response = await this.client.rpc("read_game_stock_positions_v1", {
      p_game_session_id: gameSessionId,
    });
    if (response.error || !Array.isArray(response.data)) throw readFailed();
    const rows = response.data as StockHoldingRow[];
    if (
      rows.some((row) =>
        !row || row.game_session_id !== gameSessionId ||
        !normalizeCurrencyCode(row.listing_currency_code)
      )
    ) throw readFailed();
    return rows;
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
    try {
      return await this.dependencies.storeListingsReadQuery.read(gameSessionId);
    } catch (error) {
      if (error instanceof DashboardStoreListingsReadError) throw readFailed();
      throw error;
    }
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

function readFailed(): PlayerGameDashboardError {
  return new PlayerGameDashboardError(
    "game_dashboard_read_failed",
    "Player game dashboard could not be loaded.",
    500,
  );
}
