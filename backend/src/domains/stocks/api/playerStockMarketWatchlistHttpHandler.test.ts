import {
  handlePlayerStockMarketWatchlistRequest,
} from "./playerStockMarketWatchlistHttpHandler.ts";
import {
  type PlayerStockMarketWatchlistRoute,
  readPlayerStockMarketWatchlistRoutePath,
} from "./playerStockMarketWatchlistRoutePaths.ts";
import type {
  StockMarketPlayerAssetReadRepository,
} from "../contracts/stockMarketPlayerAssetReadContracts.ts";
import {
  StockMarketWatchlistError,
  type StockMarketWatchlistRepository,
} from "../contracts/stockMarketWatchlistContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const ASSET_ID = "00000000-0000-4000-8000-000000000101";

Deno.test("player stock watchlist parser accepts collection and UUID item paths", () => {
  assertEquals(
    readPlayerStockMarketWatchlistRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/watchlist",
    ),
    { kind: "watchlist" },
  );
  assertEquals(
    readPlayerStockMarketWatchlistRoutePath(
      `/functions/v1/classroom-api/players/me/stocks/watchlist/${ASSET_ID}`,
    ),
    { kind: "watchlist_asset", assetId: ASSET_ID },
  );
  assertEquals(
    readPlayerStockMarketWatchlistRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/watchlist/not-a-uuid",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockMarketWatchlistRoutePath(
      `/functions/v1/classroom-api/players/me/stocks/watchlist/${ASSET_ID}/extra`,
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockMarketWatchlistRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/assets",
    ),
    null,
  );
});

Deno.test("player stock watchlist GET derives scope and returns batched active assets", async () => {
  const watchlistRepository = new FakeWatchlistRepository([ASSET_ID]);
  const assetRepository = new FakeAssetRepository();
  const response = await handlePlayerStockMarketWatchlistRequest(
    request("/players/me/stocks/watchlist?limit=25&offset=10"),
    route("/players/me/stocks/watchlist"),
    dependencies({ watchlistRepository, assetRepository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(
    response.headers.get("vary"),
    "authorization, x-player-session-token",
  );
  assertEquals(watchlistRepository.listInputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    limit: 25,
    offset: 10,
  }]);
  assertEquals(assetRepository.batchInputs, [{
    gameSessionId: GAME_SESSION_ID,
    assetIds: [ASSET_ID],
  }]);
  assertEquals(body, {
    ok: true,
    action: "read_watchlist",
    tickIndex: 42,
    assets: [{ ...assetDto(), isWatchlisted: true }],
    pagination: {
      limit: 25,
      offset: 10,
      returned: 1,
      hasMore: false,
      nextOffset: null,
    },
  });
});

Deno.test("player stock watchlist PUT is idempotent", async () => {
  const watchlistRepository = new FakeWatchlistRepository();
  const path = `/players/me/stocks/watchlist/${ASSET_ID}`;
  const first = await handlePlayerStockMarketWatchlistRequest(
    request(path, { method: "PUT" }),
    route(path),
    dependencies({ watchlistRepository }),
  );
  const replay = await handlePlayerStockMarketWatchlistRequest(
    request(path, { method: "PUT" }),
    route(path),
    dependencies({ watchlistRepository }),
  );

  assertEquals(await first.json(), {
    ok: true,
    action: "add_watchlist",
    assetId: ASSET_ID,
    isWatchlisted: true,
    changed: true,
  });
  assertEquals(await replay.json(), {
    ok: true,
    action: "add_watchlist",
    assetId: ASSET_ID,
    isWatchlisted: true,
    changed: false,
  });
  assertEquals(watchlistRepository.mutationInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    assetId: ASSET_ID,
    isWatchlisted: true,
  });
});

