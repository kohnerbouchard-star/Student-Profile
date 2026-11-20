import {
  createAdminRequestApplicationContext,
  type CreateAdminRequestApplicationContextInput,
} from "./adminRequestApplicationContext.ts";
import type { GameSessionsStaffApplicationContext } from "../../../src/domains/game-sessions/contracts/gameSessionsStaffApplicationContext.ts";

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const REQUEST_ID = "admin-request-application-context-001";

Deno.test("Admin application context freezes reviewed server-derived scope", () => {
  const permissions = ["game.read", "inventory.redeem"] as const;
  const input = inputWith({
    security: {
      ok: true,
      assuranceLevel: "aal2",
      permissions,
      requiredPermission: "inventory.redeem",
    },
  });

  const context = createAdminRequestApplicationContext(input);
  const gameSessionsContext: GameSessionsStaffApplicationContext = context;

  assertSame(gameSessionsContext, context);
  assertEquals(context.gameSessionId, GAME_ID);
  assertEquals(context.actor, { kind: "staff", staffUserId: STAFF_ID });
  assertEquals(context.role, "game_admin");
  assertEquals(context.permissions, permissions);
  assertEquals(context.requestId, REQUEST_ID);
  assertEquals(context.assuranceLevel, "aal2");
  assertEquals(context.requiredPermission, "inventory.redeem");
  assert(Object.isFrozen(context), "context must be frozen");
  assert(Object.isFrozen(context.actor), "actor must be frozen");
  assert(Object.isFrozen(context.permissions), "permissions must be frozen");

  (permissions as unknown as string[]).push("players.manage");
  assertEquals(context.permissions, ["game.read", "inventory.redeem"]);
});

Deno.test("Admin application context contains no transport or service state", () => {
  const context = createAdminRequestApplicationContext(inputWith());
  assertEquals(Object.keys(context).sort(), [
    "actor",
    "assuranceLevel",
    "gameSessionId",
    "permissions",
    "requestId",
    "requiredPermission",
    "role",
  ]);

  const serialized = JSON.stringify(context);
  for (
    const forbidden of [
      "authorization",
      "bearer",
      "email",
      "games",
      "service",
      "token",
      "user",
    ]
  ) {
    assert(
      !serialized.toLowerCase().includes(`\"${forbidden}\"`),
      `context must not carry ${forbidden}`,
    );
  }
});

Deno.test("Admin application context fails closed on incomplete reviewed scope", () => {
  for (
    const candidate of [
      inputWith({ ownedGame: { id: " " } }),
      inputWith({ staffUserId: "" }),
      inputWith({ requestId: "\t" }),
      inputWith({
        security: {
          ok: true,
          assuranceLevel: "aal2",
          permissions: ["game.read"],
          requiredPermission: "inventory.redeem",
        },
      }),
    ]
  ) {
    assertThrows(() => createAdminRequestApplicationContext(candidate));
  }
});

function inputWith(
  overrides: Partial<CreateAdminRequestApplicationContextInput> = {},
): CreateAdminRequestApplicationContextInput {
  return {
    ownedGame: { id: GAME_ID },
    staffUserId: STAFF_ID,
    requestId: REQUEST_ID,
    security: {
      ok: true,
      assuranceLevel: "aal2",
      permissions: ["inventory.redeem"],
      requiredPermission: "inventory.redeem",
    },
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
  throw new Error("Expected function to throw");
}

function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error("Expected the same object reference");
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}
