import {
  handlePlayerStockMarketAssetRequest,
} from "./playerStockMarketAssetHttpHandler.ts";
import {
  type PlayerStockMarketAssetRoute,
  readPlayerStockMarketAssetRoutePath,
} from "./playerStockMarketAssetRoutePaths.ts";
import {
  StockMarketPlayerAssetReadError,
  type StockMarketPlayerAssetReadRepository,
} from "../contracts/stockMarketPlayerAssetReadContracts.ts";
import type {
  StockMarketWatchlistRepository,
} from "../contracts/stockMarketWatchlistContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const ASSET_ID = "00000000-0000-4000-8000-000000000101";

Deno.test("player market asset route parser accepts only list or UUID detail paths", () => {
  assertEquals(
    readPlayerStockMarketAssetRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/assets",
    ),
    { kind: "assets" },
  );
  assertEquals(
    readPlayerStockMarketAssetRoutePath(
      `/functions/v1/classroom-api/players/me/stocks/assets/${ASSET_ID}`,
    ),
    { kind: "asset", assetId: ASSET_ID },
  );
  assertEquals(
    readPlayerStockMarketAssetRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/assets/not-a-uuid",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockMarketAssetRoutePath(
      `/functions/v1/classroom-api/players/me/stocks/assets/${ASSET_ID}/extra`,
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockMarketAssetRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/orders",
    ),
    null,
  );
});

