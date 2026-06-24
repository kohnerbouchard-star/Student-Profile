import type {
  StockMarketBoardStockDto,
} from "../../stocks/contracts/stockMarketReadContracts.ts";
import type {
  StockMarketPlayerHoldingDto,
  StockMarketPlayerOrderDto,
  StockMarketPlayerPortfolioSummaryDto,
  StockMarketPlayerTradeDto,
} from "../../stocks/contracts/stockMarketPlayerReadContracts.ts";
import type {
  StoreItemDto,
} from "../../store/contracts/storeCatalogContracts.ts";
import type {
  StorePurchaseHistoryItemDto,
} from "../../store/contracts/storePurchaseContracts.ts";

export const GAME_PUBLIC_REALTIME_EVENTS = [
  "stock_tick",
  "market_news_posted",
  "leaderboard_updated",
  "contract_posted",
  "contract_updated",
  "store_item_posted",
  "store_item_updated",
  "store_prices_updated",
  "store_status_changed",
  "market_status_changed",
] as const;

export type GamePublicRealtimeEvent =
  typeof GAME_PUBLIC_REALTIME_EVENTS[number];

export interface GamePublicRealtimeEventEnvelope<
  TEvent extends GamePublicRealtimeEvent = GamePublicRealtimeEvent,
> {
  readonly gameSessionId: string;
  readonly channel: string;
  readonly sequence: number;
  readonly eventType: TEvent;
  readonly occurredAt: string;
  readonly payload: GamePublicRealtimeEventPayload<TEvent>;
}

export type GamePublicRealtimeEventPayload<
  TEvent extends GamePublicRealtimeEvent,
> = TEvent extends "stock_tick" ? {
    readonly tickIndex: number;
    readonly stockAssetIds?: readonly string[];
  }
  : TEvent extends "market_news_posted" ? {
      readonly newsId: string;
    }
  : TEvent extends "leaderboard_updated" ? {
      readonly reason?: string | null;
    }
  : TEvent extends "contract_posted" | "contract_updated" ? {
      readonly contractId: string;
    }
  : TEvent extends "store_item_posted" | "store_item_updated" ? {
      readonly itemId: string;
    }
  : TEvent extends "store_prices_updated" ? {
      readonly itemIds?: readonly string[];
    }
  : TEvent extends "store_status_changed" ? {
      readonly itemId: string;
      readonly status: string;
    }
  : TEvent extends "market_status_changed" ? {
      readonly marketStatus: string;
    }
  : Record<string, never>;

export interface PlayerGameDashboardReadInput {
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly playerId: string;
  readonly playerDisplayName: string;
  readonly playerRosterLabel: string | null;
}

export interface PlayerGameDashboardGameSessionDto {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly marketStatus: "open" | "closed";
  readonly currentTick: number;
  readonly updatedAt: string | null;
}

export interface PlayerGameDashboardCashBalanceDto {
  readonly accountType: string;
  readonly currencyCode: string;
  readonly balance: number;
}

export interface PlayerGameDashboardCashDto {
  readonly balances: readonly PlayerGameDashboardCashBalanceDto[];
  readonly primaryCurrencyCode: string | null;
  readonly totalBalance: number;
}

export interface PlayerGameDashboardInventoryItemDto {
  readonly inventoryId: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly quantityOwned: number;
  readonly quantityReserved: number;
  readonly updatedAt: string;
}

export interface PlayerGameDashboardMarketNewsDto {
  readonly id: string;
  readonly shockId: string;
  readonly scope: "global" | "country" | "sector" | "ticker" | string;
  readonly targetKey: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly createdTick: number;
  readonly expiresTick: number | null;
  readonly createdAt: string;
}

export interface PlayerGameDashboardPublicPlayerDto {
  readonly playerId: string;
  readonly displayName: string;
  readonly rosterLabel: string | null;
  readonly countryCode: string | null;
}

export interface PlayerGameDashboardLeaderboardEntryDto
  extends PlayerGameDashboardPublicPlayerDto {
  readonly rank: number;
  readonly netWorth: number;
}

export interface PlayerGameDashboardPublicStoreListingDto {
  readonly itemId: string;
  readonly itemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly stockQuantity: number;
  readonly status: string;
  readonly visibility: string;
  readonly sortOrder: number;
  readonly updatedAt: string;
}

export interface PlayerGameDashboardSnapshot {
  readonly gameSession: PlayerGameDashboardGameSessionDto;
  readonly me: {
    readonly playerId: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly countryCode: string | null;
    readonly netWorth: number;
    readonly cash: PlayerGameDashboardCashDto;
    readonly stocks: {
      readonly portfolio: StockMarketPlayerPortfolioSummaryDto;
      readonly holdings: readonly StockMarketPlayerHoldingDto[];
      readonly orders: readonly StockMarketPlayerOrderDto[];
      readonly trades: readonly StockMarketPlayerTradeDto[];
    };
    readonly store: {
      readonly currencyCode: string | null;
      readonly listings: readonly StoreItemDto[];
      readonly inventory: readonly PlayerGameDashboardInventoryItemDto[];
      readonly recentPurchases: readonly StorePurchaseHistoryItemDto[];
    };
    readonly contracts: {
      readonly available: readonly unknown[];
      readonly progress: readonly unknown[];
    };
  };
  readonly public: {
    readonly leaderboard: readonly PlayerGameDashboardLeaderboardEntryDto[];
    readonly players: readonly PlayerGameDashboardPublicPlayerDto[];
    readonly market: {
      readonly stocks: readonly StockMarketBoardStockDto[];
      readonly news: readonly PlayerGameDashboardMarketNewsDto[];
    };
    readonly contracts: readonly unknown[];
    readonly storeListings: readonly PlayerGameDashboardPublicStoreListingDto[];
  };
}

export interface PlayerGameDashboardResponseBody
  extends PlayerGameDashboardSnapshot {
  readonly ok: true;
  readonly realtime: {
    readonly publicChannel: string;
    readonly lastSequence: null;
    readonly events: readonly GamePublicRealtimeEvent[];
  };
}

export interface PlayerGameDashboardRepository {
  read(
    input: PlayerGameDashboardReadInput,
  ): Promise<PlayerGameDashboardSnapshot>;
}

export type PlayerGameDashboardErrorCode =
  | "invalid_game_dashboard_request"
  | "game_dashboard_game_session_not_found"
  | "game_dashboard_read_failed";

export class PlayerGameDashboardError extends Error {
  readonly code: PlayerGameDashboardErrorCode;
  readonly status: number;

  constructor(
    code: PlayerGameDashboardErrorCode,
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "PlayerGameDashboardError";
    this.code = code;
    this.status = status;
  }
}
