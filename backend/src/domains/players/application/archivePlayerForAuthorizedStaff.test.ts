import type { AdminMutationRpcClient } from "../../../platform/supabase/adminMutation.ts";
import { archivePlayerForAuthorizedStaff } from "./archivePlayerForAuthorizedStaff.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const PLAYER_ID = "00000000-0000-4000-8000-000000000301";

Deno.test("player archive uses one transactional idempotent RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client: AdminMutationRpcClient = {
    rpc<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: [{
          response_status: 200,
          response_body: {
            archived: true,
            destructiveDelete: false,
            alreadyArchived: false,
            player: { id: PLAYER_ID, status: "archived" },
          },
          was_replayed: false,
        }] as T,
        error: null,
      });
    },
  };

  const result = await archivePlayerForAuthorizedStaff(client, {
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    playerId: PLAYER_ID,
    identity: {
      idempotencyKey: "player-archive-command-001",
      requestId: "request-player-archive-001",
    },
  });

  assertEquals(calls, [{
    name: "admin_archive_player_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_player_id: PLAYER_ID,
      p_request_payload: {
        operation: "archive_player",
        playerId: PLAYER_ID,
      },
      p_idempotency_key: "player-archive-command-001",
      p_request_id: "request-player-archive-001",
    },
  }]);
  assertEquals(result.archived, true);
  assertEquals(result.player, { id: PLAYER_ID, status: "archived" });
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
