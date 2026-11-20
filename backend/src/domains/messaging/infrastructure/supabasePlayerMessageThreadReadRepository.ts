import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { PlayerMessageThreadReadRepository } from "../application/readPlayerMessageThread.ts";
import type { RawThread } from "../contracts/playerMessageThreadRead.ts";

export function createSupabasePlayerMessageThreadReadRepository(
  client: Pick<EdgeSupabaseClient, "rpc">,
): PlayerMessageThreadReadRepository {
  return {
    readThread(scope, query) {
      return client.rpc<RawThread>("read_player_message_thread_v1", {
        p_game_session_id: scope.gameId,
        p_player_id: scope.playerUuid,
        p_thread_public_id: query.threadId,
        p_message_limit: query.messageLimit,
      });
    },
  };
}
