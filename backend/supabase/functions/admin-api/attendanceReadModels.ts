import { number, object, text, todayIsoDate } from "./common.ts";
import {
  type DbService,
  type DbRow,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
} from "./playerReadSupport.ts";


export function dateRangeUtc(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}


export async function loadAttendanceRewards(
  service: DbService,
  gameId: string,
  attendanceIds: string[],
  date: string,
): Promise<DbRow[]> {
  if (!attendanceIds.length) return [];
  const range = dateRangeUtc(date);
  const result = await service
    .from("ledger_entries")
    .select("id,player_id,amount,currency_code,entry_type,source_domain,source_action,source_id,created_at")
    .eq("game_session_id", gameId)
    .eq("source_domain", "attendance")
    .eq("source_action", "player_clock_in_reward")
    .in("source_id", attendanceIds)
    .gte("created_at", range.start)
    .lt("created_at", range.end)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}


export async function loadAttendance(
  service: DbService,
  gameId: string,
  players: any[],
  date = todayIsoDate(),
): Promise<any> {
  const result = await service
    .from("player_attendance_records")
    .select("id,player_id,attendance_date,status,clocked_in_at,source,created_at,updated_at")
    .eq("game_session_id", gameId)
    .eq("attendance_date", date)
    .order("clocked_in_at", { ascending: true });
  if (result.error) throw result.error;

  const records: DbRow[] = result.data || [];
  const rewards = await loadAttendanceRewards(
    service,
    gameId,
    records.map((row) => String(row.id)),
    date,
  );
  const rewardsByAttendance = new Map<string, DbRow>(
    rewards.map((row) => [String(row.source_id), row]),
  );
  const playersById = new Map<string, any>(
    players.map((player) => [String(player.id), player]),
  );
  const recordsByPlayer = new Map<string, DbRow>(
    records.map((row) => [String(row.player_id), row]),
  );

  const attendance = players.map((player) => {
    const record = recordsByPlayer.get(String(player.id));
    const reward = record
      ? rewardsByAttendance.get(String(record.id))
      : null;
    return {
      id: record?.id || `missing:${player.id}:${date}`,
      playerId: player.id,
      player: {
        id: player.id,
        displayName: player.displayName,
        rosterLabel: player.rosterLabel,
        status: player.status,
      },
      displayName: player.displayName,
      name: player.displayName,
      rosterLabel: player.rosterLabel,
      attendanceDate: date,
      status: record?.status || "absent",
      clockedInAt: record?.clocked_in_at || null,
      scannedAt: record?.clocked_in_at || null,
      source: record?.source || "not_scanned",
      rewardAmount: number(reward?.amount),
      rewardCurrencyCode: reward?.currency_code || player.currencyCode || "ECO",
      rewardLedgerEntryId: reward?.id || null,
    };
  });

  const attendanceLedger = rewards.map((reward) => {
    const record = records.find((item) => item.id === reward.source_id);
    const player = playersById.get(String(reward.player_id));
    return {
      id: reward.id,
      ledgerEntryId: reward.id,
      attendanceId: reward.source_id,
      playerId: reward.player_id,
      displayName: player?.displayName || "Unknown player",
      attendanceDate: record?.attendance_date || date,
      amount: number(reward.amount),
      currencyCode: reward.currency_code,
      createdAt: reward.created_at,
    };
  });

  const presentCount = attendance.filter((row) => row.status === "present").length;
  const lateCount = attendance.filter((row) => row.status === "late").length;
  const absentCount = attendance.filter((row) => row.status === "absent").length;
  const rewardsTotal = attendanceLedger.reduce(
    (sum, row) => sum + number(row.amount),
    0,
  );

  return {
    attendance,
    attendanceRows: attendance,
    attendanceLedger,
    attendanceRewards: attendanceLedger,
    attendanceSummary: {
      presentCount,
      lateCount,
      absentCount,
      scannedCount: presentCount + lateCount,
      missingCount: absentCount,
      activePlayerCount: players.length,
      rewardsIssuedCount: attendanceLedger.length,
      rewardsIssuedTotal: rewardsTotal,
    },
    attendanceCounts: {
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      total: players.length,
    },
    attendanceStatusCounts: {
      present: presentCount,
      late: lateCount,
      absent: absentCount,
    },
    rewardsIssuedToday: attendanceLedger.length,
    rewardsIssuedTodayAmount: rewardsTotal,
    totalPlayers: players.length,
    attendanceDate: date,
  };
}


