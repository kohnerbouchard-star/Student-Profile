import { handlePlayerInventoryRequest } from "./playerInventoryHttpHandler.ts";
import type {
  PlayerInventoryReadInput,
  PlayerInventoryRecord,
} from "../contracts/playerInventoryContracts.ts";
import type { PlayerInventoryRepository } from "../infrastructure/playerInventoryRepository.ts";
import { PlayerInventoryPersistenceError } from "../infrastructure/supabasePlayerInventoryRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const INVENTORY_ID = "00000000-0000-4000-8000-000000000031";
const ITEM_ID = "00000000-0000-4000-8000-000000000041";
const NOW = "2026-07-17T08:00:00.000Z";

Deno.test("player inventory rejects unsupported methods and missing sessions", async () => {
  const wrongMethod = await handlePlayerInventoryRequest(
    request({ method: "POST" }),
    dependencies(),
  );
  const missingSession = await handlePlayerInventoryRequest(
    request({ authToken: null }),
    dependencies(),
  );

  await assertErrorResponse(wrongMethod, 405, "method_not_allowed");
  await assertErrorResponse(missingSession, 401, "invalid_player_session");
});

Deno.test("player inventory derives player and game scope from the session token", async () => {
  const repository = new MockInventoryRepository([
    inventoryRecord(),
    inventoryRecord({
      id: "00000000-0000-4000-8000-000000000032",
      storeItemId: "00000000-0000-4000-8000-000000000042",
      itemKey: "permit",
      name: "Field Permit",
      category: "Access",
      unitValue: 12.5,
      currencyCode: "SLV",
      quantityOwned: 3,
      quantityReserved: 1,
    }),
  ]);
  const response = await handlePlayerInventoryRequest(
    request({ gameSessionId: GAME_SESSION_ID }),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.inputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  }]);
  assertEquals(body.ok, true);
  assertEquals(body.gameSession.id, GAME_SESSION_ID);
  assertEquals(body.player.id, PLAYER_ID);
  assertEquals(body.generatedAt, NOW);
  assertEquals(body.capacity, null);
  assertEquals(body.categories, ["All", "Access", "Consumables"]);
  assertEquals(body.summary, {
    itemTypes: 2,
    quantityOwned: 5,
    quantityReserved: 1,
    quantityAvailable: 4,
    values: [
      { currencyCode: "ECO", totalOwnedValue: 19.98 },
      { currencyCode: "SLV", totalOwnedValue: 37.5 },
    ],
  });
  assertEquals(body.redemptionRequests, []);
  assertEquals(body.items[0], {
    id: INVENTORY_ID,
    storeItemId: ITEM_ID,
    itemKey: "repair-kit",
    name: "Repair Kit",
    description: "Single-use equipment protection.",
    category: "Consumables",
    quantityOwned: 2,
    quantityReserved: 0,
    quantityAvailable: 2,
    unitValue: 9.99,
    totalOwnedValue: 19.98,
    currencyCode: "ECO",
    itemStatus: "active",
    itemVisibility: "visible",
    availableActions: ["inventory.use"],
    createdAt: "2026-07-16T08:00:00.000Z",
    updatedAt: "2026-07-17T07:00:00.000Z",
  });
});

