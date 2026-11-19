// Pure assembly of already-read Dashboard panels; no persistence or request ownership.
import { balanceTotalForCurrency, round, summarizePortfolio, toCashDto, toHoldingDto, type AccountBalanceRow, type StockHoldingRow } from "./dashboardFinancialProjection.ts";
import { toInventoryDto, toLeaderboard, toMarketNewsDto, toPublicPlayerDto, toPublicStoreListingDto, toPurchaseHistoryDto } from "./dashboardReadProjection.ts";
import type { CountryInfo, GameSessionRow, PlayerRow, InventoryHoldingRow, StorePurchaseRow, StockMarketEventRow } from "./dashboardReadRows.ts";
import type { PlayerGameDashboardReadInput, PlayerGameDashboardSnapshot } from "../contracts/playerGameDashboardContracts.ts";
import type { StockMarketBoardStockDto, StockMarketPlayerOrderDto, StockMarketPlayerTradeDto } from "../../stocks/index.ts";
import type { PlayerContractsReadQuery } from "../../contracts/index.ts";

interface DashboardPanelInputs {
  readonly input: PlayerGameDashboardReadInput;
  readonly gameSession: GameSessionRow;
  readonly marketOpen: boolean;
  readonly publicMarket: { readonly tickIndex: number; readonly stocks: readonly StockMarketBoardStockDto[] };
  readonly players: readonly PlayerRow[];
  readonly countryByPlayerId: ReadonlyMap<string, CountryInfo>;
  readonly financialBalances: readonly AccountBalanceRow[];
  readonly holdings: readonly StockHoldingRow[];
  readonly orders: readonly StockMarketPlayerOrderDto[];
  readonly trades: readonly StockMarketPlayerTradeDto[];
  readonly storeListings: PlayerGameDashboardSnapshot["me"]["store"]["listings"];
  readonly inventory: readonly InventoryHoldingRow[];
  readonly purchases: readonly StorePurchaseRow[];
  readonly marketNews: readonly StockMarketEventRow[];
  readonly playerContracts: Awaited<ReturnType<PlayerContractsReadQuery["read"]>>;
}

export function projectDashboardPanels({ input, gameSession, marketOpen, publicMarket, players, countryByPlayerId, financialBalances, holdings, orders, trades, storeListings, inventory, purchases, marketNews, playerContracts }: DashboardPanelInputs): PlayerGameDashboardSnapshot {
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
