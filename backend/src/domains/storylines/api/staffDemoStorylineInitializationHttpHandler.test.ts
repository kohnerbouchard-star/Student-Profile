import {
  readStaffDemoStorylineInitializeRoutePath,
  type StaffDemoStorylineInitializeRoute,
} from "./demoStorylineRoutePaths.ts";
import {
  handleStaffDemoStorylineInitializationRequest,
} from "./staffDemoStorylineInitializationHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_STAFF_ID = "00000000-0000-4000-8000-000000000202";

Deno.test("staff demo storyline route path parses initialize route", () => {
  assertEquals(
    readStaffDemoStorylineInitializeRoutePath(
      `/staff/game-sessions/${GAME_SESSION_ID}/storylines/demo/initialize`,
    ),
    { gameSessionId: GAME_SESSION_ID },
  );
  assertEquals(
    readStaffDemoStorylineInitializeRoutePath(
      `/staff/game-sessions/not-a-uuid/storylines/demo/initialize`,
    ),
    null,
  );
});

Deno.test("staff demo storyline initialization rejects invalid mode", async () => {
  const serviceClient = new FakeServiceClient();
  const response = await handleStaffDemoStorylineInitializationRequest(
    request({ mode: "overwrite" }),
    route(),
    dependencies({ serviceClient }),
  );

  await assertErrorResponse(
    response,
    400,
    "invalid_demo_storyline_initialization_request",
  );
  assertEquals(serviceClient.rpcCalls.length, 0);
});

Deno.test("staff demo storyline initialization requires staff auth", async () => {
  const serviceClient = new FakeServiceClient();
  const response = await handleStaffDemoStorylineInitializationRequest(
    request({ mode: "missing_only" }, {
      includeAuthorization: false,
      playerSessionToken: "player-token",
    }),
    route(),
    dependencies({ serviceClient, staffAuth: "missing" }),
  );

  await assertErrorResponse(response, 401, "missing_staff_auth_user");
  assertEquals(serviceClient.rpcCalls.length, 0);
});

Deno.test("staff demo storyline initialization rejects unauthorized game session", async () => {
  const response = await handleStaffDemoStorylineInitializationRequest(
    request({ mode: "missing_only" }),
    route(),
    dependencies({
      serviceClient: new FakeServiceClient({
        gameSessions: [{
          id: GAME_SESSION_ID,
          name: "Period 1",
          status: "active",
          owner_staff_user_id: OTHER_STAFF_ID,
        }],
      }),
    }),
  );

  await assertErrorResponse(response, 404, "game_session_not_found");
});

Deno.test("staff demo storyline initialization calls RPC with game and mode", async () => {
  const serviceClient = new FakeServiceClient();
  const response = await handleStaffDemoStorylineInitializationRequest(
    request({ mode: "reset_empty_only" }),
    route(),
    dependencies({ serviceClient }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    demoStoryline: {
      gameSessionId: GAME_SESSION_ID,
      storylineKey: "econovaria_demo_act_1",
      storylineEventsAvailable: 3,
      gameSessionStorylinesBefore: 0,
      gameSessionStorylinesInserted: 1,
      gameSessionStorylinesAfter: 1,
    },
  });
  assertEquals(serviceClient.rpcCalls, [{
    functionName: "initialize_demo_storyline_for_game",
    args: {
      p_game_session_id: GAME_SESSION_ID,
      p_mode: "reset_empty_only",
    },
  }]);
});

Deno.test("staff demo storyline initialization defaults mode to missing_only", async () => {
  const serviceClient = new FakeServiceClient();
  const response = await handleStaffDemoStorylineInitializationRequest(
    request(undefined),
    route(),
    dependencies({ serviceClient }),
  );

  assertEquals(response.status, 200);
  assertEquals(serviceClient.rpcCalls[0]?.args, {
    p_game_session_id: GAME_SESSION_ID,
    p_mode: "missing_only",
  });
});

Deno.test("staff demo storyline initialization handles RPC failure cleanly", async () => {
  const response = await handleStaffDemoStorylineInitializationRequest(
    request({ mode: "missing_only" }),
    route(),
    dependencies({
      serviceClient: new FakeServiceClient({
        rpcError: { message: "database unavailable" },
      }),
    }),
  );

  await assertErrorResponse(
    response,
    500,
    "demo_storyline_initialization_failed",
  );
});

