function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isoDate(value: unknown): string {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
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

async function audit(
  service: any,
  input: {
    gameSessionId: string;
    staffUserId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, any>;
  },
): Promise<void> {
  const result = await service.from("audit_log").insert({
    game_session_id: input.gameSessionId,
    actor_type: "staff_user",
    actor_id: input.staffUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId || null,
    metadata: input.metadata || {},
  });
  if (result.error) throw result.error;
}

async function findPlayer(
  service: any,
  gameSessionId: string,
  playerId: string,
): Promise<any> {
  const result = await service
    .from("players")
    .select("id,display_name,roster_label,status")
    .eq("game_session_id", gameSessionId)
    .eq("id", playerId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function attendanceLock(
  service: any,
  gameSessionId: string,
  attendanceDate: string,
): Promise<any> {
  const result = await service
    .from("attendance_day_locks")
    .select("id,status,reason,locked_at,unlocked_at,locked_by_staff_user_id")
    .eq("game_session_id", gameSessionId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function ensureAttendanceOpen(
  service: any,
  gameSessionId: string,
  attendanceDate: string,
): Promise<any | null> {
  const lock = await attendanceLock(service, gameSessionId, attendanceDate);
  return lock?.status === "locked" ? lock : null;
}

function lockedResponse(lock: any): any {
  return {
    handled: true,
    status: 423,
    body: {
      code: "attendance_period_locked",
      message:
        "Attendance for that date is locked. Unlock it before making changes.",
      data: { lock },
    },
  };
}

async function correctAttendance(service: any, input: any): Promise<any> {
  const body = object(input.body);
  const playerId = text(body.playerId || body.studentId || body.id);
  const attendanceDate =
    isoDate(body.attendanceDate || body.date || body.recordDate) ||
    todaySeoul();
  const rawStatus = text(
    body.status || body.attendanceStatus || body.value || body.action,
  ).toLowerCase();
  const statusAliases: Record<string, string> = {
    present: "present",
    late: "late",
    absent: "absent",
    excused: "excused",
    "mark-present": "present",
    "mark-late": "late",
    "mark-absent": "absent",
    "mark-excused": "excused",
  };
  const status = statusAliases[rawStatus] || rawStatus;
  if (!playerId || !["present", "late", "absent", "excused"].includes(status)) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "invalid_attendance_correction",
        message: "A player and a valid attendance status are required.",
      },
    };
  }

  const player = await findPlayer(service, input.gameSessionId, playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "player_not_found",
        message: "Player was not found for this game.",
      },
    };
  }

  const lock = await ensureAttendanceOpen(
    service,
    input.gameSessionId,
    attendanceDate,
  );
  if (lock) return lockedResponse(lock);

  const now = new Date().toISOString();
  const note = text(body.note || body.adminNote || body.reason) || null;
  const clockedInAt = ["present", "late"].includes(status)
    ? text(body.clockedInAt || body.scannedAt) || now
    : null;
  const result = await service
    .from("player_attendance_records")
    .upsert({
      game_session_id: input.gameSessionId,
      player_id: playerId,
      attendance_date: attendanceDate,
      status,
      clocked_in_at: clockedInAt,
      source: "staff_correction",
      note,
      corrected_by_staff_user_id: input.staffUserId,
      corrected_at: now,
      updated_at: now,
    }, { onConflict: "game_session_id,player_id,attendance_date" })
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;

  await audit(service, {
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    action: "attendance.manual_correction",
    targetType: "player_attendance_record",
    targetId: result.data?.id,
    metadata: { playerId, attendanceDate, status, note },
  });

  return {
    handled: true,
    status: 200,
    body: { data: { corrected: true, attendance: result.data } },
  };
}

async function addAttendanceNote(service: any, input: any): Promise<any> {
  const body = object(input.body);
  const playerId = text(body.playerId || body.studentId || body.id);
  const attendanceDate =
    isoDate(body.attendanceDate || body.date || body.recordDate) ||
    todaySeoul();
  const note = text(body.note || body.adminNote || body.message);
  if (!playerId || !note) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "attendance_note_required",
        message: "A player and note are required.",
      },
    };
  }
  const player = await findPlayer(service, input.gameSessionId, playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "player_not_found",
        message: "Player was not found for this game.",
      },
    };
  }
  const lock = await ensureAttendanceOpen(
    service,
    input.gameSessionId,
    attendanceDate,
  );
  if (lock) return lockedResponse(lock);

  const now = new Date().toISOString();
  const existing = await service
    .from("player_attendance_records")
    .select("*")
    .eq("game_session_id", input.gameSessionId)
    .eq("player_id", playerId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const result = existing.data
    ? await service
      .from("player_attendance_records")
      .update({
        note,
        corrected_by_staff_user_id: input.staffUserId,
        corrected_at: now,
        updated_at: now,
      })
      .eq("id", existing.data.id)
      .select("*")
      .maybeSingle()
    : await service
      .from("player_attendance_records")
      .insert({
        game_session_id: input.gameSessionId,
        player_id: playerId,
        attendance_date: attendanceDate,
        status: "absent",
        clocked_in_at: null,
        source: "staff_note",
        note,
        corrected_by_staff_user_id: input.staffUserId,
        corrected_at: now,
      })
      .select("*")
      .maybeSingle();
  if (result.error) throw result.error;

  await audit(service, {
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    action: "attendance.note_added",
    targetType: "player_attendance_record",
    targetId: result.data?.id,
    metadata: { playerId, attendanceDate },
  });

  return {
    handled: true,
    status: 200,
    body: { data: { saved: true, attendance: result.data } },
  };
}

