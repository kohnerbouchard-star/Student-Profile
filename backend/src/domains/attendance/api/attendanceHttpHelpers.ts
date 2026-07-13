import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import {
  isRecord,
  normalizeCurrencyCode,
  parseOptionalText,
  parseRequiredText,
} from "../../../platform/supabase/edgeParsing.ts";
import {
  readLocalDateForTimeZone,
  readOptionalNonNegativeAmount,
  readOptionalTimeMinutes,
  readValidTimeZone,
} from "../../../platform/supabase/edgeTime.ts";

export interface PlayerAttendanceClockInRpcRow {
  readonly attendance_id: string;
  readonly attendance_status: string;
  readonly attendance_date: string;
  readonly clocked_in_at: string;
  readonly was_created: boolean;
  readonly ledger_entry_id: string | null;
  readonly reward_amount: number | string;
  readonly currency_code: string;
}

export function readPlayerAttendanceClockInRpcRow(
  value: unknown,
): PlayerAttendanceClockInRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.attendance_id !== "string" ||
    typeof row.attendance_status !== "string" ||
    typeof row.attendance_date !== "string" ||
    typeof row.clocked_in_at !== "string" ||
    typeof row.was_created !== "boolean" ||
    typeof row.currency_code !== "string"
  ) {
    return null;
  }

  if (
    row.ledger_entry_id !== null &&
    typeof row.ledger_entry_id !== "string"
  ) {
    return null;
  }

  if (
    typeof row.reward_amount !== "number" &&
    typeof row.reward_amount !== "string"
  ) {
    return null;
  }

  return {
    attendance_id: row.attendance_id,
    attendance_status: row.attendance_status,
    attendance_date: row.attendance_date,
    clocked_in_at: row.clocked_in_at,
    was_created: row.was_created,
    ledger_entry_id: row.ledger_entry_id,
    reward_amount: row.reward_amount,
    currency_code: row.currency_code,
  };
}

export function mapAttendanceClockInRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "GAME_SESSION_REQUIRED":
    case "PLAYER_REQUIRED":
    case "ATTENDANCE_DATE_REQUIRED":
    case "INVALID_ATTENDANCE_STATUS":
    case "INVALID_REWARD_AMOUNT":
    case "INVALID_CURRENCY_CODE":
      return {
        code: "invalid_attendance_clock_in",
        message: "Attendance clock-in request is invalid.",
        status: 400,
        retryable: false,
      };

    case "PLAYER_NOT_FOUND":
      return {
        code: "player_not_found",
        message: "Player was not found for this game session.",
        status: 404,
        retryable: false,
      };

    default:
      return {
        code: "attendance_clock_in_failed",
        message: "Attendance clock-in failed.",
        status: 500,
        retryable: false,
      };
  }
}

export function readAttendanceDateQuery(
  value: string | null,
  timeZone: string,
): string {
  const rawDate = value?.trim();

  if (!rawDate) {
    return readLocalDateForTimeZone(timeZone);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    throw new EdgeActivationError(
      "invalid_attendance_date",
      "date must use YYYY-MM-DD format.",
      400,
    );
  }

  const parsedDate = new Date(`${rawDate}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== rawDate
  ) {
    throw new EdgeActivationError(
      "invalid_attendance_date",
      "date must be a real calendar date.",
      400,
    );
  }

  return rawDate;
}

export interface StaffAttendanceScanRequestBody {
  readonly playerId: string;
  readonly deviceTimezone: string | null;
}

export interface PlayerAttendanceWindowConfig {
  readonly timezone: string;
  readonly lateCutoffMinutes: number | null;
  readonly presentRewardAmount: number;
  readonly lateRewardAmount: number;
  readonly currencyCode: string;
}

export function readPlayerAttendanceWindowConfig(
  value: unknown,
): PlayerAttendanceWindowConfig {
  const attendanceWindow = isRecord(value) ? value : {};
  const timezone = readValidTimeZone(attendanceWindow.timezone, "Asia/Seoul");
  const lateCutoffMinutes = readOptionalTimeMinutes(attendanceWindow.lateCutoff);
  const presentRewardAmount = readOptionalNonNegativeAmount(
    attendanceWindow.presentRewardAmount,
  );
  const lateRewardAmount = readOptionalNonNegativeAmount(
    attendanceWindow.lateRewardAmount,
  );
  const currencyCode = normalizeCurrencyCode(
    parseOptionalText(attendanceWindow.currencyCode) ?? "ECO",
  );

  return {
    timezone,
    lateCutoffMinutes,
    presentRewardAmount,
    lateRewardAmount,
    currencyCode,
  };
}

function firstDefined(
  record: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizedPayload(value: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["scan", "player", "data", "payload"] as const) {
    const nested = value[key];
    if (isRecord(nested)) return { ...value, ...nested };
  }
  return value;
}

export async function readStaffAttendanceScanRequestBody(
  request: Request,
): Promise<StaffAttendanceScanRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  const payload = normalizedPayload(value);

  return {
    playerId: parseRequiredText(
      firstDefined(payload, [
        "playerId",
        "studentCode",
        "accessCode",
        "playerCode",
        "scannedCode",
        "scanValue",
        "qrCode",
        "code",
        "value",
        "scan",
      ]),
      "playerId",
      "Player ID is required.",
    ),
    deviceTimezone: parseOptionalText(
      firstDefined(payload, ["deviceTimezone", "timezone", "timeZone"]),
    ),
  };
}
