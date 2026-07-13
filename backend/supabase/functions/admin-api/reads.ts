import { number, text, todayIsoDate } from "./common.ts";

function recentSession(session) {
  if (!session) return false;
  const expiresAt = Date.parse(session.expires_at || "");
  const updatedAt = Date.parse(session.updated_at || session.created_at || "");
  const now = Date.now();
  if (Number.isFinite(expiresAt) && expiresAt <= now) return false;
  return Number.isFinite(updatedAt) && now - updatedAt <= 5 * 60 * 1000;
}

export async function loadPlayers(service, gameId) {
  const results = await Promise.all([
    service.from("players").select("id,display_name,roster_label,status,created_at,updated_at").eq("game_session_id", gameId).order("created_at", { ascending: true }),
    service.from("account_balances").select("player_id,account_type,balance,currency_code,updated_at").eq("game_session_id", gameId),
    service.from("player_country_assignments").select("player_id,country_profile_id,status,assigned_at").eq("game_session_id", gameId).eq("status", "active"),
    service.from("country_profiles").select("id,country_code,country_name,currency_code,status"),
    service.from("player_sessions").select("player_id,status,created_at,updated_at,expires_at").eq("game_session_id", gameId).eq("status", "active"),
    service.from("stock_holdings").select("player_id,stock_asset_id,ticker,quantity,reserved_quantity,average_cost,realized_pnl,updated_at").eq("game_session_id", gameId),
    service.from("game_session_stock_assets").select("id,ticker,current_price,is_active").eq("game_session_id", gameId),
    service.from("inventory_holdings").select("player_id,store_item_id,quantity_owned,quantity_reserved,updated_at").eq("game_session_id", gameId),
    service.from("store_items").select("id,name,price,currency_code,status").eq("game_session_id", gameId),
  ]);
  const error = results.map((result) => result.error).find(Boolean);
  if (error) throw error;
  const [playersResult, balancesResult, assignmentsResult, countriesResult, sessionsResult, stockHoldingsResult, stockAssetsResult, inventoryResult, storeItemsResult] = results;

  const balancesByPlayer = new Map();
  for (const row of balancesResult.data || []) {
    const list = balancesByPlayer.get(row.player_id) || [];
    list.push({ accountType: row.account_type, balance: number(row.balance), currencyCode: row.currency_code, updatedAt: row.updated_at });
    balancesByPlayer.set(row.player_id, list);
  }

  const stockAssets = new Map((stockAssetsResult.data || []).map((row) => [row.id, row]));
  const stocksByPlayer = new Map();
  for (const row of stockHoldingsResult.data || []) {
    const asset = stockAssets.get(row.stock_asset_id);
    const currentPrice = number(asset?.current_price);
    const quantity = number(row.quantity);
    const list = stocksByPlayer.get(row.player_id) || [];
    list.push({
      assetId: row.stock_asset_id,
      ticker: row.ticker || asset?.ticker || "",
      quantity,
      reservedQuantity: number(row.reserved_quantity),
      averageCost: number(row.average_cost),
      currentPrice,
      marketValue: quantity * currentPrice,
      realizedPnl: number(row.realized_pnl),
      updatedAt: row.updated_at,
    });
    stocksByPlayer.set(row.player_id, list);
  }

  const storeItems = new Map((storeItemsResult.data || []).map((row) => [row.id, row]));
  const inventoryByPlayer = new Map();
  for (const row of inventoryResult.data || []) {
    const item = storeItems.get(row.store_item_id);
    const quantity = number(row.quantity_owned);
    const unitValue = number(item?.price);
    const list = inventoryByPlayer.get(row.player_id) || [];
    list.push({
      storeItemId: row.store_item_id,
      name: item?.name || "Store item",
      quantity,
      reservedQuantity: number(row.quantity_reserved),
      unitValue,
      marketValue: quantity * unitValue,
      currencyCode: item?.currency_code || "",
      updatedAt: row.updated_at,
    });
    inventoryByPlayer.set(row.player_id, list);
  }

  const countries = new Map((countriesResult.data || []).map((row) => [row.id, row]));
  const assignmentByPlayer = new Map((assignmentsResult.data || []).map((row) => [row.player_id, row]));
  const sessionByPlayer = new Map();
  for (const row of sessionsResult.data || []) {
    const existing = sessionByPlayer.get(row.player_id);
    if (!existing || Date.parse(row.updated_at || row.created_at || "") > Date.parse(existing.updated_at || existing.created_at || "")) {
      sessionByPlayer.set(row.player_id, row);
    }
  }

  return (playersResult.data || []).map((player) => {
    const balances = balancesByPlayer.get(player.id) || [];
    const cash = balances.find((entry) => String(entry.accountType).toLowerCase() === "cash") || balances[0] || null;
    const stockHoldings = stocksByPlayer.get(player.id) || [];
    const inventoryHoldings = inventoryByPlayer.get(player.id) || [];
    const stockValue = stockHoldings.reduce((sum, holding) => sum + number(holding.marketValue), 0);
    const inventoryValue = inventoryHoldings.reduce((sum, holding) => sum + number(holding.marketValue), 0);
    const cashBalance = number(cash?.balance);
    const netWorth = cashBalance + stockValue + inventoryValue;
    const assignment = assignmentByPlayer.get(player.id);
    const country = assignment ? countries.get(assignment.country_profile_id) : null;
    const activeSession = sessionByPlayer.get(player.id);
    const online = recentSession(activeSession);
    return {
      id: player.id,
      playerId: player.id,
      name: player.display_name,
      displayName: player.display_name,
      rosterLabel: player.roster_label,
      status: player.status,
      sessionStatus: online ? "online" : activeSession ? "recent" : "offline",
      online,
      lastActiveAt: activeSession?.updated_at || null,
      balances,
      balance: cashBalance,
      cashBalance,
      stockValue,
      inventoryValue,
      stockHoldings,
      inventoryHoldings,
      currencyCode: cash?.currencyCode || country?.currency_code || "ECO",
      netWorth,
      overallScore: netWorth,
      scoreBasis: "net_worth_v1",
      countryCode: country?.country_code || "",
      countryName: country?.country_name || "Unassigned",
      location: country?.country_name || "Unassigned",
      createdAt: player.created_at,
      updatedAt: player.updated_at,
    };
  });
}

