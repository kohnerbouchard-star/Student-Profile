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
    const code = currencyCode(row.currency_code);
    if (!key || !code) continue;
    const current = map.get(key) || {
      amountsByCurrency: {},
      entries: [],
    };
    current.amountsByCurrency[code] = number(
      current.amountsByCurrency[code],
    ) + number(row.amount);
    current.entries.push(row);
    map.set(key, current);
  }
  return map;
}

function currencyCode(value: unknown): string {
  const normalized = text(value).toUpperCase();
  return /^[A-Z0-9]{3,16}$/.test(normalized) ? normalized : "";
}

function attendanceRewardSummary(reward: any): Record<string, any> {
  const source = reward?.amountsByCurrency &&
      typeof reward.amountsByCurrency === "object" &&
      !Array.isArray(reward.amountsByCurrency)
    ? reward.amountsByCurrency
    : {};
  const amountsByCurrency = Object.fromEntries(
    Object.entries(source)
      .map(([code, amount]) => [currencyCode(code), number(amount)] as const)
      .filter(([code]) => Boolean(code)),
  );
  const currencies = Object.keys(amountsByCurrency).sort();
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;
  const singleAmount = singleCurrency
    ? number(amountsByCurrency[singleCurrency])
    : null;
  return {
    rewardAmount: singleAmount,
    rewardCurrencyCode: singleCurrency,
    rewardAmountsByCurrency: amountsByCurrency,
    rewardValuationStatus: currencies.length === 0
      ? "none"
      : currencies.length === 1
      ? "single_currency"
      : "multi_currency_unconverted",
    rewardBreakdown: currencies
      .map((code) => `${code} ${number(amountsByCurrency[code]).toFixed(2)}`)
      .join("; "),
    rewardEntries: reward?.entries || [],
  };
}

function resolveValuationCurrency(
  player: any,
  authoritativeCountryCurrency: string,
): string {
  if (authoritativeCountryCurrency) return authoritativeCountryCurrency;
  const currencies = [...new Set(
    (Array.isArray(player?.balances) ? player.balances : [])
      .filter((entry: any) =>
        ["checking", "savings"].includes(text(entry?.accountType).toLowerCase())
      )
      .map((entry: any) => currencyCode(entry?.currencyCode))
      .filter(Boolean),
  )];
  return currencies.length === 1 ? String(currencies[0] || "") : "";
}

function balanceTotal(
  player: any,
  accountType: string,
  valuationCurrencyCode: string,
): number {
  if (!valuationCurrencyCode) return 0;
  return (Array.isArray(player?.balances) ? player.balances : [])
    .filter((entry: any) =>
      text(entry?.accountType).toLowerCase() === accountType &&
      currencyCode(entry?.currencyCode) === valuationCurrencyCode
    )
    .reduce((sum: number, entry: any) => sum + number(entry?.balance), 0);
}