Deno.test("player stock watchlist DELETE is idempotent", async () => {
  const watchlistRepository = new FakeWatchlistRepository([ASSET_ID]);
  const path = `/players/me/stocks/watchlist/${ASSET_ID}`;
  const first = await handlePlayerStockMarketWatchlistRequest(
    request(path, { method: "DELETE" }),
    route(path),
    dependencies({ watchlistRepository }),
  );
  const replay = await handlePlayerStockMarketWatchlistRequest(
    request(path, { method: "DELETE" }),
    route(path),
    dependencies({ watchlistRepository }),
  );

  assertEquals(await first.json(), {
    ok: true,
    action: "remove_watchlist",
    assetId: ASSET_ID,
    isWatchlisted: false,
    changed: true,
  });
  assertEquals(await replay.json(), {
    ok: true,
    action: "remove_watchlist",
    assetId: ASSET_ID,
    isWatchlisted: false,
    changed: false,
  });
});

Deno.test("player stock watchlist rejects missing and invalid sessions", async () => {
  const watchlistRepository = new FakeWatchlistRepository();
  const missing = await handlePlayerStockMarketWatchlistRequest(
    request("/players/me/stocks/watchlist", { playerToken: null }),
    route("/players/me/stocks/watchlist"),
    dependencies({ watchlistRepository }),
  );
  const invalid = await handlePlayerStockMarketWatchlistRequest(
    request("/players/me/stocks/watchlist"),
    route("/players/me/stocks/watchlist"),
    dependencies({
      watchlistRepository,
      resolvePlayerSession: async () => ({
        ok: false as const,
        status: 401,
        error: {
          code: "invalid_player_session",
          message: "Player session is invalid or expired.",
          retryable: false,
        },
      }),
    }),
  );

  await assertErrorResponse(missing, 401, "invalid_player_session");
  await assertErrorResponse(invalid, 401, "invalid_player_session");
  assertEquals(watchlistRepository.listInputs, []);
  assertEquals(watchlistRepository.mutationInputs, []);
});

Deno.test("player stock watchlist rejects client-supplied scope", async () => {
  const requests = [
    request(
      `/players/me/stocks/watchlist?gameSessionId=${OTHER_GAME_SESSION_ID}`,
    ),
    request(
      `/players/me/stocks/watchlist?playerSessionId=${PLAYER_SESSION_ID}`,
    ),
    request(`/players/me/stocks/watchlist?playerId=${PLAYER_ID}`),
    request("/players/me/stocks/watchlist", {
      gameScopeHeader: OTHER_GAME_SESSION_ID,
    }),
    request("/players/me/stocks/watchlist", {
      gameSessionScopeHeader: OTHER_GAME_SESSION_ID,
    }),
  ];

  for (const value of requests) {
    const response = await handlePlayerStockMarketWatchlistRequest(
      value,
      route("/players/me/stocks/watchlist"),
      dependencies(),
    );

    await assertErrorResponse(
      response,
      400,
      "invalid_player_stock_watchlist_request",
    );
  }
});

Deno.test("player stock watchlist validates paths pagination queries and mutation bodies", async () => {
  const malformed = await handlePlayerStockMarketWatchlistRequest(
    request("/players/me/stocks/watchlist/not-a-uuid"),
    route("/players/me/stocks/watchlist/not-a-uuid"),
    dependencies(),
  );
  await assertErrorResponse(
    malformed,
    400,
    "invalid_player_stock_watchlist_request",
  );

  for (
    const query of [
      "limit=0",
      "limit=101",
      "limit=1.5",
      "limit=10&limit=20",
      "offset=-1",
      "offset=10001",
      "offset=1.5",
      "historyLimit=10",
    ]
  ) {
    const response = await handlePlayerStockMarketWatchlistRequest(
      request(`/players/me/stocks/watchlist?${query}`),
      route("/players/me/stocks/watchlist"),
      dependencies(),
    );

    await assertErrorResponse(
      response,
      400,
      "invalid_player_stock_watchlist_request",
    );
  }

  const mutationQuery = await handlePlayerStockMarketWatchlistRequest(
    request(`/players/me/stocks/watchlist/${ASSET_ID}?limit=1`, {
      method: "PUT",
    }),
    route(`/players/me/stocks/watchlist/${ASSET_ID}`),
    dependencies(),
  );
  const mutationBody = await handlePlayerStockMarketWatchlistRequest(
    request(`/players/me/stocks/watchlist/${ASSET_ID}`, {
      method: "PUT",
      body: JSON.stringify({ gameSessionId: OTHER_GAME_SESSION_ID }),
    }),
    route(`/players/me/stocks/watchlist/${ASSET_ID}`),
    dependencies(),
  );

  await assertErrorResponse(
    mutationQuery,
    400,
    "invalid_player_stock_watchlist_request",
  );
  await assertErrorResponse(
    mutationBody,
    400,
    "invalid_player_stock_watchlist_request",
  );
});

