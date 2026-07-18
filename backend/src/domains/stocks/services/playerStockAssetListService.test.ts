import {
  type PlayerStockAssetListRepository,
  PlayerStockAssetListError,
  PlayerStockAssetListPersistenceError,
  type PlayerStockAssetRecord,
} from "../contracts/playerStockAssetListContracts.ts";
import { PlayerStockAssetListService } from "./playerStockAssetListService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000010";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const SECOND_ASSET_UUID = "00000000-0000-4000-8000-000000000102";
const THIRD_ASSET_UUID = "00000000-0000-4000-8000-000000000103";
const EFFECTIVE_AT = "2026-07-18T05:00:00.000Z";

Deno.test("player stock asset service returns deterministic public-safe pagination", async () => {
  const repository = new FakeRepository();
  repository.assets = [
    asset({ internalAssetUuid: SECOND_ASSET_UUID, ticker: "BETA", sector: "ENERGY" }),
    asset(),
    asset({ internalAssetUuid: THIRD_ASSET_UUID, ticker: "CETA", sector: "ENERGY" }),
  ];
  repository.latestTicks = [
    { gameId: GAME_ID, internalAssetUuid: ASSET_UUID, tickIndex: 4, volume: 1000 },
    { gameId: GAME_ID, internalAssetUuid: SECOND_ASSET_UUID, tickIndex: 5, volume: 2000 },
  ];
  const service = new PlayerStockAssetListService(repository);
  const result = await service.listAssets(scope(), { limit: 2, offset: 0 });

  assertEquals(repository.inputs, [{ gameId: GAME_ID, limit: 3, offset: 0 }]);
  assertEquals(result.assets.map((value) => value.assetId), ["AURA", "BETA"]);
  assertEquals(result.assets.map((value) => value.volume), [1000, 2000]);
  assertEquals(result.sectors, ["All", "AI_AEROSPACE", "ENERGY"]);
  assertEquals(result.tickIndex, 5);
  assertEquals(result.pagination, {
    limit: 2,
    offset: 0,
    returned: 2,
    hasMore: true,
    nextOffset: 2,
  });
  assertEquals(result.generatedAt, EFFECTIVE_AT);
  assertEquals(JSON.stringify(result).includes(ASSET_UUID), false);
  assertEquals(JSON.stringify(result).includes(GAME_ID), false);
  assertEquals(JSON.stringify(result).includes(PLAYER_UUID), false);
});

Deno.test("player stock asset service distinguishes a valid empty market", async () => {
  const service = new PlayerStockAssetListService(new FakeRepository());
  const result = await service.listAssets(scope(), { limit: 50, offset: 0 });

  assertEquals(result.availability, "available");
  assertEquals(result.assets, []);
  assertEquals(result.sectors, ["All"]);
  assertEquals(result.emptyState, { reason: "stock_market_not_initialized" });
});

Deno.test("player stock asset service rejects cross-game rows and public id collisions", async () => {
  const crossGame = new FakeRepository();
  crossGame.assets = [asset({ gameId: "00000000-0000-4000-8000-000000000002" })];
  await assertRejectsCode(
    () =>
      new PlayerStockAssetListService(crossGame).listAssets(scope(), {
        limit: 50,
        offset: 0,
      }),
    "player_stock_asset_scope_violation",
  );

  const collision = new FakeRepository();
  collision.assets = [
    asset(),
    asset({ internalAssetUuid: SECOND_ASSET_UUID, ticker: "AURA" }),
  ];
  await assertRejectsCode(
    () =>
      new PlayerStockAssetListService(collision).listAssets(scope(), {
        limit: 50,
        offset: 0,
      }),
    "player_stock_asset_scope_violation",
  );
});

Deno.test("player stock asset service maps persistence failures to retryable unavailability", async () => {
  const repository = new FakeRepository();
  repository.error = new PlayerStockAssetListPersistenceError(
    "player_stock_asset_read_failed",
    "read failed",
  );

  await assertRejectsCode(
    () =>
      new PlayerStockAssetListService(repository).listAssets(scope(), {
        limit: 50,
        offset: 0,
      }),
    "player_stock_asset_service_unavailable",
    true,
  );
});

class FakeRepository implements PlayerStockAssetListRepository {
  readonly inputs: unknown[] = [];
  assets: PlayerStockAssetRecord[] = [];
  latestTicks: {
    gameId: string;
    internalAssetUuid: string;
    tickIndex: number;
    volume: number;
  }[] = [];
  error: Error | null = null;

  async listAssets(input: { gameId: string; limit: number; offset: number }) {
    this.inputs.push(input);
    if (this.error) throw this.error;
    return {
      gameId: GAME_ID,
      assets: this.assets,
      latestTicks: this.latestTicks,
    };
  }
}

function scope() {
  return {
    gameId: GAME_ID,
    playerUuid: PLAYER_UUID,
    effectiveAt: EFFECTIVE_AT,
  };
}

function asset(overrides: Partial<PlayerStockAssetRecord> = {}): PlayerStockAssetRecord {
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
    ...overrides,
  };
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
  retryable?: boolean,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PlayerStockAssetListError) {
      assertEquals(error.code, code);
      if (retryable !== undefined) assertEquals(error.retryable, retryable);
      return;
    }
    throw error;
  }
  throw new Error(`Expected PlayerStockAssetListError with code ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
