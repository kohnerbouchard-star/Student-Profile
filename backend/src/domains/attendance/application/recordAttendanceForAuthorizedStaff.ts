import {
  AdminMutationError,
  type AdminMutationIdentity,
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
  readAdminMutationReplay,
} from "../../../platform/supabase/adminMutation.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { readValidTimeZone } from "../../../platform/supabase/edgeTime.ts";
import type { StaffAttendanceScanRequestBody } from "../api/attendanceHttpHelpers.ts";
import {
  type PlayerAttendanceClockInRpcRow,
  readPlayerAttendanceClockInRpcRow,
  readPlayerAttendanceWindowConfig,
} from "../api/attendanceHttpHelpers.ts";
import {
  type AttendanceRewardPolicyResolution,
  resolveAttendanceRewardPolicy,
} from "../api/attendanceRewardPolicy.ts";
import {
  derivePlayerCredentialLookupDigest,
  PLAYER_CREDENTIAL_VERSION,
} from "../../../security/playerCredentialHashing.ts";
import { normalizeStudentCode } from "../../players/domain/playerAccessCodes.ts";
import { normalizePlayerIdentifier } from "../../players/domain/playerIdentifiers.ts";

export type AuthorizedAttendanceOperation = "manual" | "scan";

export interface RecordAttendanceMutationInput {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly operation: AuthorizedAttendanceOperation;
  readonly playerId: string;
  readonly attendanceDate: string;
  readonly status: string;
  readonly clockedInAt: string | null;
  readonly note: string | null;
  readonly rewardAmount: number | null;
  readonly currencyCode: string | null;
  readonly responseContext: Record<string, unknown>;
  readonly requestPayload: Record<string, unknown>;
  readonly identity: AdminMutationIdentity;
}

export interface RecordAttendanceMutationResult {
  readonly status: number;
  readonly replayed: boolean;
  readonly attendance: Record<string, unknown>;
  readonly context: Record<string, unknown>;
}

/**
 * The single persistence boundary shared by manual corrections and scanner
 * clock-ins. The database function owns the mutation, audit, and idempotency
 * completion transaction.
 */
export async function recordAttendanceForAuthorizedStaff(
  input: RecordAttendanceMutationInput,
  serviceClient: AdminMutationRpcClient,
): Promise<RecordAttendanceMutationResult> {
  const mutation = await executeAdminMutationRpc(
    serviceClient,
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
    {
      code: "attendance_write_failed",
      message: "Attendance could not be recorded.",
    },
  );

  if (!isRecord(mutation.body.attendance) || !isRecord(mutation.body.context)) {
    throw attendanceWriteFailed();
  }

  return {
    status: mutation.status,
    replayed: mutation.replayed,
    attendance: mutation.body.attendance,
    context: mutation.body.context,
  };
}

export interface RecordManualAttendanceForAuthorizedStaffInput {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly body: unknown;
  readonly identity: AdminMutationIdentity;
  /** Test seam only; production callers should omit this. */
  readonly now?: Date;
}

export interface RecordManualAttendanceForAuthorizedStaffResult
  extends RecordAttendanceMutationResult {
  readonly corrected: true;
}

/**
 * Preserves the established Admin correction aliases while delegating all
 * ownership, lock, write, audit, and idempotency enforcement to one RPC.
 */