Deno.test("player stock watchlist rejects runner secrets and unsupported methods", async () => {
  const withSecret = await handlePlayerStockMarketWatchlistRequest(
    request("/players/me/stocks/watchlist", { runnerSecret: "do-not-expose" }),
    route("/players/me/stocks/watchlist"),
    dependencies(),
  );
  const collectionPut = await handlePlayerStockMarketWatchlistRequest(
    request("/players/me/stocks/watchlist", { method: "PUT" }),
    route("/players/me/stocks/watchlist"),
    dependencies(),
  );
  const itemPost = await handlePlayerStockMarketWatchlistRequest(
    request(`/players/me/stocks/watchlist/${ASSET_ID}`, { method: "POST" }),
    route(`/players/me/stocks/watchlist/${ASSET_ID}`),
    dependencies(),
  );

  await assertErrorResponse(withSecret, 400, "stock_runner_secret_not_allowed");
  await assertErrorResponse(collectionPut, 405, "method_not_allowed");
  await assertErrorResponse(itemPost, 405, "method_not_allowed");
});

Deno.test("player stock watchlist hides unavailable assets consistently", async () => {
  const watchlistRepository = new FakeWatchlistRepository();
  watchlistRepository.mutationError = new StockMarketWatchlistError(
    "stock_asset_not_available",
    "Stock asset is not available in the authenticated game session.",
    404,
  );
  const response = await handlePlayerStockMarketWatchlistRequest(
    request(`/players/me/stocks/watchlist/${ASSET_ID}`, { method: "PUT" }),
    route(`/players/me/stocks/watchlist/${ASSET_ID}`),
    dependencies({ watchlistRepository }),
  );

  await assertErrorResponse(response, 404, "stock_asset_not_available");
});

Deno.test("player stock watchlist responses redact identity and runner fields", async () => {
  const response = await handlePlayerStockMarketWatchlistRequest(
    request("/players/me/stocks/watchlist"),
    route("/players/me/stocks/watchlist"),
    dependencies({
      watchlistRepository: new FakeWatchlistRepository([ASSET_ID]),
    }),
  );
  const text = await response.text();

  assertEquals(response.status, 200);
  assertEquals(text.includes(PLAYER_ID), false);
  assertEquals(text.includes(PLAYER_SESSION_ID), false);
  assertEquals(text.includes(GAME_SESSION_ID), false);
  assertEquals(text.includes("runner-secret"), false);
  assertEquals(text.includes("fundamentals"), false);
});

function dependencies(options: {
  readonly assetRepository?: FakeAssetRepository;
  readonly watchlistRepository?: FakeWatchlistRepository;
  readonly resolvePlayerSession?: () => Promise<any>;
} = {}): any {
  const assetRepository = options.assetRepository ?? new FakeAssetRepository();
  const watchlistRepository = options.watchlistRepository ??
    new FakeWatchlistRepository();

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
    hashSessionToken: async () => "hashed-player-token",
    resolvePlayerSession: options.resolvePlayerSession ?? (async () => ({
      ok: true as const,
      session: {
        id: PLAYER_SESSION_ID,
        game_session_id: GAME_SESSION_ID,
        player_id: PLAYER_ID,
        status: "active",
        expires_at: "2999-01-01T00:00:00.000Z",
        revoked_at: null,
      },
      gameSession: {
        id: GAME_SESSION_ID,
        name: "Period 1",
        status: "active",
      },
      player: {
        id: PLAYER_ID,
        display_name: "Avery",
        roster_label: "A-1",
        status: "active",
      },
    })),
    createAssetRepository: () => assetRepository,
    createWatchlistRepository: () => watchlistRepository,
  };
}

