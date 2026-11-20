import {
  GameJoinCodeReadError,
  type GameJoinCodeReadRecord,
  type GameJoinCodeReadRepository,
  type GameJoinCodeReadScope,
  readGameJoinCode,
} from "./readGameJoinCode.ts";
import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000102";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_STAFF_ID = "00000000-0000-4000-8000-000000000202";
const UPDATED_AT = "2026-08-04T04:30:00.000Z";

Deno.test("join-code read returns only the owner-scoped public contract", async () => {
  const repository = new FakeRepository(record());
  const applicationContext = context();
  const result = await readGameJoinCode(
    scope({ applicationContext }),
    repository,
  );

  assertEquals(repository.inputs.length, 1);
  assertSame(repository.inputs[0]?.applicationContext, applicationContext);
  assertEquals(result, {
    gameSession: {
      id: GAME_ID,
      name: "Period 4 Economy",
      status: "active",
    },
    joinCode: {
      gameJoinCode: "ECO-ALPHA-042",
      status: "active",
      updatedAt: UPDATED_AT,
    },
  });
  const serialized = JSON.stringify(result);
  assertEquals(serialized.includes(STAFF_ID), false);
  assertEquals(serialized.includes("ownerStaffUserId"), false);
  assertEquals(serialized.includes(applicationContext.requestId), false);
});

Deno.test("join-code read hides games outside the authenticated owner scope", async () => {
  await assertReadError(
    new FakeRepository(null),
    "join_code_not_available",
    409,
  );

  for (
    const candidate of [
      record({ gameSessionId: OTHER_GAME_ID }),
      record({ ownerStaffUserId: OTHER_STAFF_ID }),
    ]
  ) {
    await assertReadError(
      new FakeRepository(candidate),
      "join_code_read_failed",
      500,
    );
  }
});

Deno.test("join-code read rejects a mismatched owned game before privileged I/O", async () => {
  const repository = new FakeRepository(record());

  await assertReadError(
    repository,
    "join_code_read_failed",
    500,
    false,
    scope({ applicationContext: context(OTHER_GAME_ID) }),
  );
  assertEquals(repository.inputs, []);
});

Deno.test("join-code read preserves the legacy-code availability contract", async () => {
  for (
    const candidate of [
      record({ gameJoinCode: null }),
      record({ joinCodeStatus: "pending" }),
      record({ joinCodeStatus: "revoked" }),
      record({ updatedAt: "" }),
      record({ updatedAt: null }),
    ]
  ) {
    await assertReadError(
      new FakeRepository(candidate),
      "join_code_not_available",
      409,
    );
  }
});

Deno.test("join-code persistence failures are sanitized and nonretryable", async () => {
  const repository = new FakeRepository(record());
  repository.error = new Error("database secret and schema details");

  await assertReadError(repository, "join_code_read_failed", 500, false);
});

class FakeRepository implements GameJoinCodeReadRepository {
  readonly inputs: GameJoinCodeReadScope[] = [];
  error: Error | null = null;

  constructor(private readonly value: GameJoinCodeReadRecord | null) {}

  readOwnedGameJoinCode(
    input: GameJoinCodeReadScope,
  ): Promise<GameJoinCodeReadRecord | null> {
    this.inputs.push(input);
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve(this.value);
  }
}

function scope(
  overrides: Partial<{
    applicationContext: GameSessionsStaffApplicationContext;
  }> = {},
) {
  return {
    applicationContext: context(),
    gameSession: {
      id: GAME_ID,
      name: "Period 4 Economy",
      status: "active",
    },
    ...overrides,
  };
}

function context(
  gameSessionId = GAME_ID,
  staffUserId = STAFF_ID,
): GameSessionsStaffApplicationContext {
  return Object.freeze({
    gameSessionId,
    actor: Object.freeze({ kind: "staff" as const, staffUserId }),
    role: "game_admin" as const,
    permissions: Object.freeze(["game.read"]),
    requestId: "server-request-game-session-001",
    assuranceLevel: "aal2" as const,
  });
}

function record(
  overrides: Partial<GameJoinCodeReadRecord> = {},
): GameJoinCodeReadRecord {
  return {
    gameSessionId: GAME_ID,
    ownerStaffUserId: STAFF_ID,
    gameJoinCode: "ECO-ALPHA-042",
    joinCodeStatus: "active",
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

async function assertReadError(
  repository: GameJoinCodeReadRepository,
  code: string,
  status: number,
  retryable = false,
  input = scope(),
): Promise<void> {
  try {
    await readGameJoinCode(input, repository);
  } catch (error) {
    if (error instanceof GameJoinCodeReadError) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      assertEquals(error.retryable, retryable);
      assertEquals(error.message.includes("secret"), false);
      return;
    }
    throw error;
  }
  throw new Error(`Expected GameJoinCodeReadError with code ${code}.`);
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
  if (actual !== expected) throw new Error("Expected identical references.");
}
