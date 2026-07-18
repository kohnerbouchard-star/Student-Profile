import {
  PlayerStockAssetDetailError,
  PlayerStockAssetDetailPersistenceError,
  type PlayerStockAssetDetailRepository,
  type PlayerStockAssetDetailRepositoryResult,
} from "../contracts/playerStockAssetDetailContracts.ts";
import { PlayerStockAssetDetailService } from "./playerStockAssetDetailService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000010";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const OTHER_ASSET_UUID = "00000000-0000-4000-8000-000000000102";
const EFFECTIVE_AT = "2026-07-18T06:00:00.000Z";

Deno.test("player stock asset detail maps deterministic ascending history", async () => {
  const repository = new FakeRepository({
    gameId: GAME_ID,
    asset: asset(),
    history: [history(42), history(40), history(41)],
  });
  const service = new PlayerStockAssetDetailService(repository);
  const result = await service.readAsset(scope(), {
    assetId: "AURA",
    historyLimit: 3,
  });

  assertEquals(repository.inputs, [{
    gameId: GAME_ID,
    ticker: "AURA",
    historyLimit: 3,
  }]);
  assertEquals(result.asset.assetId, "AURA");
  assertEquals(result.asset.volume, 1042);
  assertEquals(result.tickIndex, 42);
  assertEquals(result.history.map((point) => point.tickIndex), [40, 41, 42]);
  assertEquals(result.historyLimit, 3);
  assertEquals(result.historyReturned, 3);
  const serialized = JSON.stringify(result);
  assertEquals(serialized.includes(GAME_ID), false);
  assertEquals(serialized.includes(PLAYER_UUID), false);
  assertEquals(serialized.includes(ASSET_UUID), false);
});

Deno.test("player stock asset detail returns a safe not-found error", async () => {
  const service = new PlayerStockAssetDetailService(
    new FakeRepository({ gameId: GAME_ID, asset: null, history: [] }),
  );

  await assertRejectsCode(
    () => service.readAsset(scope(), { assetId: "MISS", historyLimit: 20 }),
    "player_stock_asset_not_found",
    404,
  );
});

Deno.test("player stock asset detail fails closed on cross-scope records", async () => {
  const cases: PlayerStockAssetDetailRepositoryResult[] = [
    { gameId: OTHER_GAME_ID, asset: asset(), history: [] },
    { gameId: GAME_ID, asset: asset({ gameId: OTHER_GAME_ID }), history: [] },
    { gameId: GAME_ID, asset: asset({ ticker: "BETA" }), history: [] },
    {
      gameId: GAME_ID,
      asset: asset(),
      history: [history(1, { gameId: OTHER_GAME_ID })],
    },
    {
      gameId: GAME_ID,
      asset: asset(),
      history: [history(1, { internalAssetUuid: OTHER_ASSET_UUID })],
    },
    {
      gameId: GAME_ID,
      asset: asset(),
      history: [history(1), history(1, { createdAt: "2026-07-18T05:01:00.000Z" })],
    },
  ];

  for (const result of cases) {
    const service = new PlayerStockAssetDetailService(new FakeRepository(result));
    await assertRejectsCode(
      () => service.readAsset(scope(), { assetId: "AURA", historyLimit: 20 }),
      "player_stock_asset_detail_scope_violation",
      500,
    );
  }
});

Deno.test("player stock asset detail maps persistence failures to retryable service errors", async () => {
  const repository = new FakeRepository({ gameId: GAME_ID, asset: null, history: [] });
  repository.error = new PlayerStockAssetDetailPersistenceError(
    "player_stock_asset_detail_read_failed",
    "failed",
  );
  const service = new PlayerStockAssetDetailService(repository);

  await assertRejectsCode(
    () => service.readAsset(scope(), { assetId: "AURA", historyLimit: 20 }),
    "player_stock_asset_detail_service_unavailable",
    503,
    true,
  );
});

class FakeRepository implements PlayerStockAssetDetailRepository {
  readonly inputs: unknown[] = [];
  error: Error | null = null;

  constructor(private readonly result: PlayerStockAssetDetailRepositoryResult) {}

  async readAsset(input: {
    readonly gameId: string;
    readonly ticker: string;
    readonly historyLimit: number;
  }): Promise<PlayerStockAssetDetailRepositoryResult> {
    this.inputs.push(input);
    if (this.error) throw this.error;
    return this.result;
  }
}

function scope() {
  return {
    gameId: GAME_ID,
    playerUuid: PLAYER_UUID,
    effectiveAt: EFFECTIVE_AT,
  };
}

function asset(overrides: Record<string, unknown> = {}) {
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
  } as any;
}

function history(tickIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    gameId: GAME_ID,
    internalAssetUuid: ASSET_UUID,
    ticker: "AURA",
    tickIndex,
    price: 100 + tickIndex,
    previousPrice: 99 + tickIndex,
    changePct: 1,
    volume: 1000 + tickIndex,
    createdAt: `2026-07-18T05:${String(tickIndex).padStart(2, "0")}:00.000Z`,
    ...overrides,
  } as any;
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
  status: number,
  retryable = false,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PlayerStockAssetDetailError) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      assertEquals(error.retryable, retryable);
      return;
    }
    throw error;
  }
  throw new Error(`Expected PlayerStockAssetDetailError with code ${code}.`);
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
