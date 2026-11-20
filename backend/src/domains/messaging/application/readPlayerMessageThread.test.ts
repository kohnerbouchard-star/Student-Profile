import type { PlayerRequestScope } from "../../players/index.ts";
import {
  type PlayerMessageThreadReadQuery,
  readPlayerMessageThread,
} from "./readPlayerMessageThread.ts";
import { createSupabasePlayerMessageThreadReadRepository } from "../infrastructure/supabasePlayerMessageThreadReadRepository.ts";

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
const query: PlayerMessageThreadReadQuery = Object.freeze({
  threadId: `thr_${"a".repeat(32)}`,
  messageLimit: 25,
});

Deno.test("Thread read use case forwards exact authenticated scope and request once", () => {
  const result = Promise.resolve({ data: { id: query.threadId }, error: null });
  let calls = 0;
  const actual = readPlayerMessageThread(scope, query, {
    readThread(receivedScope, receivedQuery) {
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

Deno.test("Thread read repository preserves exact RPC args, receiver, and raw result or error", async () => {
  for (const response of [
    { data: { id: query.threadId }, error: null },
    { data: null, error: { code: "P0001", message: "unchanged" } },
  ]) {
    const result = Promise.resolve(response);
    const calls: unknown[] = [];
    const client = {
      rpc(name: string, args: unknown) {
        if (this !== client) throw new Error("RPC receiver changed");
        calls.push({ name, args });
        return result;
      },
    };
    const actual = createSupabasePlayerMessageThreadReadRepository(client as never)
      .readThread(scope, query);
    if (actual !== result || await actual !== response) {
      throw new Error("Adapter transformed result");
    }
    const expected = [{
      name: "read_player_message_thread_v1",
      args: {
        p_game_session_id: scope.gameId,
        p_player_id: scope.playerUuid,
        p_thread_public_id: query.threadId,
        p_message_limit: query.messageLimit,
      },
    }];
    if (JSON.stringify(calls) !== JSON.stringify(expected)) {
      throw new Error("Adapter RPC identity, arguments, or invocation count changed");
    }
  }
});