async function loadAttendanceRewards(service, gameId, fromDate, toDate) {
  const result = await service
    .from("ledger_entries")
    .select("id,player_id,amount,currency_code,entry_type,source_domain,source_action,source_id,created_at")
    .eq("game_session_id", gameId)
    .eq("source_domain", "attendance")
    .gte("created_at", `${fromDate}T00:00:00.000+09:00`)
    .lte("created_at", `${toDate}T23:59:59.999+09:00`)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data || []).map((row) => ({
    id: row.id,
    ledgerEntryId: row.id,
    playerId: row.player_id,
    amount: number(row.amount),
    currencyCode: row.currency_code,
    entryType: row.entry_type,
    sourceDomain: row.source_domain,
    sourceAction: row.source_action,
    attendanceId: row.source_id,
    createdAt: row.created_at,
  }));
}

function summarizeAttendance(rows, playerCount) {
  const presentCount = rows.filter((row) => row.status === "present").length;
  const lateCount = rows.filter((row) => row.status === "late").length;
  const absentCount = rows.filter((row) => row.status === "absent").length;
  return { presentCount, lateCount, absentCount, scannedCount: presentCount + lateCount, missingCount: absentCount, activePlayerCount: playerCount };
}

export async function loadAttendance(service, gameId, players, requestedDate = todayIsoDate()) {
  const [recordsResult, rewards] = await Promise.all([
    service.from("player_attendance_records").select("id,player_id,attendance_date,status,clocked_in_at,source,created_at,updated_at").eq("game_session_id", gameId).eq("attendance_date", requestedDate).order("clocked_in_at", { ascending: true }),
    loadAttendanceRewards(service, gameId, requestedDate, requestedDate),
  ]);
  if (recordsResult.error) throw recordsResult.error;
  const recordsByPlayer = new Map((recordsResult.data || []).map((row) => [row.player_id, row]));
  const rewardsByAttendance = new Map(rewards.map((row) => [String(row.attendanceId || ""), row]));
  const attendance = players.map((player) => {
    const record = recordsByPlayer.get(player.id);
    const reward = record ? rewardsByAttendance.get(String(record.id)) : null;
    return {
      id: record?.id || `missing:${player.id}:${requestedDate}`,
      playerId: player.id,
      player: { id: player.id, displayName: player.displayName, rosterLabel: player.rosterLabel, status: player.status },
      displayName: player.displayName,
      name: player.displayName,
      rosterLabel: player.rosterLabel,
      attendanceDate: requestedDate,
      status: record?.status || "absent",
      clockedInAt: record?.clocked_in_at || null,
      scannedAt: record?.clocked_in_at || null,
      source: record?.source || "not_scanned",
      rewardAmount: number(reward?.amount),
      rewardCurrencyCode: reward?.currencyCode || player.currencyCode || "ECO",
      rewardLedgerEntryId: reward?.ledgerEntryId || null,
    };
  });
  const summary = summarizeAttendance(attendance, players.length);
  const rewardTotal = rewards.reduce((sum, row) => sum + (row.entryType === "debit" ? -number(row.amount) : number(row.amount)), 0);
  return {
    attendance,
    attendanceRows: attendance,
    attendanceLedger: rewards,
    attendanceRewards: rewards,
    rewardsIssuedToday: rewards.length,
    attendanceRewardTotal: rewardTotal,
    attendanceSummary: summary,
    attendanceCounts: { present: summary.presentCount, late: summary.lateCount, absent: summary.absentCount, total: players.length },
    attendanceStatusCounts: { present: summary.presentCount, late: summary.lateCount, absent: summary.absentCount },
    totalPlayers: players.length,
    attendanceDate: requestedDate,
  };
}

