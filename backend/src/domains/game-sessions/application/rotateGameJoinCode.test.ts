import { AdminMutationError } from "../../../platform/supabase/adminMutation.ts";
import type {
  GameJoinCodeRotationCommand,
  GameSessionMutationRepository,
  GameSettingsMutationCommand,
} from "../contracts/gameSessionMutationRepository.ts";
import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import { rotateGameJoinCode } from "./rotateGameJoinCode.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UPDATED_AT = "2026-08-05T03:00:00.000Z";

Deno.test("join-code rotation preserves the exact context through the application seam", async () => {
  const repository = new FakeMutationRepository({
    status: 200,
    replayed: true,
    body: {
      joinCode: {
        game_join_code: "ECO-ROTATED-043",
        game_join_code_status: "active",
        updated_at: UPDATED_AT,
      },
    },
  });
  const applicationContext = context();
  const mutation = {
    idempotencyKey: "join-code-command-001",
    requestId: "mutation-request-join-code-001",
  };

  const result = await rotateGameJoinCode(repository, {
    applicationContext,
    requestBody: { source: "admin_share_panel" },
    mutation,
  });

  assertEquals(repository.rotationInputs.length, 1);
  assertSame(
    repository.rotationInputs[0]?.applicationContext,
    applicationContext,
  );
  assertSame(repository.rotationInputs[0]?.mutation, mutation);
  assertEquals(repository.rotationInputs[0]?.requestPayload, {
    source: "admin_share_panel",
  });
  assertEquals(result, {
    status: 200,
    replayed: true,
    joinCode: {
      gameJoinCode: "ECO-ROTATED-043",
      status: "active",
      updatedAt: UPDATED_AT,
    },
  });
  const serialized = JSON.stringify(result);
  assertEquals(serialized.includes(STAFF_ID), false);
  assertEquals(serialized.includes(applicationContext.requestId), false);
});

Deno.test("join-code rotation propagates persistence conflicts without rewriting them", async () => {
  const repository = new FakeMutationRepository(null);
  repository.error = new AdminMutationError(
    "idempotency_key_conflict",
    "That Idempotency-Key was already used for a different request.",
    409,
  );

  let failure: AdminMutationError | null = null;
  try {
    await rotateGameJoinCode(repository, input());
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.code, "idempotency_key_conflict");
  assertEquals(failure?.status, 409);
});

Deno.test("join-code rotation rejects browser-owned scope before the repository", async () => {
  for (
    const requestBody of [
      { staffUserId: "browser-chosen" },
      {
        meta: {
          idempotencyKey: "join-code-command-004",
          note: "different",
        },
      },
    ]
  ) {
    const repository = new FakeMutationRepository(null);
    let status = 0;
    try {
      await rotateGameJoinCode(repository, { ...input(), requestBody });
    } catch (error) {
      status = error instanceof AdminMutationError ? error.status : 0;
    }
    assertEquals(status, 400);
    assertEquals(repository.rotationInputs, []);
  }
});

Deno.test("join-code rotation rejects malformed persistence output", async () => {
  const repository = new FakeMutationRepository({
    status: 200,
    replayed: false,
    body: { joinCode: { game_join_code_status: "active" } },
  });
  let failure: AdminMutationError | null = null;
  try {
    await rotateGameJoinCode(repository, input());
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.code, "join_code_reset_failed");
  assertEquals(failure?.status, 500);
});

class FakeMutationRepository implements GameSessionMutationRepository {
  readonly rotationInputs: GameJoinCodeRotationCommand[] = [];
  error: Error | null = null;

  constructor(
    private readonly value: {
      readonly status: number;
      readonly body: Record<string, unknown>;
      readonly replayed: boolean;
    } | null,
  ) {}

  rotateGameJoinCode(command: GameJoinCodeRotationCommand) {
    this.rotationInputs.push(command);
    if (this.error) return Promise.reject(this.error);
    if (!this.value) return Promise.reject(new Error("missing fixture"));
    return Promise.resolve(this.value);
  }

  updateGameSettings(_command: GameSettingsMutationCommand): never {
    throw new Error("Unexpected settings mutation.");
  }
}

function input() {
  return {
    applicationContext: context(),
    requestBody: {},
    mutation: {
      idempotencyKey: "join-code-command-001",
      requestId: "mutation-request-join-code-001",
    },
  };
}

function context(): GameSessionsStaffApplicationContext {
  return Object.freeze({
    gameSessionId: GAME_ID,
    actor: Object.freeze({ kind: "staff" as const, staffUserId: STAFF_ID }),
    role: "game_admin" as const,
    permissions: Object.freeze(["game.update"]),
    requestId: "server-request-join-code-001",
    assuranceLevel: "aal2" as const,
  });
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
