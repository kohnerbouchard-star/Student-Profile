import {
  type PlayerStockAssetDetailQuery,
  type PlayerStockAssetDetailRepository,
  type PlayerStockAssetDetailResponseBody,
  type PlayerStockAssetDetailScope,
  PlayerStockAssetDetailError,
  PlayerStockAssetDetailPersistenceError,
  type PlayerStockAssetHistoryPointDto,
} from "../contracts/playerStockAssetDetailContracts.ts";
import { toPlayerStockAssetDto } from "./playerStockAssetDtoMapper.ts";

export class PlayerStockAssetDetailService {
  constructor(private readonly repository: PlayerStockAssetDetailRepository) {}

  async readAsset(
    scope: PlayerStockAssetDetailScope,
    query: PlayerStockAssetDetailQuery,
  ): Promise<PlayerStockAssetDetailResponseBody> {
    try {
      const result = await this.repository.readAsset({
        gameId: scope.gameId,
        ticker: query.assetId,
        historyLimit: query.historyLimit,
      });

      if (result.gameId !== scope.gameId) throw scopeViolation();
      if (!result.asset) {
        throw new PlayerStockAssetDetailError(
          "player_stock_asset_not_found",
          "Stock asset is not available in the authenticated game.",
          404,
          false,
        );
      }

      const asset = result.asset;
      if (
        asset.gameId !== scope.gameId ||
        asset.ticker !== query.assetId ||
        result.history.some((point) =>
          point.gameId !== scope.gameId ||
          point.internalAssetUuid !== asset.internalAssetUuid ||
          point.ticker !== asset.ticker
        )
      ) {
        throw scopeViolation();
      }

      const orderedHistory = [...result.history].sort((left, right) =>
        left.tickIndex - right.tickIndex ||
        left.createdAt.localeCompare(right.createdAt)
      );
      const tickIndexes = orderedHistory.map((point) => point.tickIndex);
      if (new Set(tickIndexes).size !== tickIndexes.length) {
        throw scopeViolation();
      }

      const history = orderedHistory.map(toHistoryDto);
      const latest = orderedHistory.at(-1);

      return {
        ok: true,
        generatedAt: scope.effectiveAt,
        availability: "available",
        tickIndex: latest?.tickIndex ?? 0,
        asset: toPlayerStockAssetDto(asset, latest?.volume ?? 0),
        history,
        historyLimit: query.historyLimit,
        historyReturned: history.length,
      };
    } catch (error) {
      if (error instanceof PlayerStockAssetDetailError) throw error;
      if (error instanceof PlayerStockAssetDetailPersistenceError) {
        throw new PlayerStockAssetDetailError(
          "player_stock_asset_detail_service_unavailable",
          "Player stock asset detail is temporarily unavailable.",
          503,
          true,
        );
      }
      throw error;
    }
  }
}

function toHistoryDto(
  point: Parameters<typeof toHistoryDto>[0],
): PlayerStockAssetHistoryPointDto {
  return {
    tickIndex: point.tickIndex,
    price: point.price,
    previousPrice: point.previousPrice,
    changePct: point.changePct,
    volume: point.volume,
    createdAt: point.createdAt,
  };
}

function scopeViolation(): PlayerStockAssetDetailError {
  return new PlayerStockAssetDetailError(
    "player_stock_asset_detail_scope_violation",
    "Player stock asset detail could not be loaded.",
    500,
    false,
  );
}