async function adjustAttendanceReward(service: any, input: any): Promise<any> {
  const body = object(input.body);
  const playerId = text(body.playerId || body.studentId || body.id);
  const attendanceDate =
    isoDate(body.attendanceDate || body.date || body.recordDate) ||
    todaySeoul();
  let amount = number(body.amount ?? body.value, Number.NaN);
  const adjustmentType = text(body.adjustmentType || body.entryType)
    .toLowerCase();
  if (adjustmentType === "debit" && amount > 0) amount = -amount;
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
  const player = await findPlayer(service, input.gameSessionId, playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "player_not_found",
        message: "Player was not found for this game.",
      },
    };
  }
  const lock = await ensureAttendanceOpen(
    service,
    input.gameSessionId,
    attendanceDate,
  );
  if (lock) return lockedResponse(lock);

  const attendance = await service
    .from("player_attendance_records")
    .select("id,status")
    .eq("game_session_id", input.gameSessionId)
    .eq("player_id", playerId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (attendance.error) throw attendance.error;

  const rpc = await service.rpc("record_player_ledger_entry", {
    p_game_session_id: input.gameSessionId,
    p_player_id: playerId,
    p_account_type: text(body.accountType, "cash"),
    p_amount: amount,
    p_currency_code: text(body.currencyCode || body.currency, "ECO")
      .toUpperCase(),
    p_entry_type: amount > 0 ? "credit" : "debit",
    p_source_domain: "attendance",
    p_source_action: "staff_reward_adjustment",
    p_source_id: attendance.data?.id || null,
    p_created_by_type: "staff_user",
    p_created_by_id: input.staffUserId,
    p_audit_metadata: {
      attendanceDate,
      attendanceStatus: attendance.data?.status || "missing",
      note: text(body.note || body.ledgerNote || body.reason) || null,
    },
  });
  if (rpc.error) throw rpc.error;

  return {
    handled: true,
    status: 200,
    body: {
      data: {
        adjusted: true,
        playerId,
        attendanceDate,
        amount,
        ledger: Array.isArray(rpc.data) ? rpc.data[0] : rpc.data,
      },
    },
  };
}

async function setAttendanceLock(service: any, input: any): Promise<any> {
  const body = object(input.body);
  const attendanceDate =
    isoDate(body.attendanceDate || body.date || body.recordDate) ||
    todaySeoul();
  const shouldUnlock = body.locked === false || body.unlock === true ||
    text(body.status).toLowerCase() === "unlocked";
  const now = new Date().toISOString();
  const status = shouldUnlock ? "unlocked" : "locked";
  const reason = text(body.reason || body.note) || null;
  const existing = await attendanceLock(
    service,
    input.gameSessionId,
    attendanceDate,
  );
  const result = await service
    .from("attendance_day_locks")
    .upsert({
      game_session_id: input.gameSessionId,
      attendance_date: attendanceDate,
      locked_by_staff_user_id: input.staffUserId,
      status,
      reason,
      locked_at: shouldUnlock ? existing?.locked_at || now : now,
      unlocked_at: shouldUnlock ? now : null,
    }, { onConflict: "game_session_id,attendance_date" })
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;

  await audit(service, {
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    action: shouldUnlock
      ? "attendance.period_unlocked"
      : "attendance.period_locked",
    targetType: "attendance_day_lock",
    targetId: result.data?.id,
    metadata: { attendanceDate, reason },
  });

  return {
    handled: true,
    status: 200,
    body: { data: { locked: !shouldUnlock, lock: result.data } },
  };
}

export async function handleAttendanceOperation(
  service: any,
  input: {
    gameSessionId: string;
    staffUserId: string;
    path: string;
    method: string;
    body: Record<string, any>;
  },
): Promise<any> {
  if (
    input.method === "POST" &&
    /^\/games\/[^/]+\/attendance\/corrections$/.test(input.path)
  ) {
    return correctAttendance(service, input);
  }
  if (
    input.method === "POST" &&
    /^\/games\/[^/]+\/attendance\/notes$/.test(input.path)
  ) {
    return addAttendanceNote(service, input);
  }
  if (
    input.method === "POST" &&
    /^\/games\/[^/]+\/attendance\/reward-adjustments$/.test(input.path)
  ) {
    return adjustAttendanceReward(service, input);
  }
  if (
    input.method === "POST" &&
    /^\/games\/[^/]+\/attendance\/lock$/.test(input.path)
  ) {
    return setAttendanceLock(service, input);
  }
  return { handled: false };
}
