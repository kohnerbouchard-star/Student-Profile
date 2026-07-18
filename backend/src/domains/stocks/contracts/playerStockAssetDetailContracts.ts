import type {
  PlayerStockAssetDto,
  PlayerStockAssetRecord,
} from "./playerStockAssetListContracts.ts";

export interface PlayerStockAssetDetailQuery {
  readonly assetId: string;
  readonly historyLimit: number;
}

export interface PlayerStockAssetDetailScope {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly effectiveAt: string;
}

export interface PlayerStockAssetHistoryRecord {
  readonly gameId: string;
  readonly internalAssetUuid: string;
  readonly ticker: string;
  readonly tickIndex: number;
  readonly price: number;
  readonly previousPrice: number;
  readonly changePct: number;
  readonly volume: number;
  readonly createdAt: string;
}

export interface PlayerStockAssetDetailRepositoryResult {
  readonly gameId: string;
  readonly asset: PlayerStockAssetRecord | null;
  readonly history: readonly PlayerStockAssetHistoryRecord[];
}

export interface PlayerStockAssetDetailRepository {
  readAsset(input: {
    readonly gameId: string;
    readonly ticker: string;
    readonly historyLimit: number;
  }): Promise<PlayerStockAssetDetailRepositoryResult>;
}

export interface PlayerStockAssetHistoryPointDto {
  readonly tickIndex: number;
  readonly price: number;
  readonly previousPrice: number;
  readonly changePct: number;
  readonly volume: number;
  readonly createdAt: string;
}

export interface PlayerStockAssetDetailResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly availability: "available";
  readonly tickIndex: number;
  readonly asset: PlayerStockAssetDto;
  readonly history: readonly PlayerStockAssetHistoryPointDto[];
  readonly historyLimit: number;
  readonly historyReturned: number;
}

export class PlayerStockAssetDetailError extends Error {
  constructor(
    readonly code:
      | "invalid_player_stock_asset_detail_request"
      | "player_stock_asset_not_found"
      | "player_stock_asset_detail_scope_violation"
      | "player_stock_asset_detail_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerStockAssetDetailError";
  }
}

export class PlayerStockAssetDetailPersistenceError extends Error {
  constructor(
    readonly code:
      | "player_stock_asset_detail_schema_not_applied"
      | "player_stock_asset_detail_read_failed",
    message: string,
  ) {
    super(message);
    this.name = "PlayerStockAssetDetailPersistenceError";
  }
}
