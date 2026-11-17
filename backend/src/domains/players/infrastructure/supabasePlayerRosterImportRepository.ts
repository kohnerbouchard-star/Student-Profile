import {
  AdminMutationError,
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
  readAdminMutationReplay,
} from "../../../platform/supabase/adminMutation.ts";
import type {
  PlayerRosterImportRepository,
  RosterImportCommand,
  RosterImportReceipt,
} from "../contracts/playerRosterImport.ts";

const failureDescription = {
  code: "roster_import_failed",
  message:
    "Roster import could not be completed. Retry with the same Idempotency-Key.",
};
function receipt(
  result: { status: number; replayed: boolean; body: Record<string, unknown> },
  command: RosterImportCommand,
): RosterImportReceipt {
  const { createdCount, students } = result.body;
  if (
    createdCount !== command.studentNames.length || !Array.isArray(students) ||
    students.length !== createdCount
  ) {
    throw new AdminMutationError(
      failureDescription.code,
      failureDescription.message,
      500,
    );
  }
  const rows = students.map((value: unknown, index: number) => {
    if (!value || typeof value !== "object") {
      throw new AdminMutationError(
        failureDescription.code,
        failureDescription.message,
        500,
      );
    }
    const row = value as Record<string, unknown>;
    if (
      row.row !== index + 1 ||
      row.displayName !== command.studentNames[index] ||
      typeof row.playerIdentifier !== "string" ||
      !/^STU-[A-F0-9]{24}$/.test(row.playerIdentifier)
    ) {
      throw new AdminMutationError(
        failureDescription.code,
        failureDescription.message,
        500,
      );
    }
    // Explicit projection: never forward additional database fields.
    return {
      row: index + 1,
      displayName: command.studentNames[index],
      playerIdentifier: row.playerIdentifier,
    };
  });
  return {
    status: result.status,
    replayed: result.replayed,
    createdCount: students.length,
    students: rows,
  };
}
export function createSupabasePlayerRosterImportRepository(
  client: AdminMutationRpcClient,
): PlayerRosterImportRepository {
  return {
    async readReplay(command) {
      const result = await readAdminMutationReplay(client, {
        ...command,
        operation: "players.roster_import",
        requestPayload: { studentNames: command.studentNames },
      }, failureDescription);
      return result ? receipt(result, command) : null;
    },
    async create(command, credentials) {
      const result = await executeAdminMutationRpc(
        client,
        "admin_import_player_roster_v1",
        {
          p_game_session_id: command.gameSessionId,
          p_staff_user_id: command.staffUserId,
          p_student_names: command.studentNames,
          p_credentials: credentials,
          p_idempotency_key: command.identity.idempotencyKey,
          p_request_id: command.identity.requestId,
        },
        failureDescription,
      );
      return receipt(result, command);
    },
  };
}
