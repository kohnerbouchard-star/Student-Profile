import {
  AdminMutationError,
  type AdminMutationIdentity,
  type AdminMutationRpcClient,
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
} from "../../../security/playerCredentialHashing.ts";
import { normalizePlayerIdentifier } from "../../players/domain/playerIdentifiers.ts";
import type {
  AttendancePlayerRecord,
  AttendanceRecordRepository,
} from "../contracts/attendanceRecordRepository.ts";
import { SupabaseAttendanceRecordRepository } from "../infrastructure/supabaseAttendanceRecordRepository.ts";

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
  persistence: AttendanceRecordRepository | AdminMutationRpcClient,
): Promise<RecordAttendanceMutationResult> {
  return await attendanceRepository(persistence).record(input);
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
  repository: AttendanceRecordRepository =
    new SupabaseAttendanceRecordRepository(serviceClient as EdgeSupabaseClient),
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
  }, repository);

  return { ...result, corrected: true };
}

type AttendancePlayerRow = AttendancePlayerRecord;

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
  readonly repository?: AttendanceRecordRepository;
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
  const repository = dependencies.repository ??
    new SupabaseAttendanceRecordRepository(serviceClient);
  const replay = await repository.readScanReplay({
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    requestPayload,
    identity: input.identity,
  });
  if (replay) return attendanceScanResult(replay);

  const player = dependencies.readPlayer
    ? await dependencies.readPlayer(
      serviceClient,
      input.gameSessionId,
      scannedValue,
      normalizedIdentifier,
    )
    : await repository.readPlayerForScan({
      gameSessionId: input.gameSessionId,
      scannedValue,
      normalizedIdentifier,
      currentLookupDigest: scanValueLookupDigest,
      hashLegacyValue: dependencies.hashValue ?? sha256Hex,
    });

  if (!player?.id || player.status !== "active") {
    throw new AdminMutationError(
      "player_not_found",
      "Player ID was not found for this game.",
      404,
    );
  }

  const attendanceWindow = dependencies.readAttendanceWindow
    ? await dependencies.readAttendanceWindow(serviceClient, input.gameSessionId)
    : await repository.readAttendanceWindow(input.gameSessionId);
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
  }, repository);

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

function attendanceRepository(
  persistence: AttendanceRecordRepository | AdminMutationRpcClient,
): AttendanceRecordRepository {
  if ("record" in persistence) return persistence;
  return new SupabaseAttendanceRecordRepository(
    persistence as EdgeSupabaseClient,
  );
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
