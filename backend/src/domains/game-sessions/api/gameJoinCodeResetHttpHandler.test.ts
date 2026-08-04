import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { GameJoinCodeReadError } from "../application/readGameJoinCode.ts";
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

Deno.test("Classroom join-code GET preserves auth and ownership before the read", async () => {
  const calls: unknown[] = [];
  const response = await handleResetGameJoinCodeRequest(
    request("GET"),
    GAME_ID,
    dependencies(calls),
  );

  assertEquals(calls, [
    [
      "resolve-staff",
      "A verified Supabase Auth user is required to read a game join code.",
    ],
    ["read-owned-session", GAME_ID, STAFF_ID],
    ["read-join-code", GAME_ID, STAFF_ID],
  ]);
  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assertEquals(await response.json(), successBody());
});

Deno.test("Classroom join-code GET stops before privileged code reads for non-owners", async () => {
  let readCalled = false;
  const response = await handleResetGameJoinCodeRequest(
    request("GET"),
    GAME_ID,
    {
      ...dependencies([]),
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

Deno.test("Classroom join-code GET preserves legacy availability and sanitizes failures", async () => {
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
        ...dependencies([]),
        readJoinCode: () => Promise.reject(failure),
      },
    );
    const body = await response.json();

    assertEquals(response.status, expectedStatus);
    assertEquals(body.error.code, expectedCode);
    assertEquals(JSON.stringify(body).includes("database secret"), false);
  }
});

Deno.test("Classroom join-code POST keeps the existing rotation branch", async () => {
  const calls: unknown[] = [];
  const deps = dependencies(calls);
  const response = await handleResetGameJoinCodeRequest(
    request("POST"),
    GAME_ID,
    {
      ...deps,
      readJoinCode: () => {
        throw new Error("POST must not use the read operation");
      },
      issueJoinCode: (_client, gameSessionId, staffUserId) => {
        calls.push(["issue-join-code", gameSessionId, staffUserId]);
        return Promise.resolve({
          ok: true as const,
          gameJoinCode: "ECO-ROTATED-043",
          updatedAt: UPDATED_AT,
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
    ["issue-join-code", GAME_ID, STAFF_ID],
  ]);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), successBody("ECO-ROTATED-043"));
});

function dependencies(calls: unknown[]) {
  return {
    readEnvironment: () => ({ ok: true as const, value: ENV }),
    resolveStaffForRequest: (
      _request: Request,
      _env: SupabaseEnv,
      options: { readonly missingMessage: string },
    ) => {
      calls.push(["resolve-staff", options.missingMessage]);
      return Promise.resolve({
        ok: true as const,
        staff: { id: STAFF_ID, email: "teacher@example.com" },
        serviceClient: SERVICE_CLIENT,
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
    readJoinCode: (input: { gameSessionId: string; staffUserId: string }) => {
      calls.push(["read-join-code", input.gameSessionId, input.staffUserId]);
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
    { method, headers: { authorization: "Bearer test-token" } },
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

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