function request(
  path: string,
  options: {
    readonly method?: string;
    readonly body?: string;
    readonly playerToken?: string | null;
    readonly runnerSecret?: string;
    readonly gameScopeHeader?: string;
    readonly gameSessionScopeHeader?: string;
  } = {},
): Request {
  const headers = new Headers({
    authorization: "Bearer supabase-jwt-for-gateway",
  });

  if (options.playerToken !== null) {
    headers.set(
      "x-player-session-token",
      options.playerToken ?? "raw-player-session-token",
    );
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  if (options.gameScopeHeader) {
    headers.set("x-econovaria-game-id", options.gameScopeHeader);
  }

  if (options.gameSessionScopeHeader) {
    headers.set(
      "x-econovaria-game-session-id",
      options.gameSessionScopeHeader,
    );
  }

  return new Request(`https://example.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
}

function route(path: string): PlayerStockMarketWatchlistRoute {
  const route = readPlayerStockMarketWatchlistRoutePath(path.split("?")[0]);

  if (!route) {
    throw new Error(`Expected a player stock watchlist route for ${path}.`);
  }

  return route;
}

function assetDto() {
  return {
    assetId: ASSET_ID,
    ticker: "AURA",
    companyName: "Aurora Aerospace Systems",
    sector: "AI_AEROSPACE",
    countryCode: "SOLVEND",
    currentPrice: 105,
    previousClose: 100,
    changePct: 5,
    openPrice: 100,
    dayHigh: 106,
    dayLow: 99,
    volume: 1000,
    marketCap: 105000000,
    currentVolatility: 0.05,
    longRunVolatility: 0.04,
    description: "Public company description",
  };
}

class FakeAssetRepository implements StockMarketPlayerAssetReadRepository {
  readonly batchInputs: unknown[] = [];

  async listPlayerAssets(): Promise<any> {
    throw new Error("Unexpected asset list read.");
  }

  async readPlayerAsset(): Promise<any> {
    throw new Error("Unexpected asset detail read.");
  }

  async readPlayerAssetsByIds(input: any): Promise<any> {
    this.batchInputs.push(input);
    return {
      tickIndex: 42,
      assets: input.assetIds.includes(ASSET_ID) ? [assetDto()] : [],
    };
  }
}

class FakeWatchlistRepository implements StockMarketWatchlistRepository {
  readonly listInputs: unknown[] = [];
  readonly membershipInputs: unknown[] = [];
  readonly mutationInputs: unknown[] = [];
  mutationError: Error | null = null;
  private readonly assetIds: Set<string>;

  constructor(assetIds: readonly string[] = []) {
    this.assetIds = new Set(assetIds);
  }

  async listWatchlist(input: any): Promise<any> {
    this.listInputs.push(input);
    return {
      assetIds: [...this.assetIds],
      pagination: {
        limit: input.limit,
        offset: input.offset,
        returned: this.assetIds.size,
        hasMore: false,
        nextOffset: null,
      },
    };
  }

  async listWatchlistedAssetIds(input: any): Promise<ReadonlySet<string>> {
    this.membershipInputs.push(input);
    return new Set(
      input.assetIds.filter((assetId: string) => this.assetIds.has(assetId)),
    );
  }

  async setWatchlisted(input: any): Promise<any> {
    this.mutationInputs.push(input);

    if (this.mutationError) {
      throw this.mutationError;
    }

    const wasWatchlisted = this.assetIds.has(input.assetId);

    if (input.isWatchlisted) {
      this.assetIds.add(input.assetId);
    } else {
      this.assetIds.delete(input.assetId);
    }

    return {
      changed: wasWatchlisted !== input.isWatchlisted,
    };
  }
}

async function assertErrorResponse(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
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
