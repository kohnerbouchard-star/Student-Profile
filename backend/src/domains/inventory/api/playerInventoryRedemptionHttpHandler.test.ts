import {
  type PlayerInventoryRedemptionDto,
  PlayerInventoryRedemptionError,
  type PlayerInventoryRedemptionRepository,
} from "../contracts/playerInventoryRedemptionContracts.ts";
import { handlePlayerInventoryRedemptionRequest } from "./playerInventoryRedemptionHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const REQUEST_ID = `red_${"a".repeat(32)}`;
const NOW = new Date("2026-07-18T12:00:00.000Z");

Deno.test("Player redemption request derives scope and returns UUID-private creation evidence", async () => {
  const repository = new FakeRepository();
  const response = await handlePlayerInventoryRedemptionRequest(
    request(),
    { kind: "request", itemId: "meal-pass" },
    dependencies(repository),
  );
  const body = await response.json();
  assertEquals(response.status, 201);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(repository.requestInputs, [{
    gameId: GAME,
    playerUuid: PLAYER,
    itemId: "meal-pass",
    command: { quantity: 2, note: "Lunch", idempotencyKey: "redeem:001" },
  }]);
  assertEquals(body.outcome, "created");
  assertNoUuid(JSON.stringify(body));
});

Deno.test("Player redemption exact retry returns 200 replay without changing scope", async () => {
  const repository = new FakeRepository({ outcome: "replayed" });
  const response = await handlePlayerInventoryRedemptionRequest(request(), {
    kind: "request",
    itemId: "meal-pass",
  }, dependencies(repository));
  assertEquals(response.status, 200);
  assertEquals((await response.json()).outcome, "replayed");
});

Deno.test("Player redemption collection and status reads stay scoped and public", async () => {
  const repository = new FakeRepository();
  const collection = await handlePlayerInventoryRedemptionRequest(
    request({
      method: "GET",
      path: "/players/me/inventory/redemptions",
      query: "status=pending&limit=10&offset=5",
    }),
    { kind: "collection" },
    dependencies(repository),
  );
  assertEquals(collection.status, 200);
  assertEquals(repository.readInputs[0], {
    gameId: GAME,
    playerUuid: PLAYER,
    status: "pending",
    limit: 10,
    offset: 5,
    requestId: null,
  });
  assertNoUuid(JSON.stringify(await collection.json()));

  const item = await handlePlayerInventoryRedemptionRequest(
    request({
      method: "GET",
      path: `/players/me/inventory/redemptions/${REQUEST_ID}`,
    }),
    { kind: "item", requestId: REQUEST_ID },
    dependencies(repository),
  );
  assertEquals(item.status, 200);
  assertEquals(repository.readInputs[1]?.requestId, REQUEST_ID);
  assertNoUuid(JSON.stringify(await item.json()));
});

Deno.test("Player redemption rejects method, malformed route, browser scope, and identity before persistence", async () => {
  const repository = new FakeRepository();
  await assertError(
    await handlePlayerInventoryRedemptionRequest(
      request({ method: "GET" }),
      { kind: "request", itemId: "meal-pass" },
      dependencies(repository),
    ),
    405,
    "method_not_allowed",
  );
  await assertError(
    await handlePlayerInventoryRedemptionRequest(
      request(),
      { kind: "malformed" },
      dependencies(repository),
    ),
    400,
    "invalid_player_inventory_redemption_request",
  );
  for (
    const invalidRequest of [
      request({ query: "gameId=browser" }),
      request({ gameHeader: GAME }),
      request({ playerHeader: PLAYER }),
      request({ runnerSecret: "secret" }),
    ]
  ) {
    await assertError(
      await handlePlayerInventoryRedemptionRequest(
        invalidRequest,
        { kind: "request", itemId: "meal-pass" },
        dependencies(repository),
      ),
      400,
      "invalid_player_inventory_redemption_request",
      ["invalid_player_request"],
    );
  }
  assertEquals(repository.requestInputs.length, 0);
});

Deno.test("Player redemption rejects missing and inactive player sessions", async () => {
  const repository = new FakeRepository();
  await assertError(
    await handlePlayerInventoryRedemptionRequest(
      request({ token: null }),
      { kind: "request", itemId: "meal-pass" },
      dependencies(repository),
    ),
    401,
    "missing_player_session",
  );
  const response = await handlePlayerInventoryRedemptionRequest(
    request(),
    { kind: "request", itemId: "meal-pass" },
    dependencies(repository, activeResolution({ playerStatus: "archived" })),
  );
  assertEquals(response.status, 401);
  assertEquals(repository.requestInputs.length, 0);
});

