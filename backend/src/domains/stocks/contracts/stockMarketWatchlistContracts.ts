import type {
  StockMarketPlayerAssetDto,
  StockMarketPlayerAssetPaginationDto,
} from "./stockMarketPlayerAssetReadContracts.ts";

export interface StockMarketWatchlistScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface StockMarketWatchlistListInput
  extends StockMarketWatchlistScope {
  readonly limit: number;
  readonly offset: number;
}

export interface StockMarketWatchlistListResult {
  readonly assetIds: readonly string[];
  readonly pagination: StockMarketPlayerAssetPaginationDto;
}

export interface StockMarketWatchlistAssetIdsInput
  extends StockMarketWatchlistScope {
  readonly assetIds: readonly string[];
}

export interface StockMarketWatchlistMutationInput
  extends StockMarketWatchlistScope {
  readonly assetId: string;
  readonly isWatchlisted: boolean;
}

export interface StockMarketWatchlistMutationResult {
  readonly changed: boolean;
}

export interface StockMarketWatchlistRepository {
  listWatchlist(
    input: StockMarketWatchlistListInput,
  ): Promise<StockMarketWatchlistListResult>;

  listWatchlistedAssetIds(
    input: StockMarketWatchlistAssetIdsInput,
  ): Promise<ReadonlySet<string>>;

  setWatchlisted(
    input: StockMarketWatchlistMutationInput,
  ): Promise<StockMarketWatchlistMutationResult>;
}

export interface StockMarketWatchlistListSuccessBody {
  readonly ok: true;
  readonly action: "read_watchlist";
  readonly tickIndex: number;
  readonly assets: readonly StockMarketPlayerAssetDto[];
  readonly pagination: StockMarketPlayerAssetPaginationDto;
}

export interface StockMarketWatchlistMutationSuccessBody {
  readonly ok: true;
  readonly action: "add_watchlist" | "remove_watchlist";
  readonly assetId: string;
  readonly isWatchlisted: boolean;
  readonly changed: boolean;
}

export type StockMarketWatchlistErrorCode =
  | "invalid_player_session"
  | "stock_asset_not_available"
  | "stock_market_watchlist_schema_not_applied"
  | "stock_market_watchlist_failed";

export class StockMarketWatchlistError extends Error {
  readonly code: StockMarketWatchlistErrorCode;
  readonly status: number;

  constructor(
    code: StockMarketWatchlistErrorCode,
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "StockMarketWatchlistError";
    this.code = code;
    this.status = status;
  }
}
