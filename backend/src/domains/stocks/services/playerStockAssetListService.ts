import {
  type PlayerStockAssetDto,
  type PlayerStockAssetListQuery,
  type PlayerStockAssetListRepository,
  type PlayerStockAssetListResponseBody,
  type PlayerStockAssetListScope,
  PlayerStockAssetListError,
  PlayerStockAssetListPersistenceError,
  type PlayerStockAssetRecord,
} from "../contracts/playerStockAssetListContracts.ts";

export class PlayerStockAssetListService {
  constructor(private readonly repository: PlayerStockAssetListRepository) {}

  async listAssets(
    scope: PlayerStockAssetListScope,
    query: PlayerStockAssetListQuery,
  ): Promise<PlayerStockAssetListResponseBody> {
    try {
      const result = await this.repository.listAssets({
        gameId: scope.gameId,
        limit: query.limit + 1,
        offset: query.offset,
      });

      if (result.gameId !== scope.gameId) throw scopeViolation();
      if (
        result.assets.some((asset) => asset.gameId !== scope.gameId) ||
        result.latestTicks.some((tick) => tick.gameId !== scope.gameId)
      ) {
        throw scopeViolation();
      }

      const ordered = [...result.assets].sort((left, right) =>
        left.ticker.localeCompare(right.ticker) ||
        left.internalAssetUuid.localeCompare(right.internalAssetUuid)
      );
      const publicIds = ordered.map((asset) => asset.ticker);
      if (new Set(publicIds).size !== publicIds.length) throw scopeViolation();

      const page = ordered.slice(0, query.limit);
      const hasMore = ordered.length > query.limit;
      const latestByAssetUuid = new Map<string, { tickIndex: number; volume: number }>();

      for (const tick of result.latestTicks) {
        const current = latestByAssetUuid.get(tick.internalAssetUuid);
        if (!current || tick.tickIndex > current.tickIndex) {
          latestByAssetUuid.set(tick.internalAssetUuid, {
            tickIndex: tick.tickIndex,
            volume: tick.volume,
          });
        }
      }

      const assets = page.map((asset) =>
        toAssetDto(asset, latestByAssetUuid.get(asset.internalAssetUuid)?.volume ?? 0)
      );
      const sectors = [...new Set(assets.map((asset) => asset.sector))]
        .sort((left, right) => left.localeCompare(right));

      return {
        ok: true,
        generatedAt: scope.effectiveAt,
        availability: "available",
        tickIndex: result.latestTicks.reduce(
          (maximum, tick) => Math.max(maximum, tick.tickIndex),
          0,
        ),
        sectors: ["All", ...sectors],
        assets,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          returned: assets.length,
          hasMore,
          nextOffset: hasMore ? query.offset + query.limit : null,
        },
        emptyState: query.offset === 0 && assets.length === 0
          ? { reason: "stock_market_not_initialized" }
          : null,
      };
    } catch (error) {
      if (error instanceof PlayerStockAssetListError) throw error;
      if (error instanceof PlayerStockAssetListPersistenceError) {
        throw new PlayerStockAssetListError(
          "player_stock_asset_service_unavailable",
          "Player stock assets are temporarily unavailable.",
          503,
          true,
        );
      }
      throw error;
    }
  }
}

function toAssetDto(
  asset: PlayerStockAssetRecord,
  volume: number,
): PlayerStockAssetDto {
  const changePct = asset.previousClose > 0
    ? ((asset.currentPrice - asset.previousClose) / asset.previousClose) * 100
    : 0;

  return {
    assetId: asset.ticker,
    ticker: asset.ticker,
    companyName: asset.companyName,
    sector: asset.sector,
    countryCode: asset.countryCode,
    currentPrice: asset.currentPrice,
    previousClose: asset.previousClose,
    changePct: round(changePct),
    openPrice: asset.openPrice,
    dayHigh: asset.dayHigh,
    dayLow: asset.dayLow,
    volume,
    marketCap: asset.marketCap,
    currentVolatility: asset.currentVolatility,
    longRunVolatility: asset.longRunVolatility,
    description: asset.description,
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function scopeViolation(): PlayerStockAssetListError {
  return new PlayerStockAssetListError(
    "player_stock_asset_scope_violation",
    "Player stock assets could not be loaded.",
    500,
    false,
  );
}