export async function recordManualAttendanceForAuthorizedStaff(
  input: RecordManualAttendanceForAuthorizedStaffInput,
  serviceClient: AdminMutationRpcClient,
): Promise<RecordManualAttendanceForAuthorizedStaffResult> {
  const envelope = isRecord(input.body) ? input.body : {};
  const payload = isRecord(envelope.payload) ? envelope.payload : null;
  const body = payload ? { ...envelope, ...payload } : envelope;
  const playerId = text(body.playerId ?? body.studentId ?? body.id);
  const requestedAttendanceDate = text(
    body.attendanceDate ?? body.date ?? body.recordDate,
  );
  const attendanceDate = isoDate(requestedAttendanceDate) ||
    localDateForTimeZone(input.now ?? new Date(), "Asia/Seoul");
  const explicitStatus = text(
    body.status ?? body.attendanceStatus ?? body.value,
  ).toLowerCase();
  const status = explicitStatus
    ? manualAttendanceStatus(explicitStatus)
    : manualAttendanceStatus(text(body.action).toLowerCase()) ??
      manualAttendanceStatus(text(envelope.action).toLowerCase());

  if (!playerId || !status) {
    throw new AdminMutationError(
      "invalid_attendance_correction",
      "A player and a valid attendance status are required.",
      400,
    );
  }

  const requestedClockedInAt = text(body.clockedInAt ?? body.scannedAt);
  const note = text(body.note ?? body.adminNote ?? body.reason) || null;
  const clockedInAt = status === "present" || status === "late"
    ? requestedClockedInAt || (input.now ?? new Date()).toISOString()
    : null;
  const responseContext = { corrected: true };

  const result = await recordAttendanceForAuthorizedStaff({
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    operation: "manual",
    playerId,
    attendanceDate,
    status,
    clockedInAt,
    note,
    rewardAmount: null,
    currencyCode: null,
    responseContext,
    // Dynamic server defaults are deliberately absent from the fingerprint.
    requestPayload: {
      operation: "manual",
      playerId,
      requestedAttendanceDate: requestedAttendanceDate || null,
      status,
      requestedClockedInAt: requestedClockedInAt || null,
      note,
    },
    identity: input.identity,
  }, serviceClient);

  return { ...result, corrected: true };
}

interface AttendancePlayerRow {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly player_identifier: string | null;
  readonly status: string;
}

interface AttendanceScanResponseContext {
  readonly timezone: string;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string | null;
    readonly status: string;
  };
  readonly reward: AttendanceRewardPolicyResolution;
}

export interface RecordAttendanceScanForAuthorizedStaffInput {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly body: StaffAttendanceScanRequestBody;
  readonly identity: AdminMutationIdentity;
}

export interface RecordAttendanceScanForAuthorizedStaffResult {
  readonly status: number;
  readonly replayed: boolean;
  readonly player: AttendanceScanResponseContext["player"];
  readonly attendance: PlayerAttendanceClockInRpcRow & {
    readonly timezone: string;
  };
  readonly reward: AttendanceRewardPolicyResolution;
}

export interface AttendanceScanApplicationDependencies {
  readonly now?: () => Date;
  readonly deriveCredentialLookupDigest?:
    typeof derivePlayerCredentialLookupDigest;
  readonly hashValue?: typeof sha256Hex;
  readonly readPlayer?: (
    serviceClient: EdgeSupabaseClient,
    gameSessionId: string,
    scannedValue: string,
    normalizedIdentifier: string,
  ) => Promise<AttendancePlayerRow | null>;
  readonly readAttendanceWindow?: (
    serviceClient: EdgeSupabaseClient,
    gameSessionId: string,
  ) => Promise<unknown>;
  readonly resolveRewardPolicy?: typeof resolveAttendanceRewardPolicy;
}

/**
 * Pre-authorized scanner application operation. Authentication, ownership,
 * CSRF, and rate limiting remain the responsibility of the calling HTTP
 * entrypoint and are intentionally not repeated here.
 */
