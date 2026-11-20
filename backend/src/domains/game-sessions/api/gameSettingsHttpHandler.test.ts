import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { AdminMutationError } from "../../../platform/supabase/adminMutation.ts";
import type {
  GameSettingsReadRepository,
  ReadGameSettingsInput,
} from "../application/readGameSettings.ts";
import type { UpdateGameSettingsInput } from "../application/updateGameSettings.ts";
import type { GameSessionMutationRepository } from "../contracts/gameSessionMutationRepository.ts";
import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import { createGameSessionsStaffApplicationContext } from "./gameSessionsStaffApplicationContextFactory.ts";
import { handleGameSettingsRequest } from "./gameSettingsHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UPDATED_AT = "2026-08-05T03:15:00.000Z";
const ENV: SupabaseEnv = {
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "test-anon-key",
  supabaseServiceRoleKey: "test-service-role-key",
};

Deno.test("Staff/Classroom settings PATCH preserves reviewed context identity after ownership", async () => {
  const calls: unknown[] = [];
  const contexts: GameSessionsStaffApplicationContext[] = [];
  const serviceClient = ownedGameClient(calls, ownedGameRow());
  const response = await handleGameSettingsRequest(
    request("PATCH", { difficultyPreset: "hard" }),
    GAME_ID,
    dependencies(calls, contexts, serviceClient),
  );

  assertEquals(calls, [
    [
      "resolve-staff",
      "A verified Supabase Auth user is required to load game settings.",
    ],
    ["owned-game-query", GAME_ID, STAFF_ID],
    ["create-context", GAME_ID, STAFF_ID, "game_admin", "aal2"],
    ["create-mutation-repository"],
    [
      "update-settings",
      GAME_ID,
      STAFF_ID,
      "settings-command-001",
      "settings-command-001",
      { difficultyPreset: "hard" },
    ],
  ]);
  assertEquals(contexts.length, 1);
  assertStaffContext(contexts[0], "aal2");
  assertEquals(contexts[0]?.requestId === "settings-command-001", false);
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body, {
    ok: true,
    gameSession: gameSession(),
    settings: settings(),
    difficultyPolicy: null,
    replayed: false,
  });
  assertPrivateBody(body, contexts[0]);
});

Deno.test("Staff/Classroom settings GET forwards one context and strips the ownership row", async () => {
  const calls: unknown[] = [];
  const contexts: GameSessionsStaffApplicationContext[] = [];
  const serviceClient = ownedGameClient(calls, ownedGameRow());
  const response = await handleGameSettingsRequest(
    request("GET"),
    GAME_ID,
    dependencies(calls, contexts, serviceClient),
  );

  assertEquals(calls, [
    [
      "resolve-staff",
      "A verified Supabase Auth user is required to load game settings.",
    ],
    ["owned-game-query", GAME_ID, STAFF_ID],
    ["create-context", GAME_ID, STAFF_ID, "game_admin", "aal1"],
    ["create-settings-read-repository"],
    ["read-settings", GAME_ID, STAFF_ID],
  ]);
  assertEquals(contexts.length, 1);
  assertStaffContext(contexts[0], "aal1");
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body, {
    ok: true,
    gameSession: gameSession(),
    settings: settings(),
  });
  assertPrivateBody(body, contexts[0]);
});

Deno.test("Staff/Classroom settings PATCH stops before context or application for non-owners", async () => {
  const calls: unknown[] = [];
  const contexts: GameSessionsStaffApplicationContext[] = [];
  let updated = false;
  const serviceClient = ownedGameClient(calls, null);
  const response = await handleGameSettingsRequest(
    request("PATCH", { attendanceWindow: { timezone: "Asia/Seoul" } }),
    GAME_ID,
    {
      ...dependencies(calls, contexts, serviceClient),
      updateSettings: () => {
        updated = true;
        throw new Error("must not run");
      },
    },
  );

  assertEquals(updated, false);
  assertEquals(contexts, []);
  assertEquals(response.status, 404);
});

Deno.test("Staff/Classroom settings ownership lookup keeps its exact persistence error", async () => {
  const calls: unknown[] = [];
  const contexts: GameSessionsStaffApplicationContext[] = [];
  const serviceClient = ownedGameClient(calls, null, {
    message: "private database detail",
  });
  const response = await handleGameSettingsRequest(
    request("GET"),
    GAME_ID,
    dependencies(calls, contexts, serviceClient),
  );

  assertEquals(contexts, []);
  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "game_settings_failed",
      message: "Game settings request failed.",
      retryable: false,
    },
  });
});

Deno.test("Staff/Classroom settings PATCH never converts local persistence failure to 200", async () => {
  const calls: unknown[] = [];
  const contexts: GameSessionsStaffApplicationContext[] = [];
  const serviceClient = ownedGameClient(calls, ownedGameRow());
  const response = await handleGameSettingsRequest(
    request("PATCH", { difficultyPreset: "standard" }),
    GAME_ID,
    {
      ...dependencies(calls, contexts, serviceClient),
      updateSettings: () => {
        throw new AdminMutationError(
          "game_settings_failed",
          "Game settings request failed.",
          500,
        );
      },
    },
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "game_settings_failed",
      message: "Game settings request failed.",
      retryable: false,
    },
  });
});

