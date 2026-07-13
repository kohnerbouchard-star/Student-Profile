import {
  loadAttendance,
  loadPlayers,
} from "./readModels.ts";
import { number, text, todayIsoDate } from "./common.ts";

function validIsoDate(value: unknown, fallback: string): string {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return fallback;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ? fallback
    : normalized;
}

function periodRange(url: URL): { startDate: string; endDate: string } {
  const today = todayIsoDate();
  const selected = validIsoDate(url.searchParams.get("date"), today);
  const period = text(url.searchParams.get("period"), "day").toLowerCase();
  let startDate = validIsoDate(
    url.searchParams.get("startDate") || url.searchParams.get("from"),
    selected,
  );
  let endDate = validIsoDate(
    url.searchParams.get("endDate") || url.searchParams.get("to"),
    selected,
  );
  if (
    !url.searchParams.get("startDate") && !url.searchParams.get("from") &&
    !url.searchParams.get("endDate") && !url.searchParams.get("to")
  ) {
    const start = new Date(`${selected}T00:00:00.000Z`);
    if (period === "week") {
      const day = start.getUTCDay();
      start.setUTCDate(start.getUTCDate() - ((day + 6) % 7));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      startDate = start.toISOString().slice(0, 10);
      endDate = end.toISOString().slice(0, 10);
    } else if (period === "month") {
      start.setUTCDate(1);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      startDate = start.toISOString().slice(0, 10);
      endDate = end.toISOString().slice(0, 10);
    }
  }
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  return { startDate, endDate };
}

async function attendanceRewards(
  service: any,
  gameId: string,
  attendanceIds: string[],
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!attendanceIds.length) return map;
  const result = await service
    .from("ledger_entries")
    .select("id,player_id,amount,currency_code,source_id,source_action,created_at")
    .eq("game_session_id", gameId)
    .eq("source_domain", "attendance")
    .in("source_id", attendanceIds)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  for (const row of result.data || []) {
    const key = String(row.source_id || "");
    if (!key) continue;
    const current = map.get(key) || {
      amount: 0,
      currency_code: row.currency_code,
      entries: [],
    };
    current.amount += number(row.amount);
    current.entries.push(row);
    map.set(key, current);
  }
  return map;
}

export async function loadPlayersEnhanced(
  service: any,
  gameId: string,
): Promise<any[]> {
  const players = await loadPlayers(service, gameId);
  const [flagsResult, settingsResult] = await Promise.all([
    service.from("player_admin_flags").select("*")
      .eq("game_session_id", gameId)
      .order("created_at", { ascending: false }),
    service.from("player_admin_settings").select("*")
      .eq("game_session_id", gameId),
  ]);
  if (flagsResult.error) throw flagsResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const flagsByPlayer = new Map<string, any[]>();
  for (const flag of flagsResult.data || []) {
    const key = String(flag.player_id);
    const rows = flagsByPlayer.get(key) || [];
    rows.push(flag);
    flagsByPlayer.set(key, rows);
  }
  const settingsByPlayer = new Map<string, any>(
    (settingsResult.data || []).map((row: any) => [String(row.player_id), row]),
  );

  return players.map((player) => {
    const flags = flagsByPlayer.get(String(player.id)) || [];
    const activeFlags = flags.filter((flag) => flag.status === "open");
    return {
      ...player,
      flags,
      activeFlags,
      flagged: activeFlags.length > 0,
      flagCount: activeFlags.length,
      adminSettings:
        settingsByPlayer.get(String(player.id))?.settings || {},
    };
  });
}

export async function loadAttendanceEnhanced(
  service: any,
  gameId: string,
  players: any[],
  date = todayIsoDate(),
): Promise<any> {
  const base = await loadAttendance(service, gameId, players, date);
  const [recordsResult, lockResult] = await Promise.all([
    service.from("player_attendance_records")
      .select("id,player_id,attendance_date,status,clocked_in_at,source,note,corrected_by_staff_user_id,corrected_at,created_at,updated_at")
      .eq("game_session_id", gameId)
      .eq("attendance_date", date),
    service.from("attendance_day_locks")
      .select("*")
      .eq("game_session_id", gameId)
      .eq("attendance_date", date)
      .maybeSingle(),
  ]);
  if (recordsResult.error) throw recordsResult.error;
  if (lockResult.error) throw lockResult.error;

  const recordsByPlayer = new Map<string, any>(
    (recordsResult.data || []).map((row: any) => [String(row.player_id), row]),
  );
  const attendance = (base.attendance || []).map((row: any) => {
    const record = recordsByPlayer.get(String(row.playerId));
    return {
      ...row,
      status: record?.status || row.status,
      clockedInAt: record?.clocked_in_at || null,
      scannedAt: record?.clocked_in_at || null,
      source: record?.source || row.source,
      note: record?.note || null,
      correctedByStaffUserId: record?.corrected_by_staff_user_id || null,
      correctedAt: record?.corrected_at || null,
    };
  });
  const counts = {
    present: attendance.filter((row: any) => row.status === "present").length,
    late: attendance.filter((row: any) => row.status === "late").length,
    absent: attendance.filter((row: any) => row.status === "absent").length,
    excused: attendance.filter((row: any) => row.status === "excused").length,
    total: attendance.length,
  };
  const scannedCount = counts.present + counts.late;
  return {
    ...base,
    attendance,
    attendanceRows: attendance,
    attendanceSummary: {
      ...(base.attendanceSummary || {}),
      presentCount: counts.present,
      lateCount: counts.late,
      absentCount: counts.absent,
      excusedCount: counts.excused,
      scannedCount,
      missingCount: counts.absent + counts.excused,
    },
    attendanceCounts: counts,
    attendanceStatusCounts: counts,
    attendanceLock: lockResult.data || null,
    attendanceLocked: lockResult.data?.status === "locked",
  };
}

