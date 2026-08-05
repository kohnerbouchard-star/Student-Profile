import {
  GameJoinCodeReadError,
} from "../../../src/domains/game-sessions/application/readGameJoinCode.ts";
import { handleGameJoinCodeReadOperation } from "./gameJoinCodeOperations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UNUSED_SERVICE = {
  from(): never {
    throw new Error("Injected read operation must not access Supabase.");
  },
};

Deno.test("Admin join-code read preserves the canonical response contract", async () => {
  const inputs: unknown[] = [];
  const result = await handleGameJoinCodeReadOperation(
    UNUSED_SERVICE,
    input(),
    {
      read: (scope) => {
        inputs.push(scope);
        return Promise.resolve({
          gameSession: {
            id: GAME_ID,
            name: "Period 4 Economy",
            status: "active",
          },
          joinCode: {
            gameJoinCode: "ECO-ALPHA-042",
            status: "active",
            updatedAt: "2026-08-04T04:30:00.000Z",
          },
        });
      },
    },
  );

  assertEquals(inputs, [{
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    gameSession: {
      id: GAME_ID,
      name: "Period 4 Economy",
      status: "active",
    },
  }]);
  assertEquals(result, {
    status: 200,
    body: {
      ok: true,
      gameSession: {
        id: GAME_ID,
        name: "Period 4 Economy",
        status: "active",
      },
      joinCode: {
        gameJoinCode: "ECO-ALPHA-042",
        status: "active",
        updatedAt: "2026-08-04T04:30:00.000Z",
      },
    },
  });
  assertEquals(JSON.stringify(result).includes(STAFF_ID), false);
});

Deno.test("Admin join-code read preserves safe canonical error envelopes", async () => {
  const cases = [
    new GameJoinCodeReadError(
      "game_session_not_found",
      "Game session was not found for this staff user.",
      404,
    ),
    new GameJoinCodeReadError(
      "join_code_not_available",
      "This legacy game does not have a persisted readable code yet. Rotate it once to create one.",
      409,
    ),
  ];

  for (const failure of cases) {
    const result = await handleGameJoinCodeReadOperation(
      UNUSED_SERVICE,
      input(),
      {
        read: () => Promise.reject(failure),
      },
    );
    assertEquals(result.status, failure.status);
    assertEquals(result.body, {
      ok: false,
      error: {
        code: failure.code,
        message: failure.message,
        retryable: false,
      },
    });
  }
});

Deno.test("Admin join-code read sanitizes unexpected failures", async () => {
  const result = await handleGameJoinCodeReadOperation(
    UNUSED_SERVICE,
    input(),
    {
      read: () => Promise.reject(new Error("database secret")),
    },
  );
  assertEquals(result, {
    status: 500,
    body: {
      ok: false,
      error: {
        code: "join_code_read_failed",
        message: "Game join code could not be loaded.",
        retryable: false,
      },
    },
  });
});

function input(
  overrides: Partial<{
    gameSessionId: string;
    staffUserId: string;
  }> = {},
) {
  return {
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    gameSession: {
      id: GAME_ID,
      name: "Period 4 Economy",
      status: "active",
    },
    ...overrides,
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
