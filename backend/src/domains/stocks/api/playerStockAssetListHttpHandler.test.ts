import {
  handlePlayerStockAssetListRequest,
} from "./playerStockAssetListHttpHandler.ts";
import type {
  PlayerStockAssetListRepository,
  PlayerStockAssetRecord,
} from "../contracts/playerStockAssetListContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000010";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000020";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const NOW = new Date("2026-07-18T05:00:00.000Z");

Deno.test("player stock asset list derives scope and returns browser-safe DTOs", async () => {
  const repository = new FakeRepository();
  const response = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets?limit=25&offset=5"),
    { kind: "assets" },
    dependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(
    response.headers.get("vary"),
    "authorization, x-player-session-token",
  );
  assertEquals(repository.inputs, [{ gameId: GAME_ID, limit: 26, offset: 5 }]);
  assertEquals(body.assets[0].assetId, "AURA");
  assertEquals(body.sectors, ["All", "AI_AEROSPACE"]);
  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(ASSET_UUID), false);
  assertEquals(serialized.includes(GAME_ID), false);
  assertEquals(serialized.includes(PLAYER_UUID), false);
  assertEquals(serialized.includes(PLAYER_SESSION_ID), false);
});

Deno.test("player stock asset list rejects missing sessions and client game selection", async () => {
  const missing = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets", { playerToken: null }),
    { kind: "assets" },
    dependencies(),
  );
  await assertError(missing, 401, "missing_player_session");

  const gameSelected = await handlePlayerStockAssetListRequest(
    request(`/players/me/stocks/assets?gameSessionId=${GAME_ID}`),
    { kind: "assets" },
    dependencies(),
  );
  await assertError(
    gameSelected,
    400,
    "invalid_player_stock_asset_list_request",
  );
});

Deno.test("player stock asset list rejects runner secrets, malformed routes, and writes", async () => {
  const secret = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets", { runnerSecret: "secret" }),
    { kind: "assets" },
    dependencies(),
  );
  await assertError(secret, 400, "stock_runner_secret_not_allowed");

  const malformed = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets/AURA"),
    { kind: "malformed" },
    dependencies(),
  );
  await assertError(
    malformed,
    400,
    "invalid_player_stock_asset_list_request",
  );

  const post = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets", { method: "POST" }),
    { kind: "assets" },
    dependencies(),
  );
  await assertError(post, 405, "method_not_allowed");
});

class FakeRepository implements PlayerStockAssetListRepository {
  readonly inputs: unknown[] = [];

  async listAssets(input: { gameId: string; limit: number; offset: number }) {
    this.inputs.push(input);
    return {
      gameId: GAME_ID,
      assets: [asset()],
      latestTicks: [{
        gameId: GAME_ID,
        internalAssetUuid: ASSET_UUID,
        tickIndex: 42,
        volume: 1000,
      }],
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
      gameSession: {
        id: GAME_ID,
        name: "Period 1",
        status: "active",
      },
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
  return new Request(`https://example.test${path}`, {
    method: options.method ?? "GET",
    headers,
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
  assertEquals(body.code, code);
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
