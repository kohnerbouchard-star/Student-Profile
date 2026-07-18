import {
  type PlayerStockWatchlistListQuery,
  type PlayerStockWatchlistListResponseBody,
  type PlayerStockWatchlistMutationResponseBody,
  type PlayerStockWatchlistRepository,
  type PlayerStockWatchlistScope,
  PlayerStockWatchlistError,
  PlayerStockWatchlistPersistenceError,
} from "../contracts/playerStockWatchlistContracts.ts";
import { toPlayerStockAssetDto } from "./playerStockAssetDtoMapper.ts";

export class PlayerStockWatchlistService {
  constructor(private readonly repository: PlayerStockWatchlistRepository) {}

  async listWatchlist(
    scope: PlayerStockWatchlistScope,
    query: PlayerStockWatchlistListQuery,
  ): Promise<PlayerStockWatchlistListResponseBody> {
    try {
      const result = await this.repository.listWatchlist({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        limit: query.limit + 1,
        offset: query.offset,
      });

      if (
        result.gameId !== scope.gameId ||
        result.playerUuid !== scope.playerUuid ||
        result.entries.some((entry) =>
          entry.gameId !== scope.gameId ||
          entry.playerUuid !== scope.playerUuid
        ) ||
        result.assets.some((asset) => asset.gameId !== scope.gameId) ||
        result.latestTicks.some((tick) => tick.gameId !== scope.gameId)
      ) {
        throw scopeViolation();
      }

      const orderedEntries = [...result.entries].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        right.internalWatchlistUuid.localeCompare(left.internalWatchlistUuid)
      );
      const entryAssetIds = orderedEntries.map((entry) =>
        entry.internalAssetUuid
      );
      if (new Set(entryAssetIds).size !== entryAssetIds.length) {
        throw scopeViolation();
      }

      const hasMore = orderedEntries.length > query.limit;
      const pageEntries = orderedEntries.slice(0, query.limit);
      const assetsByUuid = new Map(
        result.assets.map((asset) => [asset.internalAssetUuid, asset] as const),
      );
      if (assetsByUuid.size !== result.assets.length) throw scopeViolation();

      const latestByAssetUuid = new Map<
        string,
        { tickIndex: number; volume: number }
      >();
      for (const tick of result.latestTicks) {
        const current = latestByAssetUuid.get(tick.internalAssetUuid);
        if (!current || tick.tickIndex > current.tickIndex) {
          latestByAssetUuid.set(tick.internalAssetUuid, {
            tickIndex: tick.tickIndex,
            volume: tick.volume,
          });
        }
      }

      const assets = pageEntries.flatMap((entry) => {
        const asset = assetsByUuid.get(entry.internalAssetUuid);
        if (!asset) return [];
        return [{
          ...toPlayerStockAssetDto(
            asset,
            latestByAssetUuid.get(asset.internalAssetUuid)?.volume ?? 0,
          ),
          isWatchlisted: true as const,
        }];
      });
      const publicIds = assets.map((asset) => asset.assetId);
      if (new Set(publicIds).size !== publicIds.length) throw scopeViolation();

      return {
        ok: true,
        generatedAt: scope.effectiveAt,
        availability: "available",
        tickIndex: result.latestTicks.reduce(
          (maximum, tick) => Math.max(maximum, tick.tickIndex),
          0,
        ),
        assets,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          returned: assets.length,
          hasMore,
          nextOffset: hasMore ? query.offset + query.limit : null,
        },
        emptyState: query.offset === 0 && assets.length === 0
          ? { reason: "stock_watchlist_empty" }
          : null,
      };
    } catch (error) {
      throw mapError(error);
    }
  }

  async setWatchlisted(
    scope: PlayerStockWatchlistScope,
    assetId: string,
    isWatchlisted: boolean,
  ): Promise<PlayerStockWatchlistMutationResponseBody> {
    try {
      const result = await this.repository.setWatchlisted({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        ticker: assetId,
        isWatchlisted,
      });

      if (
        result.gameId !== scope.gameId ||
        result.playerUuid !== scope.playerUuid ||
        result.ticker !== assetId ||
        result.isWatchlisted !== isWatchlisted
      ) {
        throw scopeViolation();
      }

      return {
        ok: true,
        generatedAt: scope.effectiveAt,
        assetId,
        isWatchlisted,
        changed: result.changed,
      };
    } catch (error) {
      throw mapError(error);
    }
  }
}

function mapError(error: unknown): unknown {
  if (error instanceof PlayerStockWatchlistError) return error;
  if (error instanceof PlayerStockWatchlistPersistenceError) {
    if (error.code === "player_stock_watchlist_asset_not_found") {
      return new PlayerStockWatchlistError(
        "player_stock_watchlist_asset_not_found",
        "Stock asset is not available in the authenticated game.",
        404,
        false,
      );
    }
    return new PlayerStockWatchlistError(
      "player_stock_watchlist_service_unavailable",
      "Player stock watchlist is temporarily unavailable.",
      503,
      true,
    );
  }
  return error;
}

function scopeViolation(): PlayerStockWatchlistError {
  return new PlayerStockWatchlistError(
    "player_stock_watchlist_scope_violation",
    "Player stock watchlist could not be loaded.",
    500,
    false,
  );
}
