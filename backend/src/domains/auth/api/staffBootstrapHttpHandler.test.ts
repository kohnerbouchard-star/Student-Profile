import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type {
  StaffGameSessionBootstrapRecord,
  StaffGameSessionBootstrapRepository,
} from "../application/staffGameSessionBootstrap.ts";
import {
  createStaffRequestApplicationContext,
  type CreateStaffRequestApplicationContextInput,
} from "../../../shared/staffRequestApplicationContextFactory.ts";
import { handleStaffBootstrapRequest } from "./staffBootstrapHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const STAFF_ID = "10000000-0000-4000-8000-000000000001";
const AUTH_ID = "20000000-0000-4000-8000-000000000002";
const GAME_ONE_ID = "30000000-0000-4000-8000-000000000003";
const GAME_TWO_ID = "40000000-0000-4000-8000-000000000004";
const REQUEST_ID = "50000000-0000-4000-8000-000000000005";

const SERVICE_CLIENT = {} as EdgeSupabaseClient;

Deno.test("Staff bootstrap creates one context per active game and preserves discovery order", async () => {
  const calls = {
    resolve: 0,
    requestIds: 0,
    contexts: [] as ReturnType<typeof createStaffRequestApplicationContext>[],
    resolverIp: "",
    repositoryClient: null as EdgeSupabaseClient | null,
  };
  const repository = repositoryWith({
    discoveredIds: [GAME_ONE_ID, GAME_TWO_ID],
    hydratedRows: [
      gameRow(GAME_TWO_ID, "Second", "ECO-TWO-GAME-002"),
      gameRow(GAME_ONE_ID, "First", null),
    ],
  });

  const response = await handleStaffBootstrapRequest(
    new Request("https://web-session.internal/staff/bootstrap", {
      headers: {
        authorization: "Bearer staff-token",
        "x-real-ip": "203.0.113.77",
      },
    }),
    {
      createAuthClient: () =>
        fail("auth client must be supplied by the resolver"),
      createServiceClient: () =>
        fail("service client must be supplied by the resolver"),
      resolveStaffSession: async (request) => {
        calls.resolve += 1;
        calls.resolverIp = request.headers.get("x-real-ip") ?? "";
        return resolvedStaff();
      },
      createBootstrapRepository: (client) => {
        calls.repositoryClient = client;
        return repository;
      },
      createApplicationContext: (
        input: CreateStaffRequestApplicationContextInput,
      ) => {
        const context = createStaffRequestApplicationContext(input);
        calls.contexts.push(context);
        return context;
      },
      createRequestId: () => {
        calls.requestIds += 1;
        return REQUEST_ID;
      },
    },
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(calls.resolve, 1);
  assertEquals(calls.requestIds, 1);
  assertEquals(calls.resolverIp, "192.0.2.1");
  assertSame(calls.repositoryClient, SERVICE_CLIENT);
  assertEquals(calls.contexts.length, 2);
  assert(
    calls.contexts[0] !== calls.contexts[1],
    "each game needs a distinct context",
  );
  for (const context of calls.contexts) {
    assert(Object.isFrozen(context), "context must be frozen");
    assertEquals(context.actor.staffUserId, STAFF_ID);
    assertEquals(context.requestId, REQUEST_ID);
  }
  assertEquals(calls.contexts.map((context) => context.gameSessionId), [
    GAME_ONE_ID,
    GAME_TWO_ID,
  ]);
  assertEquals(body, {
    ok: true,
    staff: {
      id: STAFF_ID,
      supabaseAuthUserId: AUTH_ID,
      email: "staff@example.test",
      displayName: "Staff Example",
      status: "active",
    },
    activeGameSessions: [
      {
        id: GAME_ONE_ID,
        name: "First",
        status: "active",
        joinCode: null,
        gameCode: null,
        joinCodeStatus: "active",
        createdAt: "2026-08-18T10:00:00.000Z",
        updatedAt: "2026-08-18T10:01:00.000Z",
      },
      {
        id: GAME_TWO_ID,
        name: "Second",
        status: "active",
        joinCode: "ECO-TWO-GAME-002",
        gameCode: "ECO-TWO-GAME-002",
        joinCodeStatus: "active",
        createdAt: "2026-08-18T10:00:00.000Z",
        updatedAt: "2026-08-18T10:01:00.000Z",
      },
    ],
  });
  const serialized = JSON.stringify(body);
  for (const hidden of [REQUEST_ID, "assuranceLevel", "permissions", "actor"]) {
    assert(!serialized.includes(hidden), `response leaked ${hidden}`);
  }
});

Deno.test("Staff bootstrap performs no detailed query or context creation for zero games", async () => {
  let requestIds = 0;
  let contextCalls = 0;
  let hydrationCalls = 0;
  const repository = repositoryWith({
    discoveredIds: [],
    onHydrate: () => hydrationCalls += 1,
  });

  const response = await handleStaffBootstrapRequest(
    authorizedRequest(),
    dependenciesFor(repository, {
      createApplicationContext: (
        input: CreateStaffRequestApplicationContextInput,
      ) => {
        contextCalls += 1;
        return createStaffRequestApplicationContext(input);
      },
      createRequestId: () => {
        requestIds += 1;
        return REQUEST_ID;
      },
    }),
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.activeGameSessions, []);
  assertEquals(requestIds, 1);
  assertEquals(contextCalls, 0);
  assertEquals(hydrationCalls, 0);
});

Deno.test("Staff bootstrap fails the whole response when detailed hydration is incomplete", async () => {
  const repository = repositoryWith({
    discoveredIds: [GAME_ONE_ID, GAME_TWO_ID],
    hydratedRows: [gameRow(GAME_ONE_ID, "First", null)],
  });

  const response = await handleStaffBootstrapRequest(
    authorizedRequest(),
    dependenciesFor(repository),
  );

  await assertError(
    response,
    500,
    "staff_bootstrap_failed",
    "Staff bootstrap failed.",
  );
});

Deno.test("Staff bootstrap creates no context when discovery fails", async () => {
  let requestIds = 0;
  let contextCalls = 0;
  const repository = repositoryWith({
    discoveryError: new Error("query failed"),
  });

  const response = await handleStaffBootstrapRequest(
    authorizedRequest(),
    dependenciesFor(repository, {
      createApplicationContext: (
        input: CreateStaffRequestApplicationContextInput,
      ) => {
        contextCalls += 1;
        return createStaffRequestApplicationContext(input);
      },
      createRequestId: () => {
        requestIds += 1;
        return REQUEST_ID;
      },
    }),
  );

  await assertError(
    response,
    500,
    "staff_bootstrap_failed",
    "Staff bootstrap failed.",
  );
  assertEquals(requestIds, 0);
  assertEquals(contextCalls, 0);
});

Deno.test("Staff bootstrap rejects unsupported methods before security resolution", async () => {
  let resolveCalls = 0;
  const repository = repositoryWith({ discoveredIds: [] });
  const dependencies = dependenciesFor(repository, {
    resolveStaffSession: async () => {
      resolveCalls += 1;
      return resolvedStaff();
    },
  });

  const response = await handleStaffBootstrapRequest(
    new Request("https://staff.example.test/staff/bootstrap", {
      method: "POST",
    }),
    dependencies,
  );

  await assertError(response, 405, "method_not_allowed");
  assertEquals(resolveCalls, 0);
});

function dependenciesFor(
  repository: StaffGameSessionBootstrapRepository,
  overrides: Record<string, unknown> = {},
) {
  return {
    createAuthClient: () =>
      fail("auth client must be supplied by the resolver"),
    createServiceClient: () =>
      fail("service client must be supplied by the resolver"),
    resolveStaffSession: async () => resolvedStaff(),
    createBootstrapRepository: () => repository,
    createRequestId: () => REQUEST_ID,
    ...overrides,
  };
}

function repositoryWith(options: {
  readonly discoveredIds?: readonly string[];
  readonly hydratedRows?: readonly StaffGameSessionBootstrapRecord[];
  readonly discoveryError?: Error;
  readonly onHydrate?: () => void;
}): StaffGameSessionBootstrapRepository {
  return {
    discoverOwnedGameSessionIds: async ({ visibility, staffUserId }) => {
      assertEquals(visibility, "active");
      assertEquals(staffUserId, STAFF_ID);
      if (options.discoveryError) throw options.discoveryError;
      return options.discoveredIds ?? [];
    },
    readStaffBootstrapProfile: () =>
      fail("Staff profile is already security-reviewed"),
    hydrateOwnedGameSessions: async ({ applicationContexts, visibility }) => {
      options.onHydrate?.();
      assertEquals(visibility, "active");
      for (const context of applicationContexts) {
        assertEquals(context.actor.staffUserId, STAFF_ID);
        assertEquals(context.requestId, REQUEST_ID);
      }
      return options.hydratedRows ?? [];
    },
  };
}

function resolvedStaff() {
  return {
    ok: true as const,
    authUser: { id: AUTH_ID, email: "staff@example.test" },
    staff: {
      id: STAFF_ID,
      supabase_auth_user_id: AUTH_ID,
      email: "staff@example.test",
      display_name: "Staff Example",
      status: "active" as const,
      role: "game_admin" as const,
      permission_version: 1,
      security_version: 1,
      mfa_required: true,
    },
    serviceClient: SERVICE_CLIENT,
    assuranceLevel: "aal2" as const,
  };
}

function gameRow(
  id: string,
  name: string,
  gameJoinCode: string | null,
): StaffGameSessionBootstrapRecord {
  return {
    id,
    ownerStaffUserId: STAFF_ID,
    name,
    status: "active",
    gameJoinCode,
    gameJoinCodeStatus: "active",
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:01:00.000Z",
  };
}

function authorizedRequest(): Request {
  return new Request("https://staff.example.test/staff/bootstrap", {
    headers: { authorization: "Bearer staff-token" },
  });
}

async function assertError(
  response: Response,
  status: number,
  code: string,
  message?: string,
): Promise<void> {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.error?.code, code);
  if (message !== undefined) assertEquals(body.error?.message, message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function assertSame(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error("Expected identical references.");
  }
}

function fail(message: string): never {
  throw new Error(message);
}
