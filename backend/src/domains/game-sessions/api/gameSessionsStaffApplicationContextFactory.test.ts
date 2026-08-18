import {
  createGameSessionsStaffApplicationContext,
  type CreateGameSessionsStaffApplicationContextInput,
} from "./gameSessionsStaffApplicationContextFactory.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const REQUEST_ID = "00000000-0000-4000-8000-000000000301";

Deno.test("Game Sessions Staff context freezes truthful reviewed scope", () => {
  for (const assuranceLevel of ["aal1", "aal2", "unknown"] as const) {
    const context = createGameSessionsStaffApplicationContext(
      inputWith({ assuranceLevel }),
    );

    assertEquals(context, {
      gameSessionId: GAME_ID,
      actor: { kind: "staff", staffUserId: STAFF_ID },
      role: "game_admin",
      permissions: [],
      requestId: REQUEST_ID,
      assuranceLevel,
    });
    assert(Object.isFrozen(context), "context must be frozen");
    assert(Object.isFrozen(context.actor), "actor must be frozen");
    assert(Object.isFrozen(context.permissions), "permissions must be frozen");
  }
});

Deno.test("Game Sessions Staff context contains no transport, credential, or mutation identity", () => {
  const context = createGameSessionsStaffApplicationContext(inputWith());
  assertEquals(Object.keys(context).sort(), [
    "actor",
    "assuranceLevel",
    "gameSessionId",
    "permissions",
    "requestId",
    "role",
  ]);

  const serialized = JSON.stringify(context);
  for (
    const forbidden of [
      "authorization",
      "bearer",
      "email",
      "idempotency",
      "mfa_required",
      "permission_version",
      "security_version",
      "serviceClient",
      "supabase_auth_user_id",
    ]
  ) {
    assert(
      !serialized.includes(forbidden),
      `context leaked forbidden field ${forbidden}`,
    );
  }
});

Deno.test("Game Sessions Staff context fails closed on incomplete or unreviewed scope", () => {
  for (
    const candidate of [
      inputWith({ ownedGame: { id: " " } }),
      inputWith({ ownedGame: { id: 101 } }),
      inputWith({ staff: { id: "", role: "game_admin" } }),
      inputWith({ staff: { id: STAFF_ID, role: "security_operator" } }),
      inputWith({ requestId: "\t" }),
      inputWith({ assuranceLevel: "unreviewed" as "aal1" }),
    ]
  ) {
    assertThrows(() => createGameSessionsStaffApplicationContext(candidate));
  }
});

function inputWith(
  overrides: Partial<CreateGameSessionsStaffApplicationContextInput> = {},
): CreateGameSessionsStaffApplicationContextInput {
  return {
    ownedGame: { id: GAME_ID },
    staff: { id: STAFF_ID, role: "game_admin" },
    assuranceLevel: "aal2",
    requestId: REQUEST_ID,
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => void): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error("Expected function to throw.");
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
