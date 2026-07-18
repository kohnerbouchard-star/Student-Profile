import {
  type PlayerStockWatchlistRepository,
  PlayerStockWatchlistPersistenceError,
} from "../contracts/playerStockWatchlistContracts.ts";
import { PlayerStockWatchlistService } from "./playerStockWatchlistService.ts";
import type { PlayerStockAssetRecord } from "../contracts/playerStockAssetListContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000010";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const WATCHLIST_UUID = "00000000-0000-4000-8000-000000000201";
const EFFECTIVE_AT = "2026-07-18T06:30:00.000Z";

Deno.test("player stock watchlist service preserves entry order and hides UUIDs", async () => {
  const service = new PlayerStockWatchlistService(new FakeRepository());
  const body = await service.listWatchlist(scope(), { limit: 50, offset: 0 });

  assertEquals(body.assets[0].assetId, "AURA");
  assertEquals(body.assets[0].isWatchlisted, true);
  assertEquals(body.pagination, {
    limit: 50,
    offset: 0,
    returned: 1,
    hasMore: false,
    nextOffset: null,
  });
  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(GAME_ID), false);
  assertEquals(serialized.includes(PLAYER_UUID), false);
  assertEquals(serialized.includes(ASSET_UUID), false);
  assertEquals(serialized.includes(WATCHLIST_UUID), false);
});

Deno.test("player stock watchlist service returns idempotent mutation state", async () => {
  const repository = new FakeRepository();
  repository.changed = false;
  const service = new PlayerStockWatchlistService(repository);
  const body = await service.setWatchlisted(scope(), "AURA", true);
  assertEquals(body, {
    ok: true,
    generatedAt: EFFECTIVE_AT,
    assetId: "AURA",
    isWatchlisted: true,
    changed: false,
  });
});

Deno.test("player stock watchlist service maps missing assets and persistence outages", async () => {
  const missing = new FakeRepository();
  missing.error = new PlayerStockWatchlistPersistenceError(
    "player_stock_watchlist_asset_not_found",
    "missing",
  );
  await assertRejectsCode(
    () => new PlayerStockWatchlistService(missing).setWatchlisted(
      scope(),
      "AURA",
      true,
    ),
    "player_stock_watchlist_asset_not_found",
    404,
  );

  const unavailable = new FakeRepository();
  unavailable.error = new PlayerStockWatchlistPersistenceError(
    "player_stock_watchlist_schema_not_applied",
    "missing schema",
  );
  await assertRejectsCode(
    () => new PlayerStockWatchlistService(unavailable).listWatchlist(
      scope(),
      { limit: 50, offset: 0 },
    ),
    "player_stock_watchlist_service_unavailable",
    503,
  );
});

class FakeRepository implements PlayerStockWatchlistRepository {
  changed = true;
  error: Error | null = null;

  async listWatchlist() {
    if (this.error) throw this.error;
    return {
      gameId: GAME_ID,
      playerUuid: PLAYER_UUID,
      entries: [{
        internalWatchlistUuid: WATCHLIST_UUID,
        gameId: GAME_ID,
        playerUuid: PLAYER_UUID,
        internalAssetUuid: ASSET_UUID,
        createdAt: "2026-07-18T06:00:00.000Z",
      }],
      assets: [asset()],
      latestTicks: [{
        gameId: GAME_ID,
        internalAssetUuid: ASSET_UUID,
        tickIndex: 42,
        volume: 1000,
      }],
    };
  }

  async setWatchlisted(input: {
    gameId: string;
    playerUuid: string;
    ticker: string;
    isWatchlisted: boolean;
  }) {
    if (this.error) throw this.error;
    return {
      gameId: input.gameId,
      playerUuid: input.playerUuid,
      internalAssetUuid: ASSET_UUID,
      ticker: input.ticker,
      isWatchlisted: input.isWatchlisted,
      changed: this.changed,
    };
  }
}

function scope() {
  return { gameId: GAME_ID, playerUuid: PLAYER_UUID, effectiveAt: EFFECTIVE_AT };
}

function asset(): PlayerStockAssetRecord {
  return {
    internalAssetUuid: ASSET_UUID,
    gameId: GAME_ID,
    ticker: "AURA",
    companyName: "Aurora Aerospace Systems",
    sector: "AI_AEROSPACE",
    countryCode: "SOLVEND",
    description: "Public company description",
    currentPrice: 105,
    previousClose: 100,
    openPrice: 100,
    dayHigh: 106,
    dayLow: 99,
    marketCap: 105000000,
    currentVolatility: 0.05,
    longRunVolatility: 0.04,
  };
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && "status" in error) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      return;
    }
    throw error;
  }
  throw new Error(`Expected error ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