Deno.test("player inventory includes scoped redemption history", async () => {
  const response = await handlePlayerInventoryRequest(
    request(),
    dependencies({
      repository: new MockInventoryRepository([inventoryRecord()]),
      redemptionRequests: [{
        id: "00000000-0000-4000-8000-000000000051",
        inventoryHoldingId: INVENTORY_ID,
        storeItemId: ITEM_ID,
        quantity: 1,
        status: "pending",
        requestNote: "Use during workshop",
        resolutionNote: null,
        requestedAt: NOW,
        reviewedAt: null,
        fulfilledAt: null,
        updatedAt: NOW,
      }],
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.redemptionRequests.length, 1);
  assertEquals(body.redemptionRequests[0].status, "pending");
  assertEquals(body.redemptionRequests[0].inventoryHoldingId, INVENTORY_ID);
});

Deno.test("player inventory rejects mismatched scope and client-supplied player identity", async () => {
  const mismatchedGame = await handlePlayerInventoryRequest(
    request({ gameSessionId: OTHER_GAME_SESSION_ID }),
    dependencies(),
  );
  const suppliedPlayer = await handlePlayerInventoryRequest(
    request({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    dependencies(),
  );
  const suppliedSession = await handlePlayerInventoryRequest(
    request({ playerSessionIdHeader: PLAYER_SESSION_ID }),
    dependencies(),
  );
  const runnerSecret = await handlePlayerInventoryRequest(
    request({ runnerSecret: "runner-secret" }),
    dependencies(),
  );

  await assertErrorResponse(
    mismatchedGame,
    401,
    "invalid_player_session_scope",
  );
  await assertErrorResponse(suppliedPlayer, 400, "invalid_player_request");
  await assertErrorResponse(suppliedSession, 400, "invalid_player_request");
  await assertErrorResponse(
    runnerSecret,
    400,
    "stock_runner_secret_not_allowed",
  );
});

Deno.test("player inventory rejects inactive sessions and defensive repository scope leaks", async () => {
  const inactive = await handlePlayerInventoryRequest(
    request(),
    dependencies({ sessionMode: "invalid" }),
  );
  const leaked = await handlePlayerInventoryRequest(
    request(),
    dependencies({
      repository: new MockInventoryRepository([
        inventoryRecord({ playerId: OTHER_PLAYER_ID }),
      ]),
    }),
  );

  await assertErrorResponse(inactive, 401, "invalid_player_session");
  await assertErrorResponse(leaked, 500, "player_inventory_scope_violation");
});

Deno.test("player inventory maps persistence failures without leaking details", async () => {
  const response = await handlePlayerInventoryRequest(
    request(),
    dependencies({
      repository: new MockInventoryRepository([], true),
    }),
  );

  await assertErrorResponse(response, 500, "player_inventory_read_failed");
});

function dependencies(options: {
  readonly repository?: MockInventoryRepository;
  readonly sessionMode?: "ok" | "invalid";
  readonly redemptionRequests?: readonly Record<string, unknown>[];
} = {}) {
  const repository = options.repository ?? new MockInventoryRepository();

  return {
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    createServiceClient: () => ({} as never),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => {
      if (options.sessionMode === "invalid") {
        return Promise.resolve({
          ok: false as const,
          status: 401,
          error: {
            code: "invalid_player_session",
            message: "Player session is invalid or expired.",
            retryable: false,
          },
        });
      }

      return Promise.resolve({
        ok: true as const,
        session: {
          id: PLAYER_SESSION_ID,
          game_session_id: GAME_SESSION_ID,
          player_id: PLAYER_ID,
          status: "active",
          expires_at: "2099-07-17T08:00:00.000Z",
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
      });
    },
    createRepository: () => repository,
    readRedemptionRequests: () => Promise.resolve(
      (options.redemptionRequests ?? []) as never,
    ),
    now: () => NOW,
  };
}

function request(options: {
  readonly method?: string;
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly extraQuery?: string;
  readonly playerSessionIdHeader?: string;
  readonly runnerSecret?: string;
} = {}): Request {
  const headers = new Headers();

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.gameSessionId) {
    headers.set("x-econovaria-game-session-id", options.gameSessionId);
  }

  if (options.playerSessionIdHeader) {
    headers.set("x-player-session-id", options.playerSessionIdHeader);
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  const query = options.extraQuery ? `?${options.extraQuery}` : "";
  return new Request(
    `https://example.test/players/me/inventory${query}`,
    { method: options.method ?? "GET", headers },
  );
}

class MockInventoryRepository implements PlayerInventoryRepository {
  readonly inputs: PlayerInventoryReadInput[] = [];

  constructor(
    private readonly records: readonly PlayerInventoryRecord[] = [],
    private readonly shouldFail = false,
  ) {}

  readPlayerInventory(
    input: PlayerInventoryReadInput,
  ): Promise<readonly PlayerInventoryRecord[]> {
    this.inputs.push(input);

    if (this.shouldFail) {
      throw new PlayerInventoryPersistenceError(
        "player_inventory_read_failed",
        "Player inventory could not be loaded.",
      );
    }

    return Promise.resolve(this.records);
  }
}

function inventoryRecord(
  overrides: Partial<PlayerInventoryRecord> = {},
): PlayerInventoryRecord {
  return {
    id: INVENTORY_ID,
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    storeItemId: ITEM_ID,
    itemKey: "repair-kit",
    name: "Repair Kit",
    description: "Single-use equipment protection.",
    category: "Consumables",
    unitValue: 9.99,
    currencyCode: "ECO",
    itemStatus: "active",
    itemVisibility: "visible",
    quantityOwned: 2,
    quantityReserved: 0,
    createdAt: "2026-07-16T08:00:00.000Z",
    updatedAt: "2026-07-17T07:00:00.000Z",
    ...overrides,
  };
}

async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedCode: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, expectedStatus);
  assertEquals(body.ok, false);
  assertEquals(body.error.code, expectedCode);
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
