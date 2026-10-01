import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { PlayerMessageThreadRepository } from "../application/createPlayerMessageThread.ts";

export function createSupabasePlayerMessageThreadRepository(
  client: Pick<EdgeSupabaseClient, "rpc">,
): PlayerMessageThreadRepository {
  return {
    createThread(scope, command) {
      // Ownership comes from the resolved session; the recipient remains a public identifier.
      return client.rpc<readonly unknown[]>("create_player_message_thread_atomic_v1", {
        p_game_session_id: scope.gameId,
        p_player_id: scope.playerUuid,
        p_recipient_player_identifier: command.recipientPlayerId,
        p_title: command.title,
        p_initial_body: command.body,
        p_idempotency_key: command.idempotencyKey,
      });
    },
  };
}