export async function loadAttendanceHistory(service, gameId, players, url) {
  const playerId = text(url.searchParams.get("playerId"));
  const rawDate = text(url.searchParams.get("date"));
  const period = text(url.searchParams.get("period"), "all").toLowerCase();
  const search = text(url.searchParams.get("search")).toLowerCase();
  const now = new Date();
  let fromDate = "2000-01-01";
  let toDate = todayIsoDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    fromDate = rawDate;
    toDate = rawDate;
  } else {
    const dayCount = period === "7d" || period === "week" ? 7 : period === "30d" || period === "month" ? 30 : period === "term" || period === "90d" ? 90 : 0;
    if (dayCount) fromDate = new Date(now.getTime() - (dayCount - 1) * 86400000).toISOString().slice(0, 10);
  }
  let query = service.from("player_attendance_records").select("id,player_id,attendance_date,status,clocked_in_at,source,created_at,updated_at").eq("game_session_id", gameId).gte("attendance_date", fromDate).lte("attendance_date", toDate).order("attendance_date", { ascending: false }).order("clocked_in_at", { ascending: false }).limit(1000);
  if (playerId && playerId !== "all") query = query.eq("player_id", playerId);
  const [recordsResult, rewards] = await Promise.all([query, loadAttendanceRewards(service, gameId, fromDate, toDate)]);
  if (recordsResult.error) throw recordsResult.error;
  const playersById = new Map(players.map((player) => [player.id, player]));
  const rewardsByAttendance = new Map(rewards.map((row) => [String(row.attendanceId || ""), row]));
  let rows = (recordsResult.data || []).map((record) => {
    const player = playersById.get(record.player_id);
    const reward = rewardsByAttendance.get(String(record.id));
    return {
      id: record.id,
      playerId: record.player_id,
      displayName: player?.displayName || "Unknown player",
      name: player?.displayName || "Unknown player",
      rosterLabel: player?.rosterLabel || null,
      attendanceDate: record.attendance_date,
      status: record.status,
      clockedInAt: record.clocked_in_at,
      scannedAt: record.clocked_in_at,
      source: record.source,
      rewardAmount: number(reward?.amount),
      rewardCurrencyCode: reward?.currencyCode || player?.currencyCode || "ECO",
      rewardLedgerEntryId: reward?.ledgerEntryId || null,
    };
  });
  if (search && search !== "*") {
    rows = rows.filter((row) => `${row.displayName} ${row.rosterLabel || ""} ${row.status} ${row.attendanceDate}`.toLowerCase().includes(search));
  }
  const summary = summarizeAttendance(rows, new Set(rows.map((row) => row.playerId)).size);
  return { attendanceHistory: rows, attendanceRows: rows, history: rows, attendanceLedger: rewards, attendanceRewards: rewards, attendanceSummary: summary, fromDate, toDate, total: rows.length };
}

