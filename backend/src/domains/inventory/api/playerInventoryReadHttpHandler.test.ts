import {
  type PlayerInventoryReadRepository,
  PlayerInventoryReadPersistenceError,
} from "../contracts/playerInventoryReadContracts.ts";
import { handlePlayerInventoryReadRequest } from "./playerInventoryReadHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = new Date("2026-07-18T07:00:00.000Z");

Deno.test("inventory handler derives scope from the player session and returns UUID-private DTOs", async () => {
  let receivedApplicationContext: Parameters<
    PlayerInventoryReadRepository["readInventory"]
  >[0]["applicationContext"] | undefined;
  const baseRepository = repository();
  const response = await handlePlayerInventoryReadRequest(
    request("/players/me/inventory"),
    { kind: "inventory" },
    dependencies({
      readInventory: (input) => {
        receivedApplicationContext = input.applicationContext;
        return baseRepository.readInventory(input);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(
    response.headers.get("vary"),
    "authorization, x-player-session-token",
  );
  const body = await response.json();
  assertEquals(body.items[0].id, "data_chip");
  assertEquals(body.items[0].storeItemId, "data_chip");
  assertEquals(body.items[0].quantityAvailable, 2);
  assertEquals(receivedApplicationContext?.gameSessionId, GAME);
  assertEquals(receivedApplicationContext?.actor.playerUuid, PLAYER);
  assertEquals(receivedApplicationContext?.role, "player");
  assertEquals(receivedApplicationContext?.permissions, ["own_player"]);
  assertEquals(Object.isFrozen(receivedApplicationContext), true);
  assertEquals(Object.isFrozen(receivedApplicationContext?.actor), true);
  assertEquals(Object.isFrozen(receivedApplicationContext?.permissions), true);
  assertMatchesUuid(receivedApplicationContext?.requestId);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("inventory handler reuses the injected application context without resolving scope again", async () => {
  const readInputs: Parameters<
    PlayerInventoryReadRepository["readInventory"]
  >[0][] = [];
  let resolverCalls = 0;
  const baseRepository = repository();
  const injectedApplicationContext = applicationContext();
  const response = await handlePlayerInventoryReadRequest(
    request("/players/me/inventory"),
    { kind: "inventory" },
    {
      ...dependencies({
        readInventory: (input) => {
          readInputs.push(input);
          return baseRepository.readInventory(input);
        },
      }),
      hashSessionToken: () => {
        resolverCalls += 1;
        return Promise.reject(new Error("scope must already be resolved"));
      },
      resolvePlayerSession: () => {
        resolverCalls += 1;
        return Promise.reject(new Error("scope must already be resolved"));
      },
    },
    injectedApplicationContext,
  );

  assertEquals(response.status, 200);
  assertEquals(resolverCalls, 0);
  assertEquals(readInputs[0]?.limit, 200);
  assertSame(
    readInputs[0]?.applicationContext,
    injectedApplicationContext,
  );
  assertNoUuid(JSON.stringify(await response.json()));
});

Deno.test("inventory handler rejects missing, game-selected, injected, and unsupported requests", async () => {
  const missing = await handlePlayerInventoryReadRequest(
    request("/players/me/inventory", { token: null }),
    { kind: "inventory" },
    dependencies(repository()),
  );
  assertEquals(missing.status, 401);
  assertEquals((await missing.json()).error.code, "missing_player_session");

  const gameQuery = await handlePlayerInventoryReadRequest(
    request(`/players/me/inventory?gameSessionId=${OTHER_GAME}`),
    { kind: "inventory" },
    dependencies(repository()),
  );
  assertEquals(gameQuery.status, 400);
  assertEquals(
    (await gameQuery.json()).error.code,
    "invalid_player_inventory_request",
  );

  const gameHeader = await handlePlayerInventoryReadRequest(
    request("/players/me/inventory", {
      header: ["x-econovaria-game-session-id", OTHER_GAME],
    }),
    { kind: "inventory" },
    dependencies(repository()),
  );
  assertEquals(gameHeader.status, 400);
  assertEquals(
    (await gameHeader.json()).error.code,
    "invalid_player_inventory_request",
  );

  const injected = await handlePlayerInventoryReadRequest(
    request("/players/me/inventory", {
      header: ["x-player-uuid", PLAYER],
    }),
    { kind: "inventory" },
    dependencies(repository()),
  );
  assertEquals(injected.status, 400);
  assertEquals((await injected.json()).error.code, "invalid_player_request");

  const unsupportedQuery = await handlePlayerInventoryReadRequest(
    request("/players/me/inventory?limit=10"),
    { kind: "inventory" },
    dependencies(repository()),
  );
  assertEquals(unsupportedQuery.status, 400);
  assertEquals(
    (await unsupportedQuery.json()).error.code,
    "invalid_player_inventory_request",
  );

  const method = await handlePlayerInventoryReadRequest(
    request("/players/me/inventory", { method: "POST" }),
    { kind: "inventory" },
    dependencies(repository()),
  );
  assertEquals(method.status, 405);
});

Deno.test("inventory handler maps persistence failures to a retryable unavailable response", async () => {
  const response = await handlePlayerInventoryReadRequest(
    request("/players/me/inventory"),
    { kind: "inventory" },
    dependencies({
      readInventory: () => Promise.reject(
        new PlayerInventoryReadPersistenceError(
          "player_inventory_read_failed",
          "database unavailable",
        ),
      ),
    }),
  );

  assertEquals(response.status, 503);
  const body = await response.json();
  assertEquals(body.error.code, "player_inventory_service_unavailable");
  assertEquals(body.error.retryable, true);
});

function dependencies(repositoryValue: PlayerInventoryReadRepository) {
  return {
    createServiceClient: () => ({}) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost:54321",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(activeResolution()),
    createRepository: () => repositoryValue,
    now: () => NOW,
  };
}

function applicationContext() {
  const authorizationContext = Object.freeze({
    actorType: "player" as const,
    source: "player_session" as const,
    gameScope: "session" as const,
    resourceScope: "own_player" as const,
  });
  return Object.freeze({
    gameSessionId: GAME,
    actor: Object.freeze({
      kind: "player" as const,
      playerUuid: PLAYER,
      playerSessionId: SESSION,
    }),
    role: "player" as const,
    permissions: Object.freeze(["own_player"] as const),
    requestId: "request-player-inventory-001",
    playerUuid: PLAYER,
    gameId: GAME,
    activeSessionId: SESSION,
    sessionValid: true,
    sessionExpiresAt: "2026-07-19T00:00:00.000Z",
    authorizationContext,
  } as const);
}

function repository(): PlayerInventoryReadRepository {
  return {
    readInventory: (input) => Promise.resolve({
      gameId: input.applicationContext.gameSessionId,
      playerUuid: input.applicationContext.actor.playerUuid,
      records: [{
        internalHoldingUuid: "00000000-0000-4000-8000-000000000101",
        internalGameItemUuid: "00000000-0000-4000-8000-000000000151",
        internalStoreItemUuid: "00000000-0000-4000-8000-000000000201",
        gameId: input.applicationContext.gameSessionId,
        playerUuid: input.applicationContext.actor.playerUuid,
        itemKey: "data_chip",
        name: "Data Chip",
        description: "Inventory item",
        category: "material",
        unitValue: 4,
        currencyCode: "ECO",
        itemStatus: "active",
        itemVisibility: "visible",
        usable: false,
        quantityOwned: 3,
        quantityReserved: 1,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }],
    }),
  };
}

function activeResolution() {
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
    gameSession: {
      id: GAME,
      name: "Game",
      owner_staff_user_id: "00000000-0000-4000-8000-000000000031",
      status: "active",
    },
    player: {
      id: PLAYER,
      game_session_id: GAME,
      display_name: "Player",
      roster_label: null,
      player_identifier: "P-01",
      status: "active",
    },
  };
}

function request(path: string, options: {
  readonly token?: string | null;
  readonly method?: string;
  readonly header?: readonly [string, string];
} = {}): Request {
  const headers = new Headers();
  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }
  if (options.header) headers.set(options.header[0], options.header[1]);
  return new Request(`https://example.test${path}`, {
    method: options.method ?? "GET",
    headers,
  });
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked into browser response: ${value}`);
  }
}

function assertMatchesUuid(value: unknown): void {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) {
    throw new Error(`Expected server-generated request UUID, received ${value}`);
  }
}

function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error("Expected the same object reference.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
