import type {
  StockMarketBoardStockDto,
  StockMarketHistoryPointDto,
} from "./stockMarketReadContracts.ts";

export interface StockMarketPlayerAssetListInput {
  readonly gameSessionId: string;
  readonly limit: number;
  readonly offset: number;
}

export interface StockMarketPlayerAssetDetailInput {
  readonly gameSessionId: string;
  readonly assetId: string;
  readonly historyLimit: number;
}

export interface StockMarketPlayerAssetBatchInput {
  readonly gameSessionId: string;
  readonly assetIds: readonly string[];
}

export interface StockMarketPlayerAssetPaginationDto {
  readonly limit: number;
  readonly offset: number;
  readonly returned: number;
  readonly hasMore: boolean;
  readonly nextOffset: number | null;
}

export interface StockMarketPlayerAssetListReadResult {
  readonly tickIndex: number;
  readonly assets: readonly StockMarketBoardStockDto[];
  readonly pagination: StockMarketPlayerAssetPaginationDto;
}

export interface StockMarketPlayerAssetDetailReadResult {
  readonly tickIndex: number;
  readonly asset: StockMarketBoardStockDto;
  readonly history: readonly StockMarketHistoryPointDto[];
}

export interface StockMarketPlayerAssetBatchReadResult {
  readonly tickIndex: number;
  readonly assets: readonly StockMarketBoardStockDto[];
}

export interface StockMarketPlayerAssetDto extends StockMarketBoardStockDto {
  readonly isWatchlisted: boolean;
}

export interface StockMarketPlayerAssetListResult {
  readonly tickIndex: number;
  readonly assets: readonly StockMarketPlayerAssetDto[];
  readonly pagination: StockMarketPlayerAssetPaginationDto;
}

export interface StockMarketPlayerAssetDetailResult {
  readonly tickIndex: number;
  readonly asset: StockMarketPlayerAssetDto;
  readonly history: readonly StockMarketHistoryPointDto[];
}

export interface StockMarketPlayerAssetReadRepository {
  listPlayerAssets(
    input: StockMarketPlayerAssetListInput,
  ): Promise<StockMarketPlayerAssetListReadResult>;

  readPlayerAsset(
    input: StockMarketPlayerAssetDetailInput,
  ): Promise<StockMarketPlayerAssetDetailReadResult>;

  readPlayerAssetsByIds(
    input: StockMarketPlayerAssetBatchInput,
  ): Promise<StockMarketPlayerAssetBatchReadResult>;
}

export interface StockMarketPlayerAssetListSuccessBody
  extends StockMarketPlayerAssetListResult {
  readonly ok: true;
  readonly action: "read_assets";
}

export interface StockMarketPlayerAssetDetailSuccessBody
  extends StockMarketPlayerAssetDetailResult {
  readonly ok: true;
  readonly action: "read_asset";
  readonly historyLimit: number;
  readonly historyReturned: number;
}

export type StockMarketPlayerAssetReadErrorCode = "stock_asset_not_available";

export class StockMarketPlayerAssetReadError extends Error {
  readonly code: StockMarketPlayerAssetReadErrorCode;
  readonly status: number;

  constructor(
    code: StockMarketPlayerAssetReadErrorCode,
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "StockMarketPlayerAssetReadError";
    this.code = code;
    this.status = status;
  }
}
