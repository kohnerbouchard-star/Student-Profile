import {
  AdminMutationError,
  executeAdminMutationRpc,
  readAdminMutationReplay,
} from "../../../platform/supabase/adminMutation.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { PLAYER_CREDENTIAL_VERSION } from "../../../security/playerCredentialHashing.ts";
import { normalizeStudentCode } from "../../players/domain/playerAccessCodes.ts";
import type {
  AttendanceMutationCommand,
  AttendanceMutationReceipt,
  AttendancePlayerRecord,
  AttendanceRecordRepository,
} from "../contracts/attendanceRecordRepository.ts";

export class SupabaseAttendanceRecordRepository
  implements AttendanceRecordRepository {
  constructor(private readonly serviceClient: EdgeSupabaseClient) {}

  async readScanReplay(input: {
    readonly gameSessionId: string;
    readonly staffUserId: string;
    readonly requestPayload: Record<string, unknown>;
    readonly identity: AttendanceMutationCommand["identity"];
  }): Promise<AttendanceMutationReceipt | null> {
    const replay = await readAdminMutationReplay(this.serviceClient, {
      gameSessionId: input.gameSessionId,
      staffUserId: input.staffUserId,
      operation: "attendance.scan",
      requestPayload: input.requestPayload,
      identity: input.identity,
    }, attendanceWriteErrorDescriptor());
    if (!replay) return null;
    return readMutationReceipt(replay);
  }

  async readPlayerForScan(input: {
    readonly gameSessionId: string;
    readonly scannedValue: string;
    readonly normalizedIdentifier: string;
    readonly currentLookupDigest: string;
    readonly hashPriorCredentialValue: (value: string) => Promise<string>;
  }): Promise<AttendancePlayerRecord | null> {
    const identifierResponse = await this.serviceClient
      .from("players")
      .select("id,display_name,roster_label,player_identifier,status")
      .eq("game_session_id", input.gameSessionId)
      .eq("player_identifier_normalized", input.normalizedIdentifier)
      .eq("status", "active")
      .maybeSingle();

    if (identifierResponse.error) throw attendanceScanFailed();
    const player = identifierResponse.data as unknown as
      | AttendancePlayerRecord
      | null;
    if (player) return player;

    let playerId = await this.readCredentialPlayerId(
      input.gameSessionId,
      input.currentLookupDigest,
      PLAYER_CREDENTIAL_VERSION,
    );
    if (!playerId) {
      const priorCredentialHash = await input.hashPriorCredentialValue(
        normalizeStudentCode(input.scannedValue),
      );
      playerId = await this.readCredentialPlayerId(
        input.gameSessionId,
        priorCredentialHash,
        "sha256-v1",
      );
    }
    if (!playerId) return null;

    const playerResponse = await this.serviceClient
      .from("players")
      .select("id,display_name,roster_label,player_identifier,status")
      .eq("game_session_id", input.gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error) throw attendanceScanFailed();
    return (playerResponse.data as unknown as AttendancePlayerRecord | null) ??
      null;
  }

  async readAttendanceWindow(gameSessionId: string): Promise<unknown> {
    const response = await this.serviceClient
      .from("game_settings")
      .select("attendance_window")
      .eq("game_session_id", gameSessionId)
      .maybeSingle();
    if (response.error) throw attendanceScanFailed();
    return (response.data as { readonly attendance_window?: unknown } | null)
      ?.attendance_window;
  }

  async record(
    input: AttendanceMutationCommand,
  ): Promise<AttendanceMutationReceipt> {
    const mutation = await executeAdminMutationRpc(
      this.serviceClient,
      "admin_record_attendance_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_staff_user_id: input.staffUserId,
        p_operation: input.operation,
        p_player_id: input.playerId,
        p_attendance_date: input.attendanceDate,
        p_status: input.status,
        p_clocked_in_at: input.clockedInAt,
        p_note: input.note,
        p_reward_amount: input.rewardAmount,
        p_currency_code: input.currencyCode,
        p_response_context: input.responseContext,
        p_request_payload: input.requestPayload,
        p_idempotency_key: input.identity.idempotencyKey,
        p_request_id: input.identity.requestId,
      },
      attendanceWriteErrorDescriptor(),
    );
    return readMutationReceipt(mutation);
  }

  private async readCredentialPlayerId(
    gameSessionId: string,
    lookupDigest: string,
    credentialVersion: typeof PLAYER_CREDENTIAL_VERSION | "sha256-v1",
  ): Promise<string | null> {
    const response = await this.serviceClient
      .from("player_access_credentials")
      .select("player_id,status,credential_version")
      .eq("game_session_id", gameSessionId)
      .eq("normalized_student_code_hash", lookupDigest)
      .eq("credential_version", credentialVersion)
      .eq("status", "active")
      .maybeSingle();

    if (response.error) throw attendanceScanFailed();
    if (response.data === null) return null;
    const playerId = (response.data as { readonly player_id?: unknown })
      .player_id;
    if (typeof playerId !== "string" || !playerId) {
      throw attendanceScanFailed();
    }
    return playerId;
  }
}

function readMutationReceipt(input: {
  readonly status: number;
  readonly replayed: boolean;
  readonly body: Record<string, unknown>;
}): AttendanceMutationReceipt {
  if (!isRecord(input.body.attendance) || !isRecord(input.body.context)) {
    throw attendanceWriteFailed();
  }
  return {
    status: input.status,
    replayed: input.replayed,
    attendance: input.body.attendance,
    context: input.body.context,
  };
}

function attendanceWriteErrorDescriptor() {
  return {
    code: "attendance_write_failed",
    message: "Attendance could not be recorded.",
  } as const;
}

function attendanceScanFailed(): AdminMutationError {
  return new AdminMutationError(
    "attendance_scan_failed",
    "Attendance scan failed.",
    500,
  );
}

function attendanceWriteFailed(): AdminMutationError {
  return new AdminMutationError(
    "attendance_write_failed",
    "Attendance could not be recorded.",
    500,
  );
}