Deno.test("Player redemption preserves reviewed domain error contracts and missing-item reads", async () => {
  for (
    const error of [
      new PlayerInventoryRedemptionError(
        "player_inventory_redemption_unavailable",
        "Unavailable.",
        404,
        false,
      ),
      new PlayerInventoryRedemptionError(
        "player_inventory_redemption_quantity_unavailable",
        "Unavailable.",
        409,
        false,
      ),
      new PlayerInventoryRedemptionError(
        "player_inventory_redemption_idempotency_conflict",
        "Conflict.",
        409,
        false,
      ),
      new PlayerInventoryRedemptionError(
        "player_inventory_redemption_schema_not_applied",
        "Unavailable.",
        503,
        true,
      ),
    ]
  ) {
    await assertError(
      await handlePlayerInventoryRedemptionRequest(
        request(),
        { kind: "request", itemId: "meal-pass" },
        dependencies(new FakeRepository({}, error)),
      ),
      error.status,
      error.code,
    );
  }
  await assertError(
    await handlePlayerInventoryRedemptionRequest(
      request({
        method: "GET",
        path: `/players/me/inventory/redemptions/${REQUEST_ID}`,
      }),
      { kind: "item", requestId: REQUEST_ID },
      dependencies(new FakeRepository({ reads: [] })),
    ),
    404,
    "player_inventory_redemption_not_found",
  );
});

class FakeRepository implements PlayerInventoryRedemptionRepository {
  readonly requestInputs: Parameters<
    PlayerInventoryRedemptionRepository["request"]
  >[0][] = [];
  readonly readInputs: Parameters<
    PlayerInventoryRedemptionRepository["read"]
  >[0][] = [];
  constructor(
    private readonly options: {
      readonly outcome?: "created" | "replayed";
      readonly reads?: readonly PlayerInventoryRedemptionDto[];
    } = {},
    private readonly error: PlayerInventoryRedemptionError | null = null,
  ) {}
  request(
    input: Parameters<PlayerInventoryRedemptionRepository["request"]>[0],
  ) {
    this.requestInputs.push(input);
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve({
      outcome: this.options.outcome ?? "created",
      redemption: dto(),
    });
  }
  read(input: Parameters<PlayerInventoryRedemptionRepository["read"]>[0]) {
    this.readInputs.push(input);
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve(this.options.reads ?? [dto()]);
  }
}

function dto(): PlayerInventoryRedemptionDto {
  return {
    id: REQUEST_ID,
    itemId: "meal-pass",
    quantity: 2,
    status: "pending",
    requestNote: "Lunch",
    resolutionNote: null,
    requestedAt: NOW.toISOString(),
    reviewedAt: null,
    fulfilledAt: null,
    updatedAt: NOW.toISOString(),
  };
}

function dependencies(
  repository: PlayerInventoryRedemptionRepository,
  resolution = activeResolution(),
) {
  return {
    createServiceClient: () => ({}) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(resolution),
    createRepository: () => repository,
    now: () => NOW,
  };
}

function activeResolution(overrides: { readonly playerStatus?: string } = {}) {
  return {
    ok: true as const,
    session: {
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: "2026-07-19T00:00:00.000Z",
      revoked_at: null,
    },
    gameSession: { id: GAME, name: "Game", status: "active" },
    player: {
      id: PLAYER,
      display_name: "Player",
      roster_label: null,
      status: overrides.playerStatus ?? "active",
    },
  };
}

function request(options: {
  readonly method?: string;
  readonly path?: string;
  readonly query?: string;
  readonly token?: string | null;
  readonly gameHeader?: string;
  readonly playerHeader?: string;
  readonly runnerSecret?: string;
} = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "token");
  }
  if (options.gameHeader) {
    headers.set("x-econovaria-game-id", options.gameHeader);
  }
  if (options.playerHeader) headers.set("x-player-uuid", options.playerHeader);
  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }
  const method = options.method ?? "POST";
  return new Request(
    `https://example.test${
      options.path ?? "/players/me/inventory/meal-pass/redemptions"
    }${options.query ? `?${options.query}` : ""}`,
    {
      method,
      headers,
      ...(method === "GET" ? {} : {
        body: JSON.stringify({
          quantity: 2,
          note: "Lunch",
          idempotencyKey: "redeem:001",
        }),
      }),
    },
  );
}

async function assertError(
  response: Response,
  status: number,
  code: string,
  alternatives: readonly string[] = [],
): Promise<void> {
  assertEquals(response.status, status);
  const actual = (await response.json()).error.code;
  if (actual !== code && !alternatives.includes(actual)) {
    throw new Error(`Actual ${actual}; expected ${code}`);
  }
}

function assertNoUuid(value: string): void {
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(value)
  ) throw new Error(`UUID leaked: ${value}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
