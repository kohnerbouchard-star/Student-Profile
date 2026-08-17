import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  GameJoinCodeReadError,
  type GameJoinCodeReadRepository,
  type ReadGameJoinCodeInput,
} from "../application/readGameJoinCode.ts";
import type { GameSessionMutationRepository } from "../contracts/gameSessionMutationRepository.ts";
import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import { createGameSessionsStaffApplicationContext } from "./gameSessionsStaffApplicationContextFactory.ts";
import { handleResetGameJoinCodeRequest } from "./gameJoinCodeResetHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UPDATED_AT = "2026-08-04T04:30:00.000Z";
const ENV: SupabaseEnv = {
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "test-anon-key",
  supabaseServiceRoleKey: "test-service-role-key",
};
const SERVICE_CLIENT = {} as EdgeSupabaseClient;

Deno.test("Staff/Classroom join-code GET preserves reviewed context identity after ownership", async () => {
  const calls: unknown[] = [];
  const contexts: GameSessionsStaffApplicationContext[] = [];
  const response = await handleResetGameJoinCodeRequest(
    request("GET"),
    GAME_ID,
    dependencies(calls, contexts),
  );

  assertEquals(calls, [
    [
      "resolve-staff",
      "A verified Supabase Auth user is required to read a game join code.",
    ],
    ["read-owned-session", GAME_ID, STAFF_ID],
    ["create-context", GAME_ID, STAFF_ID, "game_admin", "aal1"],
    ["create-join-code-read-repository"],
    ["read-join-code", GAME_ID, STAFF_ID],
  ]);
  assertEquals(contexts.length, 1);
  assertStaffContext(contexts[0], "aal1");
  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  const body = await response.json();
  assertEquals(body, successBody());
  assertPrivateBody(body, contexts[0]);
});

Deno.test("Staff/Classroom join-code GET stops before context or privileged reads for non-owners", async () => {
  const calls: unknown[] = [];
  const contexts: GameSessionsStaffApplicationContext[] = [];
  let readCalled = false;
  const response = await handleResetGameJoinCodeRequest(
    request("GET"),
    GAME_ID,
    {
      ...dependencies(calls, contexts),
      readOwnedSession: () =>
        Promise.resolve({
          ok: false as const,
          status: 404,
          error: {
            code: "game_session_not_found",
            message: "Game session was not found for this staff user.",
            retryable: false,
          },
        }),
      readJoinCode: () => {
        readCalled = true;
        throw new Error("must not run");
      },
    },
  );

  assertEquals(readCalled, false);
  assertEquals(contexts, []);
  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "game_session_not_found",
      message: "Game session was not found for this staff user.",
      retryable: false,
    },
  });
});

Deno.test("Staff/Classroom join-code GET preserves legacy availability and sanitizes failures", async () => {
  for (
    const [failure, expectedCode, expectedStatus] of [
      [
        new GameJoinCodeReadError(
          "join_code_not_available",
          "This legacy game does not have a persisted readable code yet. Rotate it once to create one.",
          409,
        ),
        "join_code_not_available",
        409,
      ],
      [new Error("database secret"), "join_code_read_failed", 500],
    ] as const
  ) {
    const response = await handleResetGameJoinCodeRequest(
      request("GET"),
      GAME_ID,
      {
        ...dependencies([], []),
        readJoinCode: () => Promise.reject(failure),
      },
    );
    const body = await response.json();

    assertEquals(response.status, expectedStatus);
    assertEquals(body.error.code, expectedCode);
    assertEquals(JSON.stringify(body).includes("database secret"), false);
  }
});

Deno.test("Staff/Classroom join-code POST keeps context separate from mutation identity", async () => {
  const calls: unknown[] = [];
  const contexts: GameSessionsStaffApplicationContext[] = [];
  const deps = dependencies(calls, contexts);
  const response = await handleResetGameJoinCodeRequest(
    request("POST"),
    GAME_ID,
    {
      ...deps,
      readJoinCode: () => {
        throw new Error("POST must not use the read operation");
      },
      rotateJoinCode: (repository, input) => {
        assertSame(repository, MUTATION_REPOSITORY);
        assertSame(input.applicationContext, contexts[0]);
        calls.push([
          "rotate-join-code",
          input.applicationContext.gameSessionId,
          input.applicationContext.actor.staffUserId,
          input.mutation.idempotencyKey,
          input.mutation.requestId,
        ]);
        return Promise.resolve({
          status: 200,
          replayed: false,
          joinCode: {
            gameJoinCode: "ECO-ROTATED-043",
            status: "active" as const,
            updatedAt: UPDATED_AT,
          },
        });
      },
    },
  );

  assertEquals(calls, [
    [
      "resolve-staff",
      "A verified Supabase Auth user is required to reset a game join code.",
    ],
    ["read-owned-session", GAME_ID, STAFF_ID],
    ["create-context", GAME_ID, STAFF_ID, "game_admin", "aal2"],
    ["create-mutation-repository"],
    [
      "rotate-join-code",
      GAME_ID,
      STAFF_ID,
      "join-code-rotation-001",
      "join-code-rotation-001",
    ],
  ]);
  assertEquals(contexts.length, 1);
  assertStaffContext(contexts[0], "aal2");
  assertEquals(contexts[0]?.requestId === "join-code-rotation-001", false);
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body, {
    ...successBody("ECO-ROTATED-043"),
    replayed: false,
  });
  assertPrivateBody(body, contexts[0]);
});