export async function recordAttendanceScanForAuthorizedStaff(
  input: RecordAttendanceScanForAuthorizedStaffInput,
  serviceClient: EdgeSupabaseClient,
  dependencies: AttendanceScanApplicationDependencies = {},
): Promise<RecordAttendanceScanForAuthorizedStaffResult> {
  const scannedValue = input.body.playerId;
  const normalizedIdentifier = normalizePlayerIdentifier(scannedValue);
  const scanValueLookupDigest = await (
    dependencies.deriveCredentialLookupDigest ??
      derivePlayerCredentialLookupDigest
  )(normalizedIdentifier);
  const requestPayload = {
    operation: "scan",
    scanValueLookupDigest,
    deviceTimezone: input.body.deviceTimezone?.trim() || null,
  };
  const replay = await readAdminMutationReplay(serviceClient, {
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    operation: "attendance.scan",
    requestPayload,
    identity: input.identity,
  }, {
    code: "attendance_write_failed",
    message: "Attendance could not be recorded.",
  });
  if (replay) {
    if (!isRecord(replay.body.attendance) || !isRecord(replay.body.context)) {
      throw attendanceWriteFailed();
    }
    return attendanceScanResult({
      status: replay.status,
      replayed: true,
      attendance: replay.body.attendance,
      context: replay.body.context,
    });
  }

  const player = dependencies.readPlayer
    ? await dependencies.readPlayer(
      serviceClient,
      input.gameSessionId,
      scannedValue,
      normalizedIdentifier,
    )
    : await readAttendancePlayer(
      serviceClient,
      input.gameSessionId,
      scannedValue,
      normalizedIdentifier,
      scanValueLookupDigest,
      dependencies.hashValue ?? sha256Hex,
    );

  if (!player?.id || player.status !== "active") {
    throw new AdminMutationError(
      "player_not_found",
      "Player ID was not found for this game.",
      404,
    );
  }

  const attendanceWindow = await (
    dependencies.readAttendanceWindow ?? readAttendanceWindow
  )(serviceClient, input.gameSessionId);
  const attendanceConfig = readPlayerAttendanceWindowConfig(attendanceWindow);
  const timezone = readValidTimeZone(
    input.body.deviceTimezone,
    attendanceConfig.timezone,
  );
  const now = (dependencies.now ?? (() => new Date()))();
  const attendanceDate = localDateForTimeZone(now, timezone);
  const currentMinutes = localMinutesForTimeZone(now, timezone);
  const attendanceStatus = attendanceConfig.lateCutoffMinutes !== null &&
      currentMinutes > attendanceConfig.lateCutoffMinutes
    ? "late"
    : "present";
  const configuredBaseAmount = attendanceStatus === "late"
    ? attendanceConfig.lateRewardAmount
    : attendanceConfig.presentRewardAmount;
  const rewardPolicy = await (
    dependencies.resolveRewardPolicy ?? resolveAttendanceRewardPolicy
  )(serviceClient, {
    gameSessionId: input.gameSessionId,
    playerId: player.id,
    configuredBaseAmount,
    attendanceConfig,
  });
  const responseContext: AttendanceScanResponseContext = {
    timezone,
    player: {
      id: player.id,
      displayName: player.display_name,
      rosterLabel: player.roster_label ?? null,
      playerIdentifier: player.player_identifier ?? null,
      status: player.status,
    },
    reward: rewardPolicy,
  };
  const mutation = await recordAttendanceForAuthorizedStaff({
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    operation: "scan",
    playerId: player.id,
    attendanceDate,
    status: attendanceStatus,
    clockedInAt: null,
    note: null,
    rewardAmount: rewardPolicy.effectiveAmount,
    currencyCode: rewardPolicy.currencyCode,
    responseContext: responseContext as unknown as Record<string, unknown>,
    // The scan value may be a legacy access code, so only its hash crosses the
    // RPC boundary. Derived date, status, and reward defaults are not hashed.
    requestPayload,
    identity: input.identity,
  }, serviceClient);

  return attendanceScanResult(mutation);
}

function attendanceScanResult(
  mutation: RecordAttendanceMutationResult,
): RecordAttendanceScanForAuthorizedStaffResult {
  const attendanceRow = readPlayerAttendanceClockInRpcRow([
    mutation.attendance,
  ]);
  const returnedContext = readAttendanceScanResponseContext(mutation.context);
  if (!attendanceRow || !returnedContext) throw attendanceWriteFailed();

  return {
    status: mutation.status,
    replayed: mutation.replayed,
    player: returnedContext.player,
    attendance: {
      ...attendanceRow,
      timezone: returnedContext.timezone,
    },
    reward: returnedContext.reward,
  };
}

async function readAttendancePlayer(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  scannedValue: string,
  normalizedIdentifier: string,
  currentLookupDigest: string,
  hashValue: typeof sha256Hex,
): Promise<AttendancePlayerRow | null> {
  const identifierResponse = await serviceClient
    .from("players")
    .select("id,display_name,roster_label,player_identifier,status")
    .eq("game_session_id", gameSessionId)
    .eq("player_identifier_normalized", normalizedIdentifier)
    .eq("status", "active")
    .maybeSingle();

  if (identifierResponse.error) throw attendanceScanFailed();
  const player = identifierResponse.data as unknown as
    | AttendancePlayerRow
    | null;
  if (player) return player;

  let playerId = await readCredentialPlayerId(
    serviceClient,
    gameSessionId,
    currentLookupDigest,
    PLAYER_CREDENTIAL_VERSION,
  );
  if (!playerId) {
    const legacyHash = await hashValue(normalizeStudentCode(scannedValue));
    playerId = await readCredentialPlayerId(
      serviceClient,
      gameSessionId,
      legacyHash,
      "sha256-v1",
    );
  }
  if (!playerId) return null;

  const playerResponse = await serviceClient
    .from("players")
    .select("id,display_name,roster_label,player_identifier,status")
    .eq("game_session_id", gameSessionId)
    .eq("id", playerId)
    .maybeSingle();

  if (playerResponse.error) throw attendanceScanFailed();
  return (playerResponse.data as unknown as AttendancePlayerRow | null) ?? null;
}

