import { number, object, text, todayIsoDate } from "./common.ts";

type DbRow = Record<string, any>;
type DbService = any;

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const RECENT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 200;

function pushByKey(
  map: Map<string, DbRow[]>,
  key: unknown,
  value: DbRow,
): void {
  const normalizedKey = String(key || "");
  if (!normalizedKey) return;
  const values = map.get(normalizedKey) || [];
  values.push(value);
  map.set(normalizedKey, values);
}

function newestByKey(
  rows: DbRow[],
  keyName: string,
  timestampName: string,
): Map<string, DbRow> {
  const result = new Map<string, DbRow>();
  for (const row of rows || []) {
    const key = String(row?.[keyName] || "");
    if (!key) continue;
    const current = result.get(key);
    if (
      !current ||
      Date.parse(row?.[timestampName] || "") >
        Date.parse(current?.[timestampName] || "")
    ) {
      result.set(key, row);
    }
  }
  return result;
}

function presenceForSession(session: DbRow | null | undefined, nowMs: number): any {
  if (!session || session.status !== "active") {
    return {
      sessionStatus: "offline",
      online: false,
      lastActiveAt: session?.updated_at || null,
    };
  }

  const expiresAtMs = Date.parse(session.expires_at || "");
  const lastActiveMs = Date.parse(session.updated_at || session.created_at || "");
  if (
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= nowMs ||
    !Number.isFinite(lastActiveMs)
  ) {
    return {
      sessionStatus: "offline",
      online: false,
      lastActiveAt: session.updated_at || null,
    };
  }

  const ageMs = Math.max(0, nowMs - lastActiveMs);
  if (ageMs <= ONLINE_WINDOW_MS) {
    return {
      sessionStatus: "online",
      online: true,
      lastActiveAt: session.updated_at || null,
    };
  }
  if (ageMs <= RECENT_WINDOW_MS) {
    return {
      sessionStatus: "recently_active",
      online: false,
      lastActiveAt: session.updated_at || null,
    };
  }
  return {
    sessionStatus: "offline",
    online: false,
    lastActiveAt: session.updated_at || null,
  };
}