export async function loadAttendanceHistoryEnhanced(
  service: any,
  gameId: string,
  players: any[],
  url: URL,
): Promise<any> {
  const { startDate, endDate } = periodRange(url);
  const playerId = text(url.searchParams.get("playerId"));
  const status = text(url.searchParams.get("status")).toLowerCase();
  const search = text(url.searchParams.get("search")).toLowerCase();
  const page = Math.max(1, Math.trunc(number(url.searchParams.get("page"), 1)));
  const pageSize = Math.max(
    1,
    Math.min(
      200,
      Math.trunc(number(
        url.searchParams.get("pageSize") || url.searchParams.get("limit"),
        50,
      )),
    ),
  );

  let query = service.from("player_attendance_records")
    .select("id,player_id,attendance_date,status,clocked_in_at,source,note,corrected_by_staff_user_id,corrected_at,created_at,updated_at")
    .eq("game_session_id", gameId)
    .gte("attendance_date", startDate)
    .lte("attendance_date", endDate)
    .order("attendance_date", { ascending: false })
    .order("clocked_in_at", { ascending: false });
  if (playerId) query = query.eq("player_id", playerId);
  if (["present", "late", "absent", "excused"].includes(status)) {
    query = query.eq("status", status);
  }
  const result = await query;
  if (result.error) throw result.error;

  const playersById = new Map<string, any>(
    players.map((player) => [String(player.id), player]),
  );
  let records = result.data || [];
  if (search) {
    records = records.filter((record: any) => {
      const player = playersById.get(String(record.player_id));
      return [
        player?.displayName,
        player?.rosterLabel,
        player?.countryName,
        record.status,
        record.note,
      ].some((value) => String(value || "").toLowerCase().includes(search));
    });
  }
  const total = records.length;
  const from = (page - 1) * pageSize;
  const pageRecords = records.slice(from, from + pageSize);
  const rewards = await attendanceRewards(
    service,
    gameId,
    pageRecords.map((row: any) => String(row.id)),
  );
  const rows = pageRecords.map((record: any) => {
    const player = playersById.get(String(record.player_id));
    const reward = rewards.get(String(record.id));
    return {
      id: record.id,
      attendanceId: record.id,
      playerId: record.player_id,
      displayName: player?.displayName || "Unknown player",
      rosterLabel: player?.rosterLabel || null,
      countryName: player?.countryName || "Unassigned",
      attendanceDate: record.attendance_date,
      status: record.status,
      clockedInAt: record.clocked_in_at,
      scannedAt: record.clocked_in_at,
      source: record.source,
      note: record.note || null,
      correctedByStaffUserId: record.corrected_by_staff_user_id || null,
      correctedAt: record.corrected_at || null,
      rewardAmount: number(reward?.amount),
      rewardCurrencyCode: reward?.currency_code || player?.currencyCode || "ECO",
      rewardEntries: reward?.entries || [],
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  });
  return {
    attendanceHistory: rows,
    attendance: rows,
    attendanceRows: rows,
    records: rows,
    rows,
    total,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNextPage: from + pageSize < total,
      hasPreviousPage: page > 1,
    },
    filters: {
      startDate,
      endDate,
      playerId: playerId || null,
      status: status || null,
      search: search || null,
    },
  };
}

function csvCell(value: unknown): string {
  const normalized = value == null ? "" : String(value);
  return /[",\n\r]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
}

export function attendanceRowsToCsv(rows: any[]): string {
  const columns = [
    ["attendanceDate", "Attendance Date"],
    ["displayName", "Player"],
    ["rosterLabel", "Roster Label"],
    ["status", "Status"],
    ["clockedInAt", "Clocked In At"],
    ["source", "Source"],
    ["note", "Note"],
    ["rewardAmount", "Reward Amount"],
    ["rewardCurrencyCode", "Reward Currency"],
    ["correctedAt", "Corrected At"],
  ];
  return [
    columns.map(([, label]) => csvCell(label)).join(","),
    ...rows.map((row) =>
      columns.map(([key]) => csvCell(row?.[key])).join(",")
    ),
  ].join("\n");
}