Deno.test("player market asset list derives game scope from the authenticated session", async () => {
  const repository = new FakeRepository();
  const watchlistRepository = new FakeWatchlistRepository([ASSET_ID]);
  const response = await handlePlayerStockMarketAssetRequest(
    request("/players/me/stocks/assets?limit=25&offset=10"),
    route("/players/me/stocks/assets"),
    dependencies({ repository, watchlistRepository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(
    response.headers.get("vary"),
    "authorization, x-player-session-token",
  );
  assertEquals(repository.listInputs, [{
    gameSessionId: GAME_SESSION_ID,
    limit: 25,
    offset: 10,
  }]);
  assertEquals(body, {
    ok: true,
    action: "read_assets",
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
  assertEquals(watchlistRepository.assetIdInputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    assetIds: [ASSET_ID],
  }]);
});

Deno.test("player market asset detail returns bounded chart history", async () => {
  const repository = new FakeRepository();
  const response = await handlePlayerStockMarketAssetRequest(
    request(`/players/me/stocks/assets/${ASSET_ID}?historyLimit=2`),
    route(`/players/me/stocks/assets/${ASSET_ID}`),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.detailInputs, [{
    gameSessionId: GAME_SESSION_ID,
    assetId: ASSET_ID,
    historyLimit: 2,
  }]);
  assertEquals(
    body.history.map((point: { readonly tickIndex: number }) =>
      point.tickIndex
    ),
    [
      41,
      42,
    ],
  );
  assertEquals(body.historyLimit, 2);
  assertEquals(body.historyReturned, 2);
  assertEquals(body.asset.isWatchlisted, false);
});

Deno.test("player market asset reads reject missing and invalid sessions", async () => {
  const repository = new FakeRepository();
  const missing = await handlePlayerStockMarketAssetRequest(
    request("/players/me/stocks/assets", { playerToken: null }),
    route("/players/me/stocks/assets"),
    dependencies({ repository }),
  );
  const invalid = await handlePlayerStockMarketAssetRequest(
    request("/players/me/stocks/assets"),
    route("/players/me/stocks/assets"),
    dependencies({
      repository,
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
  assertEquals(repository.listInputs, []);
});

Deno.test("player market asset reads reject all client-supplied identity scope", async () => {
  const requests = [
    request(`/players/me/stocks/assets?gameSessionId=${OTHER_GAME_SESSION_ID}`),
    request(`/players/me/stocks/assets?playerSessionId=${PLAYER_SESSION_ID}`),
    request(`/players/me/stocks/assets?playerId=${PLAYER_ID}`),
    request("/players/me/stocks/assets", {
      gameScopeHeader: OTHER_GAME_SESSION_ID,
    }),
    request("/players/me/stocks/assets", {
      gameSessionScopeHeader: OTHER_GAME_SESSION_ID,
    }),
    request("/players/me/stocks/assets", {
      playerIdHeader: PLAYER_ID,
    }),
    request("/players/me/stocks/assets", {
      playerSessionIdHeader: PLAYER_SESSION_ID,
    }),
  ];

  for (const value of requests) {
    const repository = new FakeRepository();
    const response = await handlePlayerStockMarketAssetRequest(
      value,
      route("/players/me/stocks/assets"),
      dependencies({ repository }),
    );

    await assertErrorResponse(
      response,
      400,
      "invalid_player_stock_asset_request",
    );
    assertEquals(repository.listInputs, []);
  }
});

Deno.test("player market asset list validates pagination strictly", async () => {
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
    const response = await handlePlayerStockMarketAssetRequest(
      request(`/players/me/stocks/assets?${query}`),
      route("/players/me/stocks/assets"),
      dependencies(),
    );

    await assertErrorResponse(
      response,
      400,
      "invalid_player_stock_asset_request",
    );
  }
});

Deno.test("player market asset detail validates its UUID path and history limit", async () => {
  const malformed = await handlePlayerStockMarketAssetRequest(
    request("/players/me/stocks/assets/not-a-uuid"),
    route("/players/me/stocks/assets/not-a-uuid"),
    dependencies(),
  );

  await assertErrorResponse(
    malformed,
    400,
    "invalid_player_stock_asset_request",
  );

  for (
    const query of [
      "historyLimit=0",
      "historyLimit=501",
      "historyLimit=2.5",
      "historyLimit=5&historyLimit=6",
      "limit=10",
    ]
  ) {
    const response = await handlePlayerStockMarketAssetRequest(
      request(`/players/me/stocks/assets/${ASSET_ID}?${query}`),
      route(`/players/me/stocks/assets/${ASSET_ID}`),
      dependencies(),
    );

    await assertErrorResponse(
      response,
      400,
      "invalid_player_stock_asset_request",
    );
  }
});

Deno.test("player market asset detail hides unavailable cross-game or inactive assets", async () => {
  const repository = new FakeRepository();
  repository.detailError = new StockMarketPlayerAssetReadError(
    "stock_asset_not_available",
    "Stock asset is not available in the authenticated game session.",
    404,
  );
  const response = await handlePlayerStockMarketAssetRequest(
    request(`/players/me/stocks/assets/${ASSET_ID}`),
    route(`/players/me/stocks/assets/${ASSET_ID}`),
    dependencies({ repository }),
  );

  await assertErrorResponse(response, 404, "stock_asset_not_available");
});

Deno.test("player market asset reads reject runner secrets and non-GET methods", async () => {
  const withSecret = await handlePlayerStockMarketAssetRequest(
    request("/players/me/stocks/assets", { runnerSecret: "do-not-expose" }),
    route("/players/me/stocks/assets"),
    dependencies(),
  );
  const post = await handlePlayerStockMarketAssetRequest(
    request("/players/me/stocks/assets", { method: "POST" }),
    route("/players/me/stocks/assets"),
    dependencies(),
  );

  await assertErrorResponse(withSecret, 400, "stock_runner_secret_not_allowed");
  await assertErrorResponse(post, 405, "method_not_allowed");
});

Deno.test("player market asset responses redact identity and runner-only fields", async () => {
  const secret = "runner-secret-must-not-leak";
  const response = await handlePlayerStockMarketAssetRequest(
    request(`/players/me/stocks/assets/${ASSET_ID}?historyLimit=2`),
    route(`/players/me/stocks/assets/${ASSET_ID}`),
    dependencies(),
  );
  const text = await response.text();

  assertEquals(response.status, 200);
  assertEquals(text.includes(PLAYER_ID), false);
  assertEquals(text.includes(PLAYER_SESSION_ID), false);
  assertEquals(text.includes(GAME_SESSION_ID), false);
  assertEquals(text.includes(secret), false);
  assertEquals(text.includes("fairValueAnchor"), false);
  assertEquals(text.includes("fundamentals"), false);
  assertEquals(text.includes("countryExposure"), false);
});

function dependencies(options: {
  readonly repository?: FakeRepository;
  readonly watchlistRepository?: FakeWatchlistRepository;
  readonly resolvePlayerSession?: () => Promise<any>;
} = {}): any {
  const repository = options.repository ?? new FakeRepository();
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
    createRepository: () => repository,
    createWatchlistRepository: () => watchlistRepository,
  };
}

function request(
  path: string,
  options: {
    readonly method?: string;
    readonly playerToken?: string | null;
    readonly runnerSecret?: string;
    readonly gameScopeHeader?: string;
    readonly gameSessionScopeHeader?: string;
    readonly playerIdHeader?: string;
    readonly playerSessionIdHeader?: string;
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

  if (options.playerIdHeader) {
    headers.set("x-player-id", options.playerIdHeader);
  }

  if (options.playerSessionIdHeader) {
    headers.set("x-player-session-id", options.playerSessionIdHeader);
  }

  return new Request(`https://example.test${path}`, {
    method: options.method ?? "GET",
    headers,
  });
}

function route(path: string): PlayerStockMarketAssetRoute {
  const route = readPlayerStockMarketAssetRoutePath(path.split("?")[0]);

  if (!route) {
    throw new Error(`Expected a player stock market asset route for ${path}.`);
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

function history() {
  return [
    {
      tickIndex: 41,
      price: 100,
      previousPrice: 99,
      changePct: 1.010101,
      volume: 900,
      createdAt: "2026-07-17T00:00:00.000Z",
    },
    {
      tickIndex: 42,
      price: 105,
      previousPrice: 100,
      changePct: 5,
      volume: 1000,
      createdAt: "2026-07-17T00:01:00.000Z",
    },
  ];
}

class FakeRepository implements StockMarketPlayerAssetReadRepository {
  readonly listInputs: unknown[] = [];
  readonly detailInputs: unknown[] = [];
  detailError: Error | null = null;

  async listPlayerAssets(input: any): Promise<any> {
    this.listInputs.push(input);

    return {
      tickIndex: 42,
      assets: [assetDto()],
      pagination: {
        limit: input.limit,
        offset: input.offset,
        returned: 1,
        hasMore: false,
        nextOffset: null,
      },
    };
  }

  async readPlayerAsset(input: any): Promise<any> {
    this.detailInputs.push(input);

    if (this.detailError) {
      throw this.detailError;
    }

    return {
      tickIndex: 42,
      asset: assetDto(),
      history: history().slice(-input.historyLimit),
    };
  }

  async readPlayerAssetsByIds(input: any): Promise<any> {
    return {
      tickIndex: 42,
      assets: input.assetIds.includes(ASSET_ID) ? [assetDto()] : [],
    };
  }
}

class FakeWatchlistRepository implements StockMarketWatchlistRepository {
  readonly assetIdInputs: unknown[] = [];
  private readonly watchlistedAssetIds: ReadonlySet<string>;

  constructor(assetIds: readonly string[] = []) {
    this.watchlistedAssetIds = new Set(assetIds);
  }

  async listWatchlist(): Promise<any> {
    return {
      assetIds: [...this.watchlistedAssetIds],
      pagination: {
        limit: 50,
        offset: 0,
        returned: this.watchlistedAssetIds.size,
        hasMore: false,
        nextOffset: null,
      },
    };
  }

  async listWatchlistedAssetIds(input: any): Promise<ReadonlySet<string>> {
    this.assetIdInputs.push(input);
    return new Set(
      input.assetIds.filter((assetId: string) =>
        this.watchlistedAssetIds.has(assetId)
      ),
    );
  }

  async setWatchlisted(): Promise<any> {
    return { changed: true };
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