Deno.test("Staff/Classroom settings unsupported and unauthenticated requests never construct context", async () => {
  let contextCalls = 0;
  const createApplicationContext = () => {
    contextCalls += 1;
    throw new Error("context must not be constructed");
  };

  const unsupported = await handleGameSettingsRequest(
    request("POST"),
    GAME_ID,
    {
      ...dependencies([], [], ownedGameClient([], ownedGameRow())),
      createApplicationContext,
      readEnvironment: () => {
        throw new Error("unsupported methods must stay scope-free");
      },
    },
  );
  assertEquals(unsupported.status, 405);

  const unauthenticated = await handleGameSettingsRequest(
    request("GET"),
    GAME_ID,
    {
      ...dependencies([], [], ownedGameClient([], ownedGameRow())),
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

const READ_REPOSITORY: GameSettingsReadRepository = {
  readGameSettings: () => {
    throw new Error("injected use case owns repository invocation");
  },
  readAdminGameSettingsView: () => {
    throw new Error("unexpected Admin settings read");
  },
};

const MUTATION_REPOSITORY: GameSessionMutationRepository = {
  rotateGameJoinCode: () => {
    throw new Error("unexpected join-code mutation");
  },
  updateGameSettings: () => {
    throw new Error("injected use case owns repository invocation");
  },
};

function dependencies(
  calls: unknown[],
  contexts: GameSessionsStaffApplicationContext[],
  serviceClient: EdgeSupabaseClient,
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
        serviceClient,
        assuranceLevel: request.method === "GET"
          ? "aal1" as const
          : "aal2" as const,
      });
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
    createSettingsReadRepository: () => {
      calls.push(["create-settings-read-repository"]);
      return READ_REPOSITORY;
    },
    createMutationRepository: () => {
      calls.push(["create-mutation-repository"]);
      return MUTATION_REPOSITORY;
    },
    readSettings: (
      input: ReadGameSettingsInput,
      repository: GameSettingsReadRepository,
    ) => {
      assertSame(repository, READ_REPOSITORY);
      assertSame(input.applicationContext, contexts[0]);
      calls.push([
        "read-settings",
        input.applicationContext.gameSessionId,
        input.applicationContext.actor.staffUserId,
      ]);
      const unsafePersistenceProjection = {
        ...input.gameSession,
        owner_staff_user_id: STAFF_ID,
      };
      return Promise.resolve({
        gameSession: unsafePersistenceProjection,
        settings: settings(),
      });
    },
    updateSettings: (
      repository: GameSessionMutationRepository,
      input: UpdateGameSettingsInput,
    ) => {
      assertSame(repository, MUTATION_REPOSITORY);
      assertSame(input.applicationContext, contexts[0]);
      calls.push([
        "update-settings",
        input.applicationContext.gameSessionId,
        input.applicationContext.actor.staffUserId,
        input.mutation.idempotencyKey,
        input.mutation.requestId,
        input.requestBody,
      ]);
      return Promise.resolve({
        status: 200,
        replayed: false,
        settings: settings(),
        difficultyPolicy: null,
      });
    },
  };
}

function ownedGameClient(
  calls: unknown[],
  row: ReturnType<typeof ownedGameRow> | null,
  error: { readonly message: string } | null = null,
): EdgeSupabaseClient {
  return {
    from(table: string) {
      if (table !== "game_sessions") {
        throw new Error(`Unexpected table ${table}`);
      }
      let gameId = "";
      let ownerId = "";
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          if (column === "id") gameId = String(value);
          if (column === "owner_staff_user_id") ownerId = String(value);
          return query;
        },
        maybeSingle() {
          calls.push(["owned-game-query", gameId, ownerId]);
          return Promise.resolve({ data: row, error });
        },
      };
      return query;
    },
  } as unknown as EdgeSupabaseClient;
}

function request(
  method: string,
  body: Record<string, unknown> = {},
): Request {
  return new Request(
    `https://example.supabase.co/functions/v1/classroom-api/games/${GAME_ID}/settings`,
    {
      method,
      headers: {
        authorization: "Bearer test-token",
        ...(method === "PATCH"
          ? {
            "content-type": "application/json",
            "idempotency-key": "settings-command-001",
          }
          : {}),
      },
      body: method === "PATCH" ? JSON.stringify(body) : undefined,
    },
  );
}

function gameSession() {
  return { id: GAME_ID, name: "Period 4 Economy", status: "active" };
}

function ownedGameRow() {
  return { ...gameSession(), owner_staff_user_id: STAFF_ID };
}

function settings() {
  return {
    difficultyPreset: "hard",
    attendanceWindow: {},
    businessMarketWindow: {},
    stockMarketWindow: { timezone: "Asia/Seoul" },
    newsSchedule: {},
    updatedAt: UPDATED_AT,
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
  assertEquals(serialized.includes("owner_staff_user_id"), false);
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