async function readCredentialPlayerId(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  lookupDigest: string,
  credentialVersion: typeof PLAYER_CREDENTIAL_VERSION | "sha256-v1",
): Promise<string | null> {
  const response = await serviceClient
    .from("player_access_credentials")
    .select("player_id,status,credential_version")
    .eq("game_session_id", gameSessionId)
    .eq("normalized_student_code_hash", lookupDigest)
    .eq("credential_version", credentialVersion)
    .eq("status", "active")
    .maybeSingle();

  if (response.error) throw attendanceScanFailed();
  if (response.data === null) return null;
  const playerId = (response.data as {
    readonly player_id?: unknown;
  }).player_id;
  if (typeof playerId !== "string" || !playerId) {
    throw attendanceScanFailed();
  }
  return playerId;
}

async function readAttendanceWindow(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
): Promise<unknown> {
  const response = await serviceClient
    .from("game_settings")
    .select("attendance_window")
    .eq("game_session_id", gameSessionId)
    .maybeSingle();
  if (response.error) throw attendanceScanFailed();
  return (response.data as { readonly attendance_window?: unknown } | null)
    ?.attendance_window;
}

function readAttendanceScanResponseContext(
  value: unknown,
): AttendanceScanResponseContext | null {
  if (!isRecord(value) || !isRecord(value.player) || !isRecord(value.reward)) {
    return null;
  }
  const player = value.player;
  const reward = value.reward;
  const rosterLabel = player.rosterLabel;
  const playerIdentifier = player.playerIdentifier;
  if (
    typeof value.timezone !== "string" ||
    typeof player.id !== "string" ||
    typeof player.displayName !== "string" ||
    (rosterLabel !== null && typeof rosterLabel !== "string") ||
    (playerIdentifier !== null && typeof playerIdentifier !== "string") ||
    typeof player.status !== "string" ||
    !isRewardPolicyResolution(reward)
  ) {
    return null;
  }

  return {
    timezone: value.timezone,
    player: {
      id: player.id,
      displayName: player.displayName,
      rosterLabel: rosterLabel as string | null,
      playerIdentifier: playerIdentifier as string | null,
      status: player.status,
    },
    reward,
  };
}

function isRewardPolicyResolution(
  value: unknown,
): value is AttendanceRewardPolicyResolution {
  if (!isRecord(value)) return false;
  return typeof value.configuredBaseAmount === "number" &&
    typeof value.effectiveAmount === "number" &&
    typeof value.baseCurrencyCode === "string" &&
    typeof value.currencyCode === "string" &&
    ["player_country", "fixed", "fixed_fallback"].includes(
      String(value.currencyMode),
    ) &&
    (value.countryCode === null || typeof value.countryCode === "string") &&
    typeof value.incomeModifier === "number" &&
    typeof value.exchangeRateIndex === "number";
}

function manualAttendanceStatus(
  value: string,
): "present" | "late" | "absent" | "excused" | null {
  const aliases: Record<string, "present" | "late" | "absent" | "excused"> = {
    present: "present",
    late: "late",
    absent: "absent",
    excused: "excused",
    "mark-present": "present",
    "mark-late": "late",
    "mark-absent": "absent",
    "mark-excused": "excused",
    "attendance-mark-present": "present",
    "attendance-mark-late": "late",
    "attendance-mark-absent": "absent",
    "attendance-mark-excused": "excused",
  };
  return aliases[value] ?? null;
}

function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ? ""
    : value;
}

function localDateForTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw attendanceScanFailed();
  return `${year}-${month}-${day}`;
}

function localMinutesForTimeZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (!hour || !minute) throw attendanceScanFailed();
  return Number(hour) * 60 + Number(minute);
}

function text(value: unknown): string {
  return String(value ?? "").trim();
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