export async function loadContracts(service, gameId) {
  const [contractsResult, progressResult] = await Promise.all([
    service.from("game_session_contracts").select("*").eq("game_session_id", gameId).order("created_at", { ascending: false }),
    service.from("player_contract_progress").select("*").eq("game_session_id", gameId).order("updated_at", { ascending: false }),
  ]);
  if (contractsResult.error || progressResult.error) throw contractsResult.error || progressResult.error;
  const progressByContract = new Map();
  for (const row of progressResult.data || []) {
    const list = progressByContract.get(row.contract_id) || [];
    list.push(row);
    progressByContract.set(row.contract_id, list);
  }
  return (contractsResult.data || []).map((row) => {
    const progress = progressByContract.get(row.id) || [];
    return {
      id: row.id,
      contractId: row.id,
      key: row.contract_key,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      category: row.category,
      status: row.status,
      visibility: row.visibility,
      targeting: row.targeting_payload || {},
      requirements: row.requirements_payload || {},
      rewards: row.reward_payload || {},
      rewardPayload: row.reward_payload || {},
      materials: row.metadata?.materials || [],
      submissionRequirements: row.metadata?.submissionRequirements || [],
      completionMode: row.completion_mode,
      publishedAt: row.published_at,
      deadlineAt: row.deadline_at,
      expiresAt: row.expires_at,
      progress,
      progressCount: progress.length,
      submittedCount: progress.filter((item) => item.status === "submitted").length,
      completedCount: progress.filter((item) => item.status === "completed").length,
      rewardIssuedCount: progress.filter((item) => item.reward_issued_at).length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function loadStore(service, gameId) {
  const [itemsResult, purchasesResult] = await Promise.all([
    service.from("store_items").select("*").eq("game_session_id", gameId).order("sort_order", { ascending: true }),
    service.from("store_purchases").select("store_item_id,quantity,final_total_price,status,created_at").eq("game_session_id", gameId),
  ]);
  if (itemsResult.error || purchasesResult.error) throw itemsResult.error || purchasesResult.error;
  const stats = new Map();
  for (const row of purchasesResult.data || []) {
    const current = stats.get(row.store_item_id) || { purchaseCount: 0, unitsSold: 0, revenue: 0 };
    current.purchaseCount += 1;
    current.unitsSold += number(row.quantity);
    current.revenue += number(row.final_total_price);
    stats.set(row.store_item_id, current);
  }
  return (itemsResult.data || []).map((row) => ({
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
    purchaseStats: stats.get(row.id) || { purchaseCount: 0, unitsSold: 0, revenue: 0 },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function loadMarket(service, gameId) {
  const [assetsResult, tradesResult, eventsResult] = await Promise.all([
    service.from("game_session_stock_assets").select("*").eq("game_session_id", gameId).eq("is_active", true).order("ticker", { ascending: true }),
    service.from("stock_trades").select("*").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(100),
    service.from("stock_market_events").select("*").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (assetsResult.error || tradesResult.error || eventsResult.error) throw assetsResult.error || tradesResult.error || eventsResult.error;
  const assetsById = new Map((assetsResult.data || []).map((row) => [row.id, row]));
  const assets = (assetsResult.data || []).map((row) => {
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
  const trades = (tradesResult.data || []).map((row) => ({
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
    assetName: assetsById.get(row.stock_asset_id)?.company_name || row.ticker,
  }));
  const events = (eventsResult.data || []).map((row) => ({
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

export async function loadSettings(service, gameId) {
  const [settingsResult, policyResult] = await Promise.all([
    service.from("game_settings").select("*").eq("game_session_id", gameId).maybeSingle(),
    service.from("game_difficulty_policy_settings").select("*").eq("game_session_id", gameId).maybeSingle(),
  ]);
  if (settingsResult.error || policyResult.error) throw settingsResult.error || policyResult.error;
  const settings = settingsResult.data || {};
  const policy = policyResult.data || {};
  const difficulty = policy.difficulty_preset || settings.difficulty_preset || "moderate";
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

export async function loadLogs(service, gameId) {
  const result = await service.from("audit_log").select("*").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(500);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => ({
    id: row.id,
    eventId: row.id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    type: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata || {},
    relatedRecord: row.target_id ? { type: row.target_type, id: row.target_id } : null,
    createdAt: row.created_at,
    timestamp: row.created_at,
  }));
}