Deno.test("Staff/Classroom join-code unsupported and unauthenticated requests never construct context", async () => {
  let contextCalls = 0;
  const createApplicationContext = () => {
    contextCalls += 1;
    throw new Error("context must not be constructed");
  };

  const unsupported = await handleResetGameJoinCodeRequest(
    request("DELETE"),
    GAME_ID,
    {
      ...dependencies([], []),
      createApplicationContext,
      readEnvironment: () => {
        throw new Error("unsupported methods must stay scope-free");
      },
    },
  );
  assertEquals(unsupported.status, 405);

  const unauthenticated = await handleResetGameJoinCodeRequest(
    request("GET"),
    GAME_ID,
    {
      ...dependencies([], []),
      createApplicationContext,
      resolveStaffForRequest: () =>
        Promise.resolve({
          ok: false as const,
          status: 401,
          error: {
            code: "staff_auth_required",
            message: "Staff authentication is required.",
            retryable: false,
          },
        }),
    },
  );
  assertEquals(unauthenticated.status, 401);
  assertEquals(contextCalls, 0);
});

const READ_REPOSITORY: GameJoinCodeReadRepository = {
  readOwnedGameJoinCode: () => {
    throw new Error("injected use case owns repository invocation");
  },
};

const MUTATION_REPOSITORY: GameSessionMutationRepository = {
  rotateGameJoinCode: () => {
    throw new Error("injected use case owns repository invocation");
  },
  updateGameSettings: () => {
    throw new Error("unexpected settings mutation");
  },
};

function dependencies(
  calls: unknown[],
  contexts: GameSessionsStaffApplicationContext[],
) {
  return {
    readEnvironment: () => ({ ok: true as const, value: ENV }),
    resolveStaffForRequest: (
      request: Request,
      _env: SupabaseEnv,
      options: { readonly missingMessage: string },
    ) => {
      calls.push(["resolve-staff", options.missingMessage]);
      return Promise.resolve({
        ok: true as const,
        staff: { id: STAFF_ID, role: "game_admin" as const },
        serviceClient: SERVICE_CLIENT,
        assuranceLevel: request.method === "GET"
          ? "aal1" as const
          : "aal2" as const,
      });
    },
    readOwnedSession: (
      _client: EdgeSupabaseClient,
      gameSessionId: string,
      staffUserId: string,
    ) => {
      calls.push(["read-owned-session", gameSessionId, staffUserId]);
      return Promise.resolve({ ok: true as const, gameSession: gameSession() });
    },
    createApplicationContext: (
      input: Parameters<typeof createGameSessionsStaffApplicationContext>[0],
    ) => {
      calls.push([
        "create-context",
        input.ownedGame.id,
        input.staff.id,
        input.staff.role,
        input.assuranceLevel,
      ]);
      const context = createGameSessionsStaffApplicationContext(input);
      contexts.push(context);
      return context;
    },
    createJoinCodeReadRepository: () => {
      calls.push(["create-join-code-read-repository"]);
      return READ_REPOSITORY;
    },
    createMutationRepository: () => {
      calls.push(["create-mutation-repository"]);
      return MUTATION_REPOSITORY;
    },
    readJoinCode: (
      input: ReadGameJoinCodeInput,
      repository: GameJoinCodeReadRepository,
    ) => {
      assertSame(repository, READ_REPOSITORY);
      assertSame(input.applicationContext, contexts[0]);
      calls.push([
        "read-join-code",
        input.applicationContext.gameSessionId,
        input.applicationContext.actor.staffUserId,
      ]);
      return Promise.resolve({
        gameSession: gameSession(),
        joinCode: {
          gameJoinCode: "ECO-ALPHA-042",
          status: "active" as const,
          updatedAt: UPDATED_AT,
        },
      });
    },
  };
}

function request(method: string): Request {
  return new Request(
    `https://example.supabase.co/functions/v1/classroom-api/games/${GAME_ID}/join-code/reset`,
    {
      method,
      headers: {
        authorization: "Bearer test-token",
        ...(method === "POST"
          ? {
            "content-type": "application/json",
            "idempotency-key": "join-code-rotation-001",
          }
          : {}),
      },
      body: method === "POST"
        ? JSON.stringify({ source: "admin_share_panel" })
        : undefined,
    },
  );
}

function gameSession() {
  return { id: GAME_ID, name: "Period 4 Economy", status: "active" };
}

function successBody(gameJoinCode = "ECO-ALPHA-042") {
  return {
    ok: true,
    gameSession: gameSession(),
    joinCode: {
      gameJoinCode,
      status: "active",
      updatedAt: UPDATED_AT,
    },
  };
}

function assertStaffContext(
  context: GameSessionsStaffApplicationContext | undefined,
  assuranceLevel: "aal1" | "aal2",
): void {
  assertEquals(context?.gameSessionId, GAME_ID);
  assertEquals(context?.actor, { kind: "staff", staffUserId: STAFF_ID });
  assertEquals(context?.role, "game_admin");
  assertEquals(context?.permissions, []);
  assertEquals(context?.assuranceLevel, assuranceLevel);
  assertEquals(Object.isFrozen(context), true);
  assertEquals(Object.isFrozen(context?.actor), true);
  assertEquals(Object.isFrozen(context?.permissions), true);
  assertUuid(context?.requestId);
}

function assertPrivateBody(
  body: unknown,
  context: GameSessionsStaffApplicationContext | undefined,
): void {
  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(STAFF_ID), false);
  assertEquals(
    context ? serialized.includes(context.requestId) : true,
    false,
  );
  for (const forbidden of ["assuranceLevel", "permissions", "staffUserId"]) {
    assertEquals(serialized.includes(forbidden), false);
  }
}

function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error("Expected identical object reference.");
  }
}

function assertUuid(value: unknown): void {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(value)
  ) {
    throw new Error(`Expected UUID request ID, received ${String(value)}.`);
  }
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
