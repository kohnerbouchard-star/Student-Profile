import type { PlayerRequestScope } from "../../players/index.ts";
import { readPlayerMessagePolicy } from "./readPlayerMessagePolicy.ts";
import { createSupabasePlayerMessageThreadRepository } from "../infrastructure/supabasePlayerMessageThreadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
const scope: PlayerRequestScope = Object.freeze({
  gameId: "00000000-0000-4000-8000-000000000001",
  playerUuid: "00000000-0000-4000-8000-000000000021",
  activeSessionId: "00000000-0000-4000-8000-000000000011",
  sessionValid: true,
  sessionExpiresAt: "2026-07-22T00:00:00.000Z",
  authorizationContext: Object.freeze({
    actorType: "player",
    source: "player_session",
    gameScope: "session",
    resourceScope: "own_player",
  }),
});

Deno.test("Messaging policy application forwards exact scope and thenable without normalization", () => {
  const error = { code: "P0001", message: "SCOPE_FORBIDDEN" };
  const result = Promise.resolve({ data: null, error });
  let calls = 0;
  const actual = readPlayerMessagePolicy(scope, {
    readPolicy(received) {
      if (received !== scope) throw new Error("Scope identity changed");
      calls++;
      return result;
    },
  });
  if (actual !== result || calls !== 1) {
    throw new Error("Read boundary changed promise or count");
  }
});

Deno.test("Messaging policy adapter projects only authenticated IDs and preserves response identity", async () => {
  const data = { attachmentsEnabled: false, unchanged: "raw adapter result" };
  const error = { message: "unchanged error" };
  const response = { data, error };
  const result = Promise.resolve(response);
  const calls: unknown[] = [];
  const repository = createSupabasePlayerMessageThreadRepository(
    {
      rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return result;
      },
    } as never,
  );
  const actual = repository.readPolicy(scope);
  if (actual !== result || await actual !== response) {
    throw new Error("Adapter cloned or normalized response");
  }
  equal(calls, [{
    name: "read_player_message_policy_v1",
    args: {
      p_game_session_id: scope.gameId,
      p_player_id: scope.playerUuid,
    },
  }]);
});

Deno.test("Messaging policy adapter preserves null results without additional reads", async () => {
  let calls = 0;
  const repository = createSupabasePlayerMessageThreadRepository({
    rpc() {
      calls++;
      return Promise.resolve({ data: null, error: null });
    },
  } as never);
  equal(await repository.readPolicy(scope), { data: null, error: null });
  equal(calls, 1);
});

Deno.test("Messaging policy extraction leaves create-thread atomic arguments unchanged", async () => {
  const calls: unknown[] = [];
  const repository = createSupabasePlayerMessageThreadRepository(
    {
      rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return Promise.resolve({ data: [], error: null });
      },
    } as never,
  );
  await repository.createThread(scope, {
    recipientPlayerId: "PLAYER-002",
    title: "Title",
    body: "Body",
    idempotencyKey: "message-thread:1",
  });
  equal(calls, [{
    name: "create_player_message_thread_atomic_v1",
    args: {
      p_game_session_id: scope.gameId,
      p_player_id: scope.playerUuid,
      p_recipient_player_identifier: "PLAYER-002",
      p_title: "Title",
      p_initial_body: "Body",
      p_idempotency_key: "message-thread:1",
    },
  }]);
});
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`,
    );
  }
}