export function validIsoDate(value: unknown, fallback: string): string {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return fallback;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ? fallback
    : normalized;
}


export async function loadAttendanceHistory(
  service: DbService,
  gameId: string,
  players: any[],
  url: URL,
): Promise<any> {
  const today = todayIsoDate();
  const startDate = validIsoDate(
    url.searchParams.get("startDate") || url.searchParams.get("from"),
    today,
  );
  const endDate = validIsoDate(
    url.searchParams.get("endDate") || url.searchParams.get("to"),
    today,
  );
  const playerId = text(url.searchParams.get("playerId"));
  const status = text(url.searchParams.get("status")).toLowerCase();
  const page = Math.max(1, Math.trunc(number(url.searchParams.get("page"), 1)));
  const requestedPageSize = Math.trunc(
    number(
      url.searchParams.get("pageSize") || url.searchParams.get("limit"),
      DEFAULT_HISTORY_PAGE_SIZE,
    ),
  );
  const pageSize = Math.max(
    1,
    Math.min(MAX_HISTORY_PAGE_SIZE, requestedPageSize),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = service
    .from("player_attendance_records")
    .select(
      "id,player_id,attendance_date,status,clocked_in_at,source,created_at,updated_at",
      { count: "exact" },
    )
    .eq("game_session_id", gameId)
    .gte("attendance_date", startDate)
    .lte("attendance_date", endDate)
    .order("attendance_date", { ascending: false })
    .order("clocked_in_at", { ascending: false })
    .range(from, to);
  if (playerId) query = query.eq("player_id", playerId);
  if (["present", "late", "absent"].includes(status)) {
    query = query.eq("status", status);
  }

  const result = await query;
  if (result.error) throw result.error;
  const records: DbRow[] = result.data || [];
  const playersById = new Map<string, any>(
    players.map((player) => [String(player.id), player]),
  );

  const rewardsById = new Map<string, DbRow>();
  if (records.length) {
    const rewardResult = await service
      .from("ledger_entries")
      .select("id,player_id,amount,currency_code,source_id,created_at")
      .eq("game_session_id", gameId)
      .eq("source_domain", "attendance")
      .eq("source_action", "player_clock_in_reward")
      .in("source_id", records.map((row) => row.id));
    if (rewardResult.error) throw rewardResult.error;
    for (const reward of (rewardResult.data || []) as DbRow[]) {
      rewardsById.set(String(reward.source_id), reward);
    }
  }

  const rows = records.map((record) => {
    const player = playersById.get(String(record.player_id));
    const reward = rewardsById.get(String(record.id));
    return {
      id: record.id,
      attendanceId: record.id,
      playerId: record.player_id,
      displayName: player?.displayName || "Unknown player",
      rosterLabel: player?.rosterLabel || null,
      attendanceDate: record.attendance_date,
      status: record.status,
      clockedInAt: record.clocked_in_at,
      scannedAt: record.clocked_in_at,
      source: record.source,
      rewardAmount: number(reward?.amount),
      rewardCurrencyCode: reward?.currency_code || player?.currencyCode || "ECO",
      rewardLedgerEntryId: reward?.id || null,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  });

  const total = number(result.count, rows.length);
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
      hasNextPage: to + 1 < total,
      hasPreviousPage: page > 1,
    },
    filters: {
      startDate,
      endDate,
      playerId: playerId || null,
      status: status || null,
    },
  };
}