export async function loadPlayers(
  service: DbService,
  gameId: string,
  now = new Date(),
): Promise<any[]> {
  const [
    playersResult,
    balancesResult,
    assignmentsResult,
    countriesResult,
    sessionsResult,
    holdingsResult,
    assetsResult,
    inventoryResult,
    storeItemsResult,
  ] = await Promise.all([
    service.from("players")
      .select("id,display_name,roster_label,status,created_at,updated_at")
      .eq("game_session_id", gameId)
      .order("created_at", { ascending: true }),
    service.from("account_balances")
      .select("player_id,account_type,balance,currency_code,updated_at")
      .eq("game_session_id", gameId),
    service.from("player_country_assignments")
      .select("player_id,country_profile_id,status,assigned_at")
      .eq("game_session_id", gameId)
      .eq("status", "active"),
    service.from("country_profiles")
      .select("id,country_code,country_name,currency_code,status"),
    service.from("player_sessions")
      .select("id,player_id,status,created_at,updated_at,expires_at,revoked_at")
      .eq("game_session_id", gameId)
      .order("updated_at", { ascending: false }),
    service.from("stock_holdings")
      .select("player_id,stock_asset_id,ticker,quantity,reserved_quantity,average_cost,realized_pnl,updated_at")
      .eq("game_session_id", gameId),
    service.from("game_session_stock_assets")
      .select("id,ticker,company_name,current_price,is_active,updated_at")
      .eq("game_session_id", gameId),
    service.from("inventory_holdings")
      .select("player_id,store_item_id,quantity_owned,quantity_reserved,updated_at")
      .eq("game_session_id", gameId),
    service.from("store_items")
      .select("id,name,price,currency_code,status,visibility,updated_at")
      .eq("game_session_id", gameId),
  ]);

  const error = playersResult.error || balancesResult.error ||
    assignmentsResult.error || countriesResult.error || sessionsResult.error ||
    holdingsResult.error || assetsResult.error || inventoryResult.error ||
    storeItemsResult.error;
  if (error) throw error;

  const players: DbRow[] = playersResult.data || [];
  const balancesRows: DbRow[] = balancesResult.data || [];
  const assignments: DbRow[] = assignmentsResult.data || [];
  const countriesRows: DbRow[] = countriesResult.data || [];
  const sessions: DbRow[] = sessionsResult.data || [];
  const holdings: DbRow[] = holdingsResult.data || [];
  const assetsRows: DbRow[] = assetsResult.data || [];
  const inventoryRows: DbRow[] = inventoryResult.data || [];
  const storeItemsRows: DbRow[] = storeItemsResult.data || [];

  const balancesByPlayer = new Map<string, DbRow[]>();
  for (const row of balancesRows) pushByKey(balancesByPlayer, row.player_id, row);

  const holdingsByPlayer = new Map<string, DbRow[]>();
  for (const row of holdings) pushByKey(holdingsByPlayer, row.player_id, row);

  const inventoryByPlayer = new Map<string, DbRow[]>();
  for (const row of inventoryRows) pushByKey(inventoryByPlayer, row.player_id, row);

  const countries = new Map<string, DbRow>(
    countriesRows.map((row) => [String(row.id), row]),
  );
  const assignmentByPlayer = new Map<string, DbRow>(
    assignments.map((row) => [String(row.player_id), row]),
  );
  const latestSessionByPlayer = newestByKey(
    sessions,
    "player_id",
    "updated_at",
  );
  const assetsById = new Map<string, DbRow>(
    assetsRows.map((row) => [String(row.id), row]),
  );
  const storeItemsById = new Map<string, DbRow>(
    storeItemsRows.map((row) => [String(row.id), row]),
  );
  const nowMs = now.getTime();

  return players.map((player) => {
    const playerId = String(player.id);
    const rawBalances = balancesByPlayer.get(playerId) || [];
    const balances = rawBalances.map((entry) => ({
      accountType: entry.account_type,
      balance: number(entry.balance),
      currencyCode: entry.currency_code,
      updatedAt: entry.updated_at,
    }));
    const cashBalance = rawBalances
      .filter((entry) => String(entry.account_type).toLowerCase() === "cash")
      .reduce((sum, entry) => sum + number(entry.balance), 0);

    const stockPositions = (holdingsByPlayer.get(playerId) || []).map(
      (holding) => {
        const asset = assetsById.get(String(holding.stock_asset_id));
        const quantity = number(holding.quantity);
        const currentPrice = number(asset?.current_price);
        return {
          stockAssetId: holding.stock_asset_id,
          ticker: holding.ticker || asset?.ticker || "",
          companyName: asset?.company_name || holding.ticker || "Unknown asset",
          quantity,
          reservedQuantity: number(holding.reserved_quantity),
          averageCost: number(holding.average_cost),
          currentPrice,
          marketValue: quantity * currentPrice,
          realizedPnl: number(holding.realized_pnl),
          updatedAt: holding.updated_at,
        };
      },
    );
    const stockMarketValue = stockPositions.reduce(
      (sum, position) => sum + position.marketValue,
      0,
    );

    const inventoryPositions = (inventoryByPlayer.get(playerId) || []).map(
      (holding) => {
        const item = storeItemsById.get(String(holding.store_item_id));
        const quantityOwned = number(holding.quantity_owned);
        const quantityReserved = number(holding.quantity_reserved);
        const availableQuantity = Math.max(0, quantityOwned - quantityReserved);
        const unitValue = number(item?.price);
        return {
          storeItemId: holding.store_item_id,
          itemName: item?.name || "Unknown item",
          quantityOwned,
          quantityReserved,
          availableQuantity,
          unitValue,
          marketValue: availableQuantity * unitValue,
          updatedAt: holding.updated_at,
        };
      },
    );
    const inventoryMarketValue = inventoryPositions.reduce(
      (sum, position) => sum + position.marketValue,
      0,
    );
    const netWorth = cashBalance + stockMarketValue + inventoryMarketValue;

    const assignment = assignmentByPlayer.get(playerId);
    const country = assignment
      ? countries.get(String(assignment.country_profile_id))
      : null;
    const presence = presenceForSession(
      latestSessionByPlayer.get(playerId),
      nowMs,
    );

    return {
      id: player.id,
      playerId: player.id,
      name: player.display_name,
      displayName: player.display_name,
      rosterLabel: player.roster_label,
      status: player.status,
      ...presence,
      balances,
      balance: cashBalance,
      cashBalance,
      stockMarketValue,
      inventoryMarketValue,
      netWorth,
      netWorthBreakdown: {
        cash: cashBalance,
        stocks: stockMarketValue,
        inventory: inventoryMarketValue,
      },
      stockPositions,
      inventoryPositions,
      overallScore: null,
      overallScoreStatus: "not_configured",
      scoreFormulaVersion: null,
      currencyCode: balances.find((entry) =>
        String(entry.accountType).toLowerCase() === "cash"
      )?.currencyCode || country?.currency_code || "ECO",
      countryCode: country?.country_code || "",
      countryName: country?.country_name || "Unassigned",
      location: country?.country_name || "Unassigned",
      createdAt: player.created_at,
      updatedAt: player.updated_at,
    };
  });
}

