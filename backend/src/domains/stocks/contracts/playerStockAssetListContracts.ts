export type PlayerStockAssetListRoute =
  | { readonly kind: "assets" }
  | { readonly kind: "malformed" };

export interface PlayerStockAssetListQuery {
  readonly limit: number;
  readonly offset: number;
}

export interface PlayerStockAssetListScope {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly effectiveAt: string;
}

export interface PlayerStockAssetRecord {
  readonly internalAssetUuid: string;
  readonly gameId: string;
  readonly ticker: string;
  readonly companyName: string;
  readonly sector: string;
  readonly countryCode: string;
  readonly description: string | null;
  readonly currentPrice: number;
  readonly previousClose: number;
  readonly openPrice: number;
  readonly dayHigh: number;
  readonly dayLow: number;
  readonly marketCap: number | null;
  readonly currentVolatility: number;
  readonly longRunVolatility: number;
}

export interface PlayerStockLatestTickRecord {
  readonly gameId: string;
  readonly internalAssetUuid: string;
  readonly tickIndex: number;
  readonly volume: number;
}

export interface PlayerStockAssetListRepositoryResult {
  readonly gameId: string;
  readonly assets: readonly PlayerStockAssetRecord[];
  readonly latestTicks: readonly PlayerStockLatestTickRecord[];
}

export interface PlayerStockAssetListRepository {
  listAssets(input: {
    readonly gameId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<PlayerStockAssetListRepositoryResult>;
}

export interface PlayerStockAssetDto {
  readonly assetId: string;
  readonly ticker: string;
  readonly companyName: string;
  readonly sector: string;
  readonly countryCode: string;
  readonly currentPrice: number;
  readonly previousClose: number;
  readonly changePct: number;
  readonly openPrice: number;
  readonly dayHigh: number;
  readonly dayLow: number;
  readonly volume: number;
  readonly marketCap: number | null;
  readonly currentVolatility: number;
  readonly longRunVolatility: number;
  readonly description: string | null;
}

export interface PlayerStockAssetListResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly availability: "available";
  readonly tickIndex: number;
  readonly sectors: readonly string[];
  readonly assets: readonly PlayerStockAssetDto[];
  readonly pagination: {
    readonly limit: number;
    readonly offset: number;
    readonly returned: number;
    readonly hasMore: boolean;
    readonly nextOffset: number | null;
  };
  readonly emptyState: {
    readonly reason: "stock_market_not_initialized";
  } | null;
}

export class PlayerStockAssetListError extends Error {
  constructor(
    readonly code:
      | "invalid_player_stock_asset_list_request"
      | "player_stock_asset_scope_violation"
      | "player_stock_asset_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerStockAssetListError";
  }
}

export class PlayerStockAssetListPersistenceError extends Error {
  constructor(
    readonly code:
      | "player_stock_asset_schema_not_applied"
      | "player_stock_asset_read_failed",
    message: string,
  ) {
    super(message);
    this.name = "PlayerStockAssetListPersistenceError";
  }
}
