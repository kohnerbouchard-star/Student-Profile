import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { PlayerMessageInboxReadRepository } from "../application/readPlayerMessageInbox.ts";
import type { RawInbox } from "../contracts/playerMessageInboxRead.ts";

export function createSupabasePlayerMessageInboxReadRepository(
  client: Pick<EdgeSupabaseClient, "rpc">,
): PlayerMessageInboxReadRepository {
  return {
    readInbox(scope, query) {
      return client.rpc<RawInbox>("read_player_messages_v2", {
        p_game_session_id: scope.gameId,
        p_player_id: scope.playerUuid,
        p_thread_limit: query.threadLimit,
        p_message_limit: query.messageLimit,
        p_query: query.query,
        p_before_updated_at: query.beforeUpdatedAt,
        p_before_thread_public_id: query.beforeThreadId,
      });
    },
  };
}
