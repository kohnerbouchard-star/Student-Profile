import type {
  PlayerStockAssetDto,
  PlayerStockAssetRecord,
  PlayerStockLatestTickRecord,
} from "./playerStockAssetListContracts.ts";

export type PlayerStockWatchlistRoute =
  | { readonly kind: "watchlist" }
  | { readonly kind: "watchlist_asset"; readonly assetId: string }
  | { readonly kind: "malformed" };

export interface PlayerStockWatchlistListQuery {
  readonly limit: number;
  readonly offset: number;
}

export interface PlayerStockWatchlistScope {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly effectiveAt: string;
}

export interface PlayerStockWatchlistEntryRecord {
  readonly internalWatchlistUuid: string;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly internalAssetUuid: string;
  readonly createdAt: string;
}

export interface PlayerStockWatchlistListRepositoryResult {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly entries: readonly PlayerStockWatchlistEntryRecord[];
  readonly assets: readonly PlayerStockAssetRecord[];
  readonly latestTicks: readonly PlayerStockLatestTickRecord[];
}

export interface PlayerStockWatchlistMutationRepositoryResult {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly internalAssetUuid: string;
  readonly ticker: string;
  readonly isWatchlisted: boolean;
  readonly changed: boolean;
}

export interface PlayerStockWatchlistRepository {
  listWatchlist(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<PlayerStockWatchlistListRepositoryResult>;

  setWatchlisted(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly ticker: string;
    readonly isWatchlisted: boolean;
  }): Promise<PlayerStockWatchlistMutationRepositoryResult>;
}

export interface PlayerStockWatchlistAssetDto extends PlayerStockAssetDto {
  readonly isWatchlisted: true;
}

export interface PlayerStockWatchlistListResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly availability: "available";
  readonly tickIndex: number;
  readonly assets: readonly PlayerStockWatchlistAssetDto[];
  readonly pagination: {
    readonly limit: number;
    readonly offset: number;
    readonly returned: number;
    readonly hasMore: boolean;
    readonly nextOffset: number | null;
  };
  readonly emptyState: {
    readonly reason: "stock_watchlist_empty";
  } | null;
}

export interface PlayerStockWatchlistMutationResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly assetId: string;
  readonly isWatchlisted: boolean;
  readonly changed: boolean;
}

export class PlayerStockWatchlistError extends Error {
  constructor(
    readonly code:
      | "invalid_player_stock_watchlist_request"
      | "player_stock_watchlist_scope_violation"
      | "player_stock_watchlist_asset_not_found"
      | "player_stock_watchlist_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerStockWatchlistError";
  }
}

export class PlayerStockWatchlistPersistenceError extends Error {
  constructor(
    readonly code:
      | "player_stock_watchlist_schema_not_applied"
      | "player_stock_watchlist_read_failed"
      | "player_stock_watchlist_write_failed"
      | "player_stock_watchlist_asset_not_found",
    message: string,
  ) {
    super(message);
    this.name = "PlayerStockWatchlistPersistenceError";
  }
}
