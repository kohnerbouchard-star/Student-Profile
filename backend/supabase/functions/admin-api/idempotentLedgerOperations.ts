import {
  IdempotentStaffLedgerAdjustmentError,
  recordIdempotentStaffLedgerAdjustment,
} from "../../../src/domains/economy/services/idempotentStaffLedgerAdjustment.ts";

function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoDate(value: unknown): string {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? ""
    : normalized;
}

function todaySeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function findPlayer(service: any, gameSessionId: string, playerId: string) {
  const result = await service.from("players")
    .select("id,display_name,roster_label,status")
    .eq("game_session_id", gameSessionId)
    .eq("id", playerId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function readAttendanceLock(service: any, gameSessionId: string, attendanceDate: string) {
  const result = await service.from("attendance_day_locks")
    .select("id,status,reason")
    .eq("game_session_id", gameSessionId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function readAmount(body: Record<string, any>): number {
  let amount = number(body.amount ?? body.value, Number.NaN);
  const adjustmentType = text(body.adjustmentType || body.entryType).toLowerCase();
  if (adjustmentType === "debit" && amount > 0) amount = -amount;
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : Number.NaN;
}

function errorResponse(error: unknown) {
  if (error instanceof IdempotentStaffLedgerAdjustmentError) {
    return {
      handled: true,
      status: error.status,
      body: { code: error.code, message: error.message },
    };
  }
  throw error;
}

async function adjustAttendanceReward(service: any, input: any) {
  const body = input.body || {};
  const playerId = text(body.playerId || body.studentId || body.id);
  const attendanceDate = isoDate(body.attendanceDate || body.date || body.recordDate) || todaySeoul();
  const amount = readAmount(body);
  const idempotencyKey = text(body.idempotencyKey);
  if (!playerId || !Number.isFinite(amount) || amount === 0) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "invalid_attendance_reward_adjustment",
        message: "A player and non-zero adjustment amount are required.",
      },
    };
  }
  if (!idempotencyKey) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "ledger_idempotency_key_required",
        message: "An idempotency key is required for attendance reward adjustments.",
      },
    };
  }

  const player = await findPlayer(service, input.gameSessionId, playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: { code: "player_not_found", message: "Player was not found for this game." },
    };
  }
  if (player.status !== "active") {
    return {
      handled: true,
      status: 409,
      body: { code: "player_not_active", message: "Only active players can receive ledger adjustments." },
    };
  }

  const lock = await readAttendanceLock(service, input.gameSessionId, attendanceDate);
  if (lock?.status === "locked") {
    return {
      handled: true,
      status: 423,
      body: {
        code: "attendance_period_locked",
        message: "Attendance for that date is locked. Unlock it before making changes.",
        data: { lock },
      },
    };
  }

  const attendance = await service.from("player_attendance_records")
    .select("id,status")
    .eq("game_session_id", input.gameSessionId)
    .eq("player_id", playerId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (attendance.error) throw attendance.error;

  try {
    const ledger = await recordIdempotentStaffLedgerAdjustment(service, {
      gameSessionId: input.gameSessionId,
      playerId,
      staffUserId: input.staffUserId,
      routeKey: "admin.attendance.reward_adjustment",
      idempotencyKey,
      accountType: text(body.accountType, "cash"),
      amount,
      currencyCode: text(body.currencyCode || body.currency, "ECO").toUpperCase(),
      entryType: amount > 0 ? "credit" : "debit",
      sourceDomain: "attendance",
      sourceAction: "staff_reward_adjustment",
      sourceId: attendance.data?.id || null,
      auditMetadata: {
        attendanceDate,
        attendanceStatus: attendance.data?.status || "missing",
        note: text(body.note || body.ledgerNote || body.reason) || null,
      },
    });
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          adjusted: true,
          outcome: ledger.outcome,
          playerId,
          attendanceDate,
          amount,
          ledger,
        },
      },
    };
  } catch (error) {
    return errorResponse(error);
  }
}

async function adjustPlayerLedger(service: any, input: any, playerId: string) {
  const body = input.body || {};
  const amount = readAmount(body);
  const idempotencyKey = text(body.idempotencyKey);
  if (!Number.isFinite(amount) || amount === 0) {
    return {
      handled: true,
      status: 400,
      body: { code: "ledger_amount_required", message: "A non-zero ledger amount is required." },
    };
  }
  if (!idempotencyKey) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "ledger_idempotency_key_required",
        message: "An idempotency key is required for player ledger adjustments.",
      },
    };
  }

  const player = await findPlayer(service, input.gameSessionId, playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: { code: "player_not_found", message: "Player was not found for this game." },
    };
  }
  if (player.status !== "active") {
    return {
      handled: true,
      status: 409,
      body: { code: "player_not_active", message: "Only active players can receive ledger adjustments." },
    };
  }

  try {
    const ledger = await recordIdempotentStaffLedgerAdjustment(service, {
      gameSessionId: input.gameSessionId,
      playerId,
      staffUserId: input.staffUserId,
      routeKey: "admin.players.ledger_adjustment",
      idempotencyKey,
      accountType: text(body.accountType, "cash"),
      amount,
      currencyCode: text(body.currencyCode || body.currency, "ECO").toUpperCase(),
      entryType: amount > 0 ? "credit" : "debit",
      sourceDomain: "players",
      sourceAction: "staff_player_balance_adjustment",
      sourceId: null,
      auditMetadata: {
        note: text(body.note || body.ledgerNote || body.reason) || null,
        effectiveDate: isoDate(body.effectiveDate) || null,
      },
    });
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          adjusted: true,
          outcome: ledger.outcome,
          playerId,
          amount,
          ledger,
        },
      },
    };
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleIdempotentLedgerOperation(service: any, input: any) {
  if (input.method !== "POST") return { handled: false };
  if (/^\/games\/[^/]+\/attendance\/reward-adjustments$/.test(input.path)) {
    return adjustAttendanceReward(service, input);
  }
  const playerMatch = input.path.match(/^\/games\/[^/]+\/players\/([^/]+)\/ledger-adjustments$/);
  if (playerMatch) {
    return adjustPlayerLedger(service, input, decodeURIComponent(playerMatch[1]));
  }
  return { handled: false };
}
