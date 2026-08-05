import {
  AdminMutationError,
  type AdminMutationIdentity,
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
} from "../../../platform/supabase/adminMutation.ts";

export interface ArchivePlayerForAuthorizedStaffInput {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly playerId: string;
  readonly identity: AdminMutationIdentity;
}

export interface ArchivePlayerForAuthorizedStaffResult {
  readonly status: number;
  readonly replayed: boolean;
  readonly archived: true;
  readonly destructiveDelete: false;
  readonly alreadyArchived: boolean;
  readonly player: Record<string, unknown>;
}

/**
 * Archives a Player and revokes every active credential/session in the same
 * owner-scoped database transaction as the Staff audit and idempotency result.
 */
export async function archivePlayerForAuthorizedStaff(
  client: AdminMutationRpcClient,
  input: ArchivePlayerForAuthorizedStaffInput,
): Promise<ArchivePlayerForAuthorizedStaffResult> {
  const playerId = input.playerId.trim();
  if (!playerId) {
    throw new AdminMutationError(
      "missing_player_id",
      "A player id is required.",
      400,
    );
  }

  const result = await executeAdminMutationRpc(
    client,
    "admin_archive_player_v1",
    {
      p_game_session_id: input.gameSessionId,
      p_staff_user_id: input.staffUserId,
      p_player_id: playerId,
      p_request_payload: {
        operation: "archive_player",
        playerId,
      },
      p_idempotency_key: input.identity.idempotencyKey,
      p_request_id: input.identity.requestId,
    },
    {
      code: "player_archive_failed",
      message: "Player could not be archived.",
    },
  );

  const player = asRecord(result.body.player);
  if (
    !player || result.body.archived !== true ||
    result.body.destructiveDelete !== false ||
    typeof result.body.alreadyArchived !== "boolean"
  ) {
    throw new AdminMutationError(
      "player_archive_failed",
      "Player could not be archived.",
      500,
    );
  }

  return {
    status: result.status,
    replayed: result.replayed,
    archived: true,
    destructiveDelete: false,
    alreadyArchived: result.body.alreadyArchived,
    player,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
