import {
  handlePlayerStockAssetListRequest,
} from "./playerStockAssetListHttpHandler.ts";
import {
  readPlayerStockAssetRoutePath,
} from "./playerStockAssetListRoutePaths.ts";
import type {
  PlayerStockAssetDetailRepository,
  PlayerStockAssetDetailRepositoryResult,
} from "../contracts/playerStockAssetDetailContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000010";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000020";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const NOW = new Date("2026-07-18T06:00:00.000Z");

Deno.test("player stock asset detail derives authenticated scope and redacts UUIDs", async () => {
  const repository = new FakeDetailRepository(detailResult());
  const response = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets/AURA?historyLimit=2"),
    route("/players/me/stocks/assets/AURA"),
    dependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(
    response.headers.get("vary"),
    "authorization, x-player-session-token",
  );
  assertEquals(repository.inputs, [{
    gameId: GAME_ID,
    ticker: "AURA",
    historyLimit: 2,
  }]);
  assertEquals(body.asset.assetId, "AURA");
  assertEquals(body.history.map((point: any) => point.tickIndex), [41, 42]);
  assertEquals(body.historyLimit, 2);
  assertEquals(body.historyReturned, 2);
  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(GAME_ID), false);
  assertEquals(serialized.includes(PLAYER_UUID), false);
  assertEquals(serialized.includes(PLAYER_SESSION_ID), false);
  assertEquals(serialized.includes(ASSET_UUID), false);
});

Deno.test("player stock asset detail returns not found without leaking scope", async () => {
  const response = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets/MISS"),
    route("/players/me/stocks/assets/MISS"),
    dependencies(
      new FakeDetailRepository({ gameId: GAME_ID, asset: null, history: [] }),
    ),
  );

  await assertError(response, 404, "player_stock_asset_not_found");
  const text = await response.text().catch(() => "");
  assertEquals(text.includes(GAME_ID), false);
});

Deno.test("player stock asset detail rejects malformed paths and client game selection", async () => {
  const malformed = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets/not%2Fa%2Fticker"),
    route("/players/me/stocks/assets/not%2Fa%2Fticker"),
    dependencies(),
  );
  await assertError(
    malformed,
    400,
    "invalid_player_stock_asset_detail_request",
  );

  const gameSelected = await handlePlayerStockAssetListRequest(
    request(`/players/me/stocks/assets/AURA?gameSessionId=${GAME_ID}`),
    route("/players/me/stocks/assets/AURA"),
    dependencies(),
  );
  await assertError(
    gameSelected,
    400,
    "invalid_player_stock_asset_detail_request",
  );
});

Deno.test("player stock asset detail rejects missing sessions, runner secrets, and writes", async () => {
  const missing = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets/AURA", { playerToken: null }),
    route("/players/me/stocks/assets/AURA"),
    dependencies(),
  );
  await assertError(missing, 401, "missing_player_session");

  const secret = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets/AURA", { runnerSecret: "secret" }),
    route("/players/me/stocks/assets/AURA"),
    dependencies(),
  );
  await assertError(secret, 400, "stock_runner_secret_not_allowed");

  const post = await handlePlayerStockAssetListRequest(
    request("/players/me/stocks/assets/AURA", { method: "POST" }),
    route("/players/me/stocks/assets/AURA"),
    dependencies(),
  );
  await assertError(post, 405, "method_not_allowed");
});

class FakeDetailRepository implements PlayerStockAssetDetailRepository {
  readonly inputs: unknown[] = [];

  constructor(
    private readonly result: PlayerStockAssetDetailRepositoryResult = detailResult(),
  ) {}

  async readAsset(input: {
    readonly gameId: string;
    readonly ticker: string;
    readonly historyLimit: number;
  }): Promise<PlayerStockAssetDetailRepositoryResult> {
    this.inputs.push(input);
    return this.result;
  }
}

function dependencies(repository = new FakeDetailRepository()): any {
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
    createDetailRepository: () => repository,
    now: () => NOW,
  };
}

function request(
  path: string,
  options: {
    readonly method?: string;
    readonly playerToken?: string | null;
    readonly runnerSecret?: string;
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

function route(path: string): any {
  const value = readPlayerStockAssetRoutePath(path);
  if (!value) throw new Error(`Expected stock asset route for ${path}.`);
  return value;
}

function detailResult(): PlayerStockAssetDetailRepositoryResult {
  return {
    gameId: GAME_ID,
    asset: {
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
    },
    history: [
      {
        gameId: GAME_ID,
        internalAssetUuid: ASSET_UUID,
        ticker: "AURA",
        tickIndex: 42,
        price: 105,
        previousPrice: 104,
        changePct: 0.961538,
        volume: 1200,
        createdAt: "2026-07-18T05:42:00.000Z",
      },
      {
        gameId: GAME_ID,
        internalAssetUuid: ASSET_UUID,
        ticker: "AURA",
        tickIndex: 41,
        price: 104,
        previousPrice: 103,
        changePct: 0.970874,
        volume: 1100,
        createdAt: "2026-07-18T05:41:00.000Z",
      },
    ],
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
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