function currencyScopedPlayerWealth(
  player: any,
  authoritativeCountryCurrency: string,
  storeCurrencyById: ReadonlyMap<string, string>,
): any {
  const valuationCurrencyCode = resolveValuationCurrency(
    player,
    authoritativeCountryCurrency,
  );
  const checkingBalance = balanceTotal(
    player,
    "checking",
    valuationCurrencyCode,
  );
  const savingsBalance = balanceTotal(
    player,
    "savings",
    valuationCurrencyCode,
  );
  const inventoryPositions = Array.isArray(player?.inventoryPositions)
    ? player.inventoryPositions
    : [];
  let inventoryMarketValue = 0;
  let excludedInventoryMarketValue = 0;
  for (const position of inventoryPositions) {
    const positionValue = number(position?.marketValue);
    const itemCurrencyCode = storeCurrencyById.get(String(position?.storeItemId || "")) || "";
    if (
      valuationCurrencyCode &&
      itemCurrencyCode === valuationCurrencyCode
    ) {
      inventoryMarketValue += positionValue;
    } else if (positionValue !== 0) {
      excludedInventoryMarketValue += positionValue;
    }
  }
  const rawStockMarketValue = number(player?.stockMarketValue);
  const stockMarketValue = valuationCurrencyCode === "ECO"
    ? rawStockMarketValue
    : 0;
  const excludedStockMarketValue = stockMarketValue === rawStockMarketValue
    ? 0
    : rawStockMarketValue;
  const depositBalance = checkingBalance + savingsBalance;
  const netWorth = depositBalance + stockMarketValue + inventoryMarketValue;

  return {
    ...player,
    balance: checkingBalance,
    cashBalance: checkingBalance,
    checkingBalance,
    savingsBalance,
    currencyCode: valuationCurrencyCode || null,
    stockMarketValue,
    inventoryMarketValue,
    netWorth,
    netWorthBreakdown: {
      cash: depositBalance,
      stocks: stockMarketValue,
      inventory: inventoryMarketValue,
    },
    netWorthValuation: {
      currencyCode: valuationCurrencyCode || null,
      status:
        valuationCurrencyCode &&
          excludedInventoryMarketValue === 0 &&
          excludedStockMarketValue === 0
          ? "complete"
          : "partial_unconverted",
      excludedInventoryMarketValue,
      excludedStockMarketValue,
    },
  };
}

export async function loadPlayersEnhanced(
  service: any,
  gameId: string,
): Promise<any[]> {
  const players = await loadPlayers(service, gameId);
  const [
    flagsResult,
    settingsResult,
    assignmentsResult,
    countriesResult,
    storeItemsResult,
  ] = await Promise.all([
    service.from("player_admin_flags").select("*")
      .eq("game_session_id", gameId)
      .order("created_at", { ascending: false }),
    service.from("player_admin_settings").select("*")
      .eq("game_session_id", gameId),
    service.from("player_country_assignments")
      .select("player_id,country_profile_id,status,assigned_at")
      .eq("game_session_id", gameId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false }),
    service.from("country_profiles")
      .select("id,currency_code,status")
      .eq("status", "active"),
    service.from("store_items")
      .select("id,currency_code")
      .eq("game_session_id", gameId),
  ]);
  const error = flagsResult.error || settingsResult.error ||
    assignmentsResult.error || countriesResult.error || storeItemsResult.error;
  if (error) throw error;

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
  const countryCurrencyById = new Map<string, string>(
    (countriesResult.data || []).map((row: any) => [
      String(row.id),
      currencyCode(row.currency_code),
    ]),
  );
  const countryCurrencyByPlayer = new Map<string, string>();
  for (const assignment of assignmentsResult.data || []) {
    const playerId = String(assignment.player_id || "");
    if (!playerId || countryCurrencyByPlayer.has(playerId)) continue;
    countryCurrencyByPlayer.set(
      playerId,
      countryCurrencyById.get(String(assignment.country_profile_id)) || "",
    );
  }
  const storeCurrencyById = new Map<string, string>(
    (storeItemsResult.data || []).map((row: any) => [
      String(row.id),
      currencyCode(row.currency_code),
    ]),
  );

  return players.map((rawPlayer) => {
    const player = currencyScopedPlayerWealth(
      rawPlayer,
      countryCurrencyByPlayer.get(String(rawPlayer.id)) || "",
      storeCurrencyById,
    );
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
    const reward = attendanceRewardSummary(rewards.get(String(record.id)));
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
      ...reward,
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
    ["rewardValuationStatus", "Reward Valuation Status"],
    ["rewardBreakdown", "Reward Breakdown"],
    ["correctedAt", "Corrected At"],
  ];
  return [
    columns.map(([, label]) => csvCell(label)).join(","),
    ...rows.map((row) =>
      columns.map(([key]) => csvCell(row?.[key])).join(",")
    ),
  ].join("\n");
}
