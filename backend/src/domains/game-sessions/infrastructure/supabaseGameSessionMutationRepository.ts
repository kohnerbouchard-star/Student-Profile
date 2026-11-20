import {
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
} from "../../../platform/supabase/adminMutation.ts";
import type {
  GameSessionMutationRepository,
} from "../contracts/gameSessionMutationRepository.ts";

export function createSupabaseGameSessionMutationRepository(
  client: AdminMutationRpcClient,
): GameSessionMutationRepository {
  return {
    rotateGameJoinCode: (command) =>
      executeAdminMutationRpc(
        client,
        "admin_rotate_game_join_code_v1",
        {
          p_game_session_id: command.applicationContext.gameSessionId,
          p_staff_user_id: command.applicationContext.actor.staffUserId,
          p_request_payload: command.requestPayload,
          p_idempotency_key: command.mutation.idempotencyKey,
          p_request_id: command.mutation.requestId,
        },
        {
          code: "join_code_reset_failed",
          message: "Game join code could not be reset.",
        },
      ),
    updateGameSettings: (command) =>
      executeAdminMutationRpc(
        client,
        "admin_update_game_settings_v1",
        {
          p_game_session_id: command.applicationContext.gameSessionId,
          p_staff_user_id: command.applicationContext.actor.staffUserId,
          p_game_settings_patch: command.gameSettingsPatch,
          p_difficulty_policy_patch: command.difficultyPolicyPatch,
          p_request_payload: command.requestPayload,
          p_idempotency_key: command.mutation.idempotencyKey,
          p_request_id: command.mutation.requestId,
        },
        {
          code: "game_settings_failed",
          message: "Game settings request failed.",
        },
      ),
  };
}