function dateRangeUtc(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function loadAttendanceRewards(
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

function validIsoDate(value: unknown, fallback: string): string {
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

export async function loadContracts(
  service: DbService,
  gameId: string,
): Promise<any[]> {
  const [contractsResult, progressResult] = await Promise.all([
    service.from("game_session_contracts")
      .select("*")
      .eq("game_session_id", gameId)
      .order("created_at", { ascending: false }),
    service.from("player_contract_progress")
      .select("id,contract_id,player_id,status,submitted_at,completed_at,reward_issued_at,created_at,updated_at")
      .eq("game_session_id", gameId),
  ]);
  if (contractsResult.error || progressResult.error) {
    throw contractsResult.error || progressResult.error;
  }

  const progressByContract = new Map<string, DbRow[]>();
  for (const row of (progressResult.data || []) as DbRow[]) {
    pushByKey(progressByContract, row.contract_id, row);
  }

  return ((contractsResult.data || []) as DbRow[]).map((row) => {
    const progress = progressByContract.get(String(row.id)) || [];
    return {
      id: row.id,
      contractId: row.id,
      key: row.contract_key,
      contractKey: row.contract_key,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      category: row.category,
      status: row.status,
      visibility: row.visibility,
      targeting: row.targeting_payload || {},
      targetingPayload: row.targeting_payload || {},
      requirements: row.requirements_payload || {},
      requirementsPayload: row.requirements_payload || {},
      rewards: row.reward_payload || {},
      rewardPayload: row.reward_payload || {},
      materials: object(row.metadata).materials || [],
      submissionRequirements: object(row.metadata).submissionRequirements || [],
      completionMode: row.completion_mode,
      publishedAt: row.published_at,
      deadlineAt: row.deadline_at,
      expiresAt: row.expires_at,
      progressCount: progress.length,
      submittedCount: progress.filter((item) => item.status === "submitted").length,
      completedCount: progress.filter((item) => item.status === "completed").length,
      rewardIssuedCount: progress.filter((item) => item.reward_issued_at).length,
      metadata: object(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function loadStore(
  service: DbService,
  gameId: string,
): Promise<any[]> {
  const [itemsResult, purchasesResult] = await Promise.all([
    service.from("store_items")
      .select("*")
      .eq("game_session_id", gameId)
      .order("sort_order", { ascending: true }),
    service.from("store_purchases")
      .select("store_item_id,quantity,final_total_price,status,created_at")
      .eq("game_session_id", gameId),
  ]);
  if (itemsResult.error || purchasesResult.error) {
    throw itemsResult.error || purchasesResult.error;
  }

  const stats = new Map<string, {
    purchaseCount: number;
    unitsSold: number;
    revenue: number;
  }>();
  for (const row of (purchasesResult.data || []) as DbRow[]) {
    const key = String(row.store_item_id);
    const current = stats.get(key) || {
      purchaseCount: 0,
      unitsSold: 0,
      revenue: 0,
    };
    current.purchaseCount += 1;
    current.unitsSold += number(row.quantity);
    current.revenue += number(row.final_total_price);
    stats.set(key, current);
  }

  return ((itemsResult.data || []) as DbRow[]).map((row) => ({
    id: row.id,
    storeItemId: row.id,
    itemUuid: row.id,
    key: row.item_key,
    itemKey: row.item_key,
    name: row.name,
    title: row.name,
    description: row.description,
    category: row.category,
    price: number(row.price),
    currencyCode: row.currency_code,
    stockQuantity: row.stock_quantity,
    stock: row.stock_quantity,
    status: row.status,
    visibility: row.visibility,
    sortOrder: row.sort_order,
    purchaseStats: stats.get(String(row.id)) || {
      purchaseCount: 0,
      unitsSold: 0,
      revenue: 0,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function loadMarket(
  service: DbService,
  gameId: string,
): Promise<any> {
  const [assetsResult, tradesResult, eventsResult] = await Promise.all([
    service.from("game_session_stock_assets")
      .select("*")
      .eq("game_session_id", gameId)
      .eq("is_active", true)
      .order("ticker", { ascending: true }),
    service.from("stock_trades")
      .select("*")
      .eq("game_session_id", gameId)
      .order("created_at", { ascending: false })
      .limit(100),
    service.from("stock_market_events")
      .select("*")
      .eq("game_session_id", gameId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (assetsResult.error || tradesResult.error || eventsResult.error) {
    throw assetsResult.error || tradesResult.error || eventsResult.error;
  }

  const assetRows: DbRow[] = assetsResult.data || [];
  const assetsById = new Map<string, DbRow>(
    assetRows.map((row) => [String(row.id), row]),
  );
  const assets = assetRows.map((row) => {
    const currentPrice = number(row.current_price);
    const previousClose = number(row.previous_close, currentPrice);
    const change = currentPrice - previousClose;
    return {
      id: row.id,
      assetId: row.id,
      symbol: row.ticker,
      ticker: row.ticker,
      name: row.company_name,
      companyName: row.company_name,
      type: "stock",
      assetType: "stock",
      sector: row.sector_key,
      countryCode: row.country_code,
      description: row.description,
      price: currentPrice,
      currentPrice,
      previousClose,
      open: number(row.open_price),
      high: number(row.day_high),
      low: number(row.day_low),
      change,
      changePct: previousClose ? (change / previousClose) * 100 : 0,
      marketCap: number(row.market_cap),
      beta: number(row.beta),
      volatility: number(row.current_volatility),
      chartHistory: Array.isArray(row.chart_history) ? row.chart_history : [],
      financials: row.fundamentals || {},
      fundamentals: row.fundamentals || {},
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
  const trades = ((tradesResult.data || []) as DbRow[]).map((row) => ({
    id: row.id,
    tradeId: row.id,
    playerId: row.player_id,
    assetId: row.stock_asset_id,
    symbol: row.ticker,
    ticker: row.ticker,
    side: row.side,
    quantity: number(row.quantity),
    price: number(row.execution_price),
    executionPrice: number(row.execution_price),
    grossValue: number(row.gross_value),
    createdAt: row.created_at,
    assetName: assetsById.get(String(row.stock_asset_id))?.company_name ||
      row.ticker,
  }));
  const events = ((eventsResult.data || []) as DbRow[]).map((row) => ({
    id: row.id,
    eventId: row.id,
    headline: row.headline || row.shock_id,
    title: row.headline || row.shock_id,
    explanation: row.explanation,
    description: row.explanation,
    category: row.category || row.scope,
    sentiment: row.sentiment,
    source: row.source,
    magnitude: number(row.magnitude),
    volatilityImpact: number(row.volatility_impact),
    active: row.is_active,
    status: row.is_active ? "active" : "recent",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return { assets, trades, events };
}

export async function loadSettings(
  service: DbService,
  gameId: string,
): Promise<any> {
  const [settingsResult, policyResult] = await Promise.all([
    service.from("game_settings")
      .select("*")
      .eq("game_session_id", gameId)
      .maybeSingle(),
    service.from("game_difficulty_policy_settings")
      .select("*")
      .eq("game_session_id", gameId)
      .maybeSingle(),
  ]);
  if (settingsResult.error || policyResult.error) {
    throw settingsResult.error || policyResult.error;
  }
  const settings: DbRow = settingsResult.data || {};
  const policy: DbRow = policyResult.data || {};
  const difficulty = policy.difficulty_preset ||
    settings.difficulty_preset || "moderate";
  return {
    difficultyBasePreset: difficulty,
    backendDifficultyPreset: difficulty,
    difficultyPreset: difficulty,
    difficulty,
    priceMultiplier: number(policy.price_modifier, 1),
    incomeMultiplier: number(policy.income_modifier, 1),
    shockFrequency: number(policy.event_volatility_modifier, 1),
    shockSeverity: number(policy.scarcity_modifier, 1),
    shockBias: 0,
    bankruptcyProtection: number(policy.credit_modifier, 1),
    recoverySupport: number(policy.credit_modifier, 1),
    tradeMultiplier: number(policy.trade_modifier, 1),
    attendanceWindow: settings.attendance_window || {},
    businessMarketWindow: settings.business_market_window || {},
    stockMarketWindow: settings.stock_market_window || {},
    newsSchedule: settings.news_schedule || {},
    configSaveState: "saved",
    configLastSaved: policy.updated_at || settings.updated_at || null,
    validationMode: "server",
  };
}

export async function loadLogs(
  service: DbService,
  gameId: string,
  limit = 200,
): Promise<any[]> {
  const result = await service.from("audit_log")
    .select("*")
    .eq("game_session_id", gameId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, limit)));
  if (result.error) throw result.error;
  return ((result.data || []) as DbRow[]).map((row) => ({
    id: row.id,
    eventId: row.id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    type: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata || {},
    relatedRecord: row.target_id
      ? { type: row.target_type, id: row.target_id }
      : null,
    createdAt: row.created_at,
    timestamp: row.created_at,
  }));
}