Deno.test("staff demo storyline initialization maps reset-empty conflict", async () => {
  const response = await handleStaffDemoStorylineInitializationRequest(
    request({ mode: "reset_empty_only" }),
    route(),
    dependencies({
      serviceClient: new FakeServiceClient({
        rpcError: { message: "DEMO_STORYLINE_RESET_EMPTY_ONLY_CONFLICT" },
      }),
    }),
  );

  await assertErrorResponse(
    response,
    409,
    "demo_storyline_already_initialized",
  );
});

function dependencies(options: {
  readonly serviceClient?: FakeServiceClient;
  readonly staffAuth?: "ok" | "missing";
} = {}) {
  const serviceClient = options.serviceClient ?? new FakeServiceClient();

  return {
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    resolveStaffForRequest: () => {
      if (options.staffAuth === "missing") {
        return Promise.resolve({
          ok: false as const,
          status: 401,
          error: {
            code: "missing_staff_auth_user",
            message: "A verified Supabase Auth user is required.",
            retryable: false,
          },
        });
      }

      return Promise.resolve({
        ok: true as const,
        staff: {
          id: STAFF_ID,
          email: "teacher@example.test",
        },
        serviceClient: serviceClient as never,
      });
    },
  };
}

function request(
  body?: unknown,
  options: {
    readonly includeAuthorization?: boolean;
    readonly playerSessionToken?: string;
  } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  const includeAuthorization = options.includeAuthorization ?? true;

  if (includeAuthorization) {
    headers.set("authorization", "Bearer staff-token");
  }

  if (options.playerSessionToken) {
    headers.set("x-player-session-token", options.playerSessionToken);
  }

  return new Request(
    `https://example.test/staff/game-sessions/${GAME_SESSION_ID}/storylines/demo/initialize`,
    {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

function route(): StaffDemoStorylineInitializeRoute {
  return { gameSessionId: GAME_SESSION_ID };
}

class FakeServiceClient {
  readonly rpcCalls: {
    readonly functionName: string;
    readonly args: unknown;
  }[] = [];
  private readonly gameSessions: readonly Record<string, unknown>[];
  private readonly rpcRows: readonly Record<string, unknown>[];
  private readonly rpcError:
    | { readonly message: string; readonly code?: string }
    | null;

  constructor(options: {
    readonly gameSessions?: readonly Record<string, unknown>[];
    readonly rpcRows?: readonly Record<string, unknown>[];
    readonly rpcError?: { readonly message: string; readonly code?: string };
  } = {}) {
    this.gameSessions = options.gameSessions ?? [{
      id: GAME_SESSION_ID,
      name: "Period 1",
      status: "active",
      owner_staff_user_id: STAFF_ID,
    }];
    this.rpcRows = options.rpcRows ?? [{
      game_session_id: GAME_SESSION_ID,
      storyline_key: "econovaria_demo_act_1",
      storyline_events_available: 3,
      game_session_storylines_before: 0,
      game_session_storylines_inserted: 1,
      game_session_storylines_after: 1,
    }];
    this.rpcError = options.rpcError ?? null;
  }

  from(tableName: string): FakeGameSessionQuery {
    if (tableName !== "game_sessions") {
      throw new Error(`Unexpected table ${tableName}`);
    }

    return new FakeGameSessionQuery(this.gameSessions);
  }

  rpc(functionName: string, args: unknown) {
    this.rpcCalls.push({ functionName, args });

    if (this.rpcError) {
      return Promise.resolve({
        data: null,
        error: this.rpcError,
      });
    }

    return Promise.resolve({
      data: this.rpcRows,
      error: null,
    });
  }
}

class FakeGameSessionQuery {
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
  }[] = [];

  constructor(private readonly rows: readonly Record<string, unknown>[]) {}

  select(_columns: string): FakeGameSessionQuery {
    return this;
  }

  eq(column: string, value: unknown): FakeGameSessionQuery {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle(): Promise<{
    readonly data: Record<string, unknown> | null;
    readonly error: null;
  }> {
    return Promise.resolve({
      data: this.rows.find((row) =>
        this.filters.every((filter) =>
          row[filter.column] === filter.value
        )
      ) ?? null,
      error: null,
    });
  }
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
