import {
  createStaffRequestApplicationContext,
  type CreateStaffRequestApplicationContextInput,
  StaffRequestApplicationContextValidationError,
  type StaffRequestApplicationContextValidationIssue,
} from "./staffRequestApplicationContextFactory.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const REQUEST_ID = "00000000-0000-4000-8000-000000000301";

Deno.test("neutral Staff context freezes reviewed scope and cloned permissions", () => {
  const permissions = ["game.read", "settings.manage"] as const;
  const context = createStaffRequestApplicationContext(
    inputWith({ permissions }),
  );

  assertEquals(context, {
    gameSessionId: GAME_ID,
    actor: { kind: "staff", staffUserId: STAFF_ID },
    role: "game_admin",
    permissions,
    requestId: REQUEST_ID,
    assuranceLevel: "aal2",
  });
  assert(Object.isFrozen(context), "context must be frozen");
  assert(Object.isFrozen(context.actor), "actor must be frozen");
  assert(Object.isFrozen(context.permissions), "permissions must be frozen");
  assert(context.permissions !== permissions, "permissions must be cloned");
});

Deno.test("neutral Staff context defaults to a frozen empty permission set", () => {
  for (const assuranceLevel of ["aal1", "aal2", "unknown"] as const) {
    const context = createStaffRequestApplicationContext(
      inputWith({ assuranceLevel }),
    );

    assertEquals(context.permissions, []);
    assertEquals(context.assuranceLevel, assuranceLevel);
    assert(Object.isFrozen(context.permissions), "permissions must be frozen");
  }
});

Deno.test("neutral Staff context reports precise validation issues", () => {
  const cases: readonly [
    CreateStaffRequestApplicationContextInput,
    StaffRequestApplicationContextValidationIssue,
  ][] = [
    [inputWith({ ownedGame: { id: " " } }), "owned_game_id"],
    [inputWith({ ownedGame: { id: 101 } }), "owned_game_id"],
    [inputWith({ staff: { id: "", role: "game_admin" } }), "staff_user_id"],
    [
      inputWith({ staff: { id: STAFF_ID, role: "security_operator" } }),
      "staff_role",
    ],
    [inputWith({ requestId: "\t" }), "request_id"],
    [
      inputWith({ assuranceLevel: "unreviewed" as "aal1" }),
      "assurance_level",
    ],
  ];

  for (const [candidate, issue] of cases) {
    assertValidationIssue(
      () => createStaffRequestApplicationContext(candidate),
      issue,
    );
  }
});

function inputWith(
  overrides: Partial<CreateStaffRequestApplicationContextInput> = {},
): CreateStaffRequestApplicationContextInput {
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

function assertValidationIssue(
  run: () => void,
  expected: StaffRequestApplicationContextValidationIssue,
): void {
  try {
    run();
  } catch (error) {
    assert(
      error instanceof StaffRequestApplicationContextValidationError,
      "expected a neutral Staff context validation error",
    );
    assertEquals(error.issue, expected);
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
