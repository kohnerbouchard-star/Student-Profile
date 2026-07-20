import { handleAccountOperation } from "./accountOperations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000911";
const STAFF_ID = "00000000-0000-4000-8000-000000000912";
const GAME = { id: GAME_ID, name: "Lifecycle Audit Game", status: "archived" };

Deno.test("legacy Admin archive route uses canonical lifecycle RPC", async () => {
  const service = fixtureService([{
    transition_outcome: "applied",
    operational_status: "archived",
    lifecycle_state: "archived",
    lifecycle_version: 7,
  }]);
  const result = await handleAccountOperation(service, {
    path: `/games/${GAME_ID}/archive`,
    method: "POST",
    staff: { id: STAFF_ID },
    games: [GAME],
    body: {
      confirmation: "ARCHIVE",
      idempotencyKey: "legacy.archive.1",
      expectedVersion: 6,
    },
  });
  assertEquals(result.status, 200);
  assertEquals(service.calls, [{
    name: "transition_game_lifecycle_atomic_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_action: "archive",
      p_idempotency_key: "legacy.archive.1",
      p_expected_version: 6,
    },
  }]);
  assertEquals(result.body.data.game.lifecycleState, "archived");
});

Deno.test("legacy Admin archive route still requires explicit confirmation", async () => {
  const service = fixtureService([]);
  const result = await handleAccountOperation(service, {
    path: `/games/${GAME_ID}/archive`,
    method: "POST",
    staff: { id: STAFF_ID },
    games: [GAME],
    body: {},
  });
  assertEquals(result.status, 409);
  assertEquals(result.body.code, "game_archive_confirmation_required");
  assertEquals(service.calls, []);
});

Deno.test("legacy Admin archive route requires end before archive", async () => {
  const service = fixtureService([], {
    code: "P0001",
    message: "GAME_LIFECYCLE_TRANSITION_INVALID",
  });
  const result = await handleAccountOperation(service, {
    path: `/games/${GAME_ID}/archive`,
    method: "POST",
    staff: { id: STAFF_ID },
    games: [GAME],
    body: { confirmArchive: true },
  });
  assertEquals(result.status, 409);
  assertEquals(result.body.code, "game_must_be_ended_before_archive");
});

function fixtureService(
  data: readonly Record<string, unknown>[],
  error: { code?: string; message: string } | null = null,
) {
  const calls: Array<{ name: string; args: unknown }> = [];
  return {
    calls,
    rpc<T>(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve({ data: data as unknown as T, error });
    },
    from() {
      throw new Error("Legacy archive must not directly mutate tables.");
    },
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`);
  }
}
