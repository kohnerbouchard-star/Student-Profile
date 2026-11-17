import type { PlayerRequestScope } from "../../players/index.ts";
import {
  type PlayerMessageInboxReadQuery,
  readPlayerMessageInbox,
} from "./readPlayerMessageInbox.ts";
import { createSupabasePlayerMessageInboxReadRepository } from "../infrastructure/supabasePlayerMessageInboxReadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
const scope: PlayerRequestScope = Object.freeze({
  gameId: "00000000-0000-4000-8000-000000000001",
  playerUuid: "00000000-0000-4000-8000-000000000021",
  activeSessionId: "00000000-0000-4000-8000-000000000011",
  sessionValid: true,
  sessionExpiresAt: "2026-07-21T00:00:00.000Z",
  authorizationContext: Object.freeze({
    actorType: "player",
    source: "player_session",
    gameScope: "session",
    resourceScope: "own_player",
  }),
});
const query: PlayerMessageInboxReadQuery = Object.freeze({
  threadLimit: 10,
  messageLimit: 20,
  query: "Market",
  beforeUpdatedAt: "2026-07-20T04:00:00.000Z",
  beforeThreadId: `thr_${"a".repeat(32)}`,
});

Deno.test("Inbox application forwards exact scope, query and thenable once", () => {
  const result = Promise.resolve({
    data: null,
    error: { code: "P0001", message: "unchanged" },
  });
  let calls = 0;
  const actual = readPlayerMessageInbox(scope, query, {
    readInbox(receivedScope, receivedQuery) {
      if (receivedScope !== scope || receivedQuery !== query) {
        throw new Error("Read identity changed");
      }
      calls++;
      return result;
    },
  });
  if (actual !== result || calls !== 1) {
    throw new Error("Promise or invocation count changed");
  }
});

Deno.test("Inbox adapter retains exact scoped RPC arguments, receiver and result identity", async () => {
  const response = {
    data: { threads: [], unreadCount: 0, pageUnreadCount: 0, nextCursor: null },
    error: null,
  };
  const promise = Promise.resolve(response);
  const calls: unknown[] = [];
  const client = {
    rpc(name: string, args: unknown) {
      if (this !== client) throw new Error("RPC receiver changed");
      calls.push({ name, args });
      return promise;
    },
  };
  const actual = createSupabasePlayerMessageInboxReadRepository(client as never)
    .readInbox(scope, query);
  if (actual !== promise || await actual !== response) {
    throw new Error("Adapter transformed result");
  }
  equal(calls, [{
    name: "read_player_messages_v2",
    args: {
      p_game_session_id: scope.gameId,
      p_player_id: scope.playerUuid,
      p_thread_limit: 10,
      p_message_limit: 20,
      p_query: "Market",
      p_before_updated_at: query.beforeUpdatedAt,
      p_before_thread_public_id: query.beforeThreadId,
    },
  }]);
});

Deno.test("Inbox adapter preserves null pagination and error without normalization or retry", async () => {
  const error = { code: "42P01", message: "unchanged database error" };
  const response = { data: null, error };
  let calls = 0;
  let args: unknown;
  const repository = createSupabasePlayerMessageInboxReadRepository(
    {
      rpc(_name: string, received: unknown) {
        calls++;
        args = received;
        return Promise.resolve(response);
      },
    } as never,
  );
  const actual = await repository.readInbox(scope, {
    threadLimit: 25,
    messageLimit: 50,
    query: null,
    beforeUpdatedAt: null,
    beforeThreadId: null,
  });
  if (actual !== response || actual.error !== error || calls !== 1) {
    throw new Error("Error/result identity or count changed");
  }
  equal(args, {
    p_game_session_id: scope.gameId,
    p_player_id: scope.playerUuid,
    p_thread_limit: 25,
    p_message_limit: 50,
    p_query: null,
    p_before_updated_at: null,
    p_before_thread_public_id: null,
  });
});
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`,
    );
  }
}
