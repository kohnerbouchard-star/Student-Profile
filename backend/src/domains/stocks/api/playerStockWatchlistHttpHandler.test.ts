import {
  handlePlayerStockWatchlistRequest,
} from "./playerStockWatchlistHttpHandler.ts";
import type {
  PlayerStockWatchlistRepository,
} from "../contracts/playerStockWatchlistContracts.ts";
import type { PlayerStockAssetRecord } from "../contracts/playerStockAssetListContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000010";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000020";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const WATCHLIST_UUID = "00000000-0000-4000-8000-000000000201";
const NOW = new Date("2026-07-18T06:30:00.000Z");

Deno.test("player stock watchlist handler reads browser-safe assets", async () => {
  const response = await handlePlayerStockWatchlistRequest(
    request("/players/me/stocks/watchlist?limit=25&offset=0"),
    { kind: "watchlist" },
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(body.assets[0].assetId, "AURA");
  assertEquals(body.assets[0].isWatchlisted, true);
  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(GAME_ID), false);
  assertEquals(serialized.includes(PLAYER_UUID), false);
  assertEquals(serialized.includes(ASSET_UUID), false);
});

Deno.test("player stock watchlist handler provides idempotent PUT and DELETE responses", async () => {
  const repository = new FakeRepository();
  repository.changed = false;
  const put = await handlePlayerStockWatchlistRequest(
    request("/players/me/stocks/watchlist/AURA", { method: "PUT" }),
    { kind: "watchlist_asset", assetId: "AURA" },
    dependencies(repository),
  );
  assertEquals(await put.json(), {
    ok: true,
    generatedAt: NOW.toISOString(),
    assetId: "AURA",
    isWatchlisted: true,
    changed: false,
  });

  repository.changed = true;
  const remove = await handlePlayerStockWatchlistRequest(
    request("/players/me/stocks/watchlist/AURA", { method: "DELETE" }),
    { kind: "watchlist_asset", assetId: "AURA" },
    dependencies(repository),
  );
  assertEquals((await remove.json()).isWatchlisted, false);
});

Deno.test("player stock watchlist handler rejects missing sessions, bodies, secrets, and invalid methods", async () => {
  const missing = await handlePlayerStockWatchlistRequest(
    request("/players/me/stocks/watchlist", { playerToken: null }),
    { kind: "watchlist" },
    dependencies(),
  );
  await assertError(missing, 401, "missing_player_session");

  const body = await handlePlayerStockWatchlistRequest(
    request("/players/me/stocks/watchlist/AURA", {
      method: "PUT",
      body: "{}",
    }),
    { kind: "watchlist_asset", assetId: "AURA" },
    dependencies(),
  );
  await assertError(body, 400, "invalid_player_stock_watchlist_request");

  const secret = await handlePlayerStockWatchlistRequest(
    request("/players/me/stocks/watchlist", { runnerSecret: "secret" }),
    { kind: "watchlist" },
    dependencies(),
  );
  await assertError(secret, 400, "stock_runner_secret_not_allowed");

  const post = await handlePlayerStockWatchlistRequest(
    request("/players/me/stocks/watchlist", { method: "POST" }),
    { kind: "watchlist" },
    dependencies(),
  );
  await assertError(post, 405, "method_not_allowed");
});

class FakeRepository implements PlayerStockWatchlistRepository {
  changed = true;

  async listWatchlist() {
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

function dependencies(repository = new FakeRepository()): any {
  return {
    createServiceClient: () => ({}),
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    hashSessionToken: async () => "hashed-token",
    resolvePlayerSession: async () => ({
      ok: true as const,
      session: {
        id: PLAYER_SESSION_ID,
        game_session_id: GAME_ID,
        player_id: PLAYER_UUID,
        status: "active",
        expires_at: "2999-01-01T00:00:00.000Z",
        revoked_at: null,
      },
      gameSession: { id: GAME_ID, name: "Period 1", status: "active" },
      player: {
        id: PLAYER_UUID,
        display_name: "Avery",
        roster_label: "A-1",
        status: "active",
      },
    }),
    createRepository: () => repository,
    now: () => NOW,
  };
}

function request(
  path: string,
  options: {
    method?: string;
    playerToken?: string | null;
    runnerSecret?: string;
    body?: string;
  } = {},
): Request {
  const headers = new Headers();
  if (options.playerToken !== null) {
    headers.set(
      "x-player-session-token",
      options.playerToken ?? "raw-player-session-token",
    );
  }
  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }
  if (options.body) headers.set("content-type", "application/json");
  return new Request(`https://example.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
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

async function assertError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.error?.code, code);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
