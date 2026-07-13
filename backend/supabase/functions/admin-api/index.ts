import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLASSROOM_API_URL = `${SUPABASE_URL}/functions/v1/classroom-api`;

const ALLOWED_ORIGINS = new Set([
  "https://kohnerbouchard-star.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://[::]:4173",
]);

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://kohnerbouchard-star.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-econovaria-game-id, x-client-info, x-csrf-token, x-idempotency-key, x-econovaria-admin-action, x-requested-with, if-match",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function bearerToken(request) {
  return String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function resolveContext(request) {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, message: "Administrator sign-in is required." };

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userResult = await authClient.auth.getUser(token);
  const user = userResult.data?.user;
  if (userResult.error || !user?.id) {
    return { ok: false, status: 401, message: "Administrator session is invalid or expired." };
  }

  const staffResult = await service
    .from("staff_users")
    .select("id,supabase_auth_user_id,email,display_name,created_at,updated_at")
    .eq("supabase_auth_user_id", user.id)
    .maybeSingle();
  if (staffResult.error || !staffResult.data) {
    return { ok: false, status: 403, message: "This account is not registered as staff." };
  }

  const gamesResult = await service
    .from("game_sessions")
    .select("id,name,status,game_join_code_status,created_at,updated_at")
    .eq("owner_staff_user_id", staffResult.data.id)
    .order("created_at", { ascending: false });
  if (gamesResult.error) {
    return { ok: false, status: 500, message: "Administrator games could not be loaded." };
  }

  return { ok: true, token, user, staff: staffResult.data, games: gamesResult.data || [], service };
}

function gameDto(game) {
  return {
    id: game.id,
    gameId: game.id,
    name: game.name,
    status: game.status,
    joinCodeStatus: game.game_join_code_status || "unknown",
    joinCode: "",
    gameCode: "",
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
}

function selectGame(context, request, fallbackId = "") {
  const requested = fallbackId || request.headers.get("x-econovaria-game-id") || "";
  return context.games.find((game) => String(game.id) === String(requested)) || context.games.find((game) => game.status === "active") || context.games[0] || null;
}

function ensureOwnedGame(context, gameId) {
  return context.games.find((game) => String(game.id) === String(gameId)) || null;
}

async function loadPlayers(service, gameId) {
  const [playersResult, balancesResult, assignmentsResult, countriesResult, sessionsResult] = await Promise.all([
    service.from("players").select("id,display_name,roster_label,status,created_at,updated_at").eq("game_session_id", gameId).order("created_at", { ascending: true }),
    service.from("account_balances").select("player_id,account_type,balance,currency_code,updated_at").eq("game_session_id", gameId),
    service.from("player_country_assignments").select("player_id,country_profile_id,status,assigned_at").eq("game_session_id", gameId).eq("status", "active"),
    service.from("country_profiles").select("id,country_code,country_name,currency_code,status"),
    service.from("player_sessions").select("player_id,status,created_at,updated_at,expires_at").eq("game_session_id", gameId).eq("status", "active"),
  ]);
  const error = playersResult.error || balancesResult.error || assignmentsResult.error || countriesResult.error || sessionsResult.error;
  if (error) throw error;

  const balancesByPlayer = new Map();
  for (const row of balancesResult.data || []) {
    const list = balancesByPlayer.get(row.player_id) || [];
    list.push({ accountType: row.account_type, balance: number(row.balance), currencyCode: row.currency_code, updatedAt: row.updated_at });
    balancesByPlayer.set(row.player_id, list);
  }
  const countries = new Map((countriesResult.data || []).map((row) => [row.id, row]));
  const assignmentByPlayer = new Map((assignmentsResult.data || []).map((row) => [row.player_id, row]));
  const sessionByPlayer = new Map((sessionsResult.data || []).map((row) => [row.player_id, row]));

  return (playersResult.data || []).map((player) => {
    const balances = balancesByPlayer.get(player.id) || [];
    const cash = balances.find((entry) => String(entry.accountType).toLowerCase() === "cash") || balances[0] || null;
    const assignment = assignmentByPlayer.get(player.id);
    const country = assignment ? countries.get(assignment.country_profile_id) : null;
    const activeSession = sessionByPlayer.get(player.id);
    return {
      id: player.id,
      playerId: player.id,
      name: player.display_name,
      displayName: player.display_name,
      rosterLabel: player.roster_label,
      status: player.status,
      sessionStatus: activeSession ? "online" : "offline",
      online: Boolean(activeSession),
      lastActiveAt: activeSession?.updated_at || null,
      balances,
      balance: cash?.balance || 0,
      cashBalance: cash?.balance || 0,
      currencyCode: cash?.currencyCode || country?.currency_code || "ECO",
      netWorth: cash?.balance || 0,
      overallScore: cash?.balance || 0,
      countryCode: country?.country_code || "",
      countryName: country?.country_name || "Unassigned",
      location: country?.country_name || "Unassigned",
      createdAt: player.created_at,
      updatedAt: player.updated_at,
    };
  });
}

async function loadAttendance(service, gameId, players) {
  const date = todayIsoDate();
  const result = await service
    .from("player_attendance_records")
    .select("id,player_id,attendance_date,status,clocked_in_at,source,created_at,updated_at")
    .eq("game_session_id", gameId)
    .eq("attendance_date", date)
    .order("clocked_in_at", { ascending: true });
  if (result.error) throw result.error;
  const recordsByPlayer = new Map((result.data || []).map((row) => [row.player_id, row]));
  const attendance = players.map((player) => {
    const record = recordsByPlayer.get(player.id);
    return {
      id: record?.id || `missing:${player.id}:${date}`,
      playerId: player.id,
      player: { id: player.id, displayName: player.displayName, rosterLabel: player.rosterLabel, status: player.status },
      displayName: player.displayName,
      name: player.displayName,
      rosterLabel: player.rosterLabel,
      attendanceDate: date,
      status: record?.status || "absent",
      clockedInAt: record?.clocked_in_at || null,
      scannedAt: record?.clocked_in_at || null,
      source: record?.source || "not_scanned",
    };
  });
  const presentCount = attendance.filter((row) => row.status === "present").length;
  const lateCount = attendance.filter((row) => row.status === "late").length;
  const absentCount = attendance.filter((row) => row.status === "absent").length;
  return {
    attendance,
    attendanceRows: attendance,
    attendanceLedger: [],
    attendanceSummary: { presentCount, lateCount, absentCount, scannedCount: presentCount + lateCount, missingCount: absentCount, activePlayerCount: players.length },
    attendanceCounts: { present: presentCount, late: lateCount, absent: absentCount, total: players.length },
    attendanceStatusCounts: { present: presentCount, late: lateCount, absent: absentCount },
    totalPlayers: players.length,
    attendanceDate: date,
  };
}

async function loadContracts(service, gameId) {
  const [contractsResult, progressResult] = await Promise.all([
    service.from("game_session_contracts").select("*").eq("game_session_id", gameId).order("created_at", { ascending: false }),
    service.from("player_contract_progress").select("id,contract_id,player_id,status,submitted_at,completed_at,reward_issued_at,created_at,updated_at").eq("game_session_id", gameId),
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
      progressCount: progress.length,
      submittedCount: progress.filter((item) => item.status === "submitted").length,
      completedCount: progress.filter((item) => item.status === "completed").length,
      rewardIssuedCount: progress.filter((item) => item.reward_issued_at).length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

async function loadStore(service, gameId) {
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

async function loadMarket(service, gameId) {
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

async function loadSettings(service, gameId) {
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

async function loadLogs(service, gameId) {
  const result = await service.from("audit_log").select("*").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(200);
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

async function proxyClassroom(request, context, path, method = request.method) {
  const headers = new Headers();
  headers.set("apikey", SUPABASE_ANON_KEY);
  headers.set("Authorization", `Bearer ${context.token}`);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const body = ["GET", "HEAD"].includes(method) ? undefined : await request.clone().text();
  const response = await fetch(`${CLASSROOM_API_URL}${path}`, { method, headers, body });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { ...corsHeaders(request), "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(request, 500, { code: "missing_runtime_config", message: "Admin API runtime configuration is incomplete." });
  }

  const context = await resolveContext(request);
  if (!context.ok) return json(request, context.status, { code: "auth_failed", message: context.message });

  const url = new URL(request.url);
  const marker = "/admin-api";
  const markerIndex = url.pathname.indexOf(marker);
  const path = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) || "/" : url.pathname;

  try {
    if (path === "/session/bootstrap" && request.method === "GET") {
      const selected = selectGame(context, request);
      const claims = context.user || {};
      return json(request, 200, { data: {
        admin: { id: context.staff.id, accountId: context.staff.id, displayName: context.staff.display_name, email: context.staff.email, role: "game_admin", roles: ["game_admin"] },
        activeGame: selected ? gameDto(selected) : {},
        games: context.games.map(gameDto),
        permissions: ["*"],
        roles: ["game_admin"],
        csrfToken: "",
        session: { id: claims.id || context.staff.id, csrfToken: "", expiresAt: null },
      } });
    }

    if (path === "/games" && request.method === "GET") {
      return json(request, 200, { data: { games: context.games.map(gameDto) } });
    }

    if (path === "/account/profile" && request.method === "GET") {
      return json(request, 200, { data: { profile: { id: context.staff.id, accountId: context.staff.id, displayName: context.staff.display_name, name: context.staff.display_name, email: context.staff.email, role: "game_admin" } } });
    }
    if (path === "/account/preferences" && request.method === "GET") return json(request, 200, { data: { preferences: {} } });
    if (path === "/notifications" && request.method === "GET") return json(request, 200, { data: { notifications: [], notificationCount: 0, notificationPreferences: {} } });
    if (path.startsWith("/account/security") && request.method === "GET") return json(request, 200, { data: { security: { twoFactorEnabled: false, sessions: [], events: [] } } });
    if (path === "/help/admin-console" && request.method === "GET") return json(request, 200, { data: { articles: [] } });
    if (path === "/auth/sign-out" && request.method === "POST") return json(request, 200, { data: { signedOut: true } });

    const switchMatch = path.match(/^\/games\/([^/]+)\/switch$/);
    if (switchMatch && request.method === "POST") {
      const game = ensureOwnedGame(context, decodeURIComponent(switchMatch[1]));
      if (!game) return json(request, 404, { code: "game_not_found", message: "That game is not available to this administrator." });
      return json(request, 200, { data: { activeGame: gameDto(game) } });
    }

    const gameMatch = path.match(/^\/games\/([^/]+)(\/.*)?$/);
    if (!gameMatch) return json(request, 404, { code: "route_not_found", message: "Admin API route was not found." });
    const gameId = decodeURIComponent(gameMatch[1]);
    const suffix = gameMatch[2] || "";
    const game = ensureOwnedGame(context, gameId);
    if (!game) return json(request, 404, { code: "game_not_found", message: "That game is not available to this administrator." });

    if (suffix === "/dashboard" && request.method === "GET") {
      const players = await loadPlayers(context.service, gameId);
      const [attendance, contracts] = await Promise.all([loadAttendance(context.service, gameId, players), loadContracts(context.service, gameId)]);
      const leaderboard = [...players].sort((a, b) => number(b.netWorth) - number(a.netWorth)).map((player, index) => ({ ...player, rank: index + 1 }));
      return json(request, 200, { data: { game: gameDto(game), leaderboard, contracts: contracts.filter((item) => ["active", "scheduled", "draft"].includes(item.status)), notifications: [], notificationCount: 0, ...attendance } });
    }

    if (suffix.startsWith("/players") && request.method === "GET" && !suffix.includes("/access-code/")) {
      const players = await loadPlayers(context.service, gameId);
      return json(request, 200, { data: { players, roster: players, totalPlayers: players.length } });
    }

    if (suffix === "/attendance/today" && request.method === "GET") {
      const players = await loadPlayers(context.service, gameId);
      return json(request, 200, { data: await loadAttendance(context.service, gameId, players) });
    }

    if (suffix.startsWith("/contracts") && request.method === "GET" && !suffix.includes("/reward-audit")) {
      const contracts = await loadContracts(context.service, gameId);
      return json(request, 200, { data: { contracts, assignments: contracts } });
    }

    if (suffix === "/contract-submissions" && request.method === "GET") {
      const result = await context.service.from("player_contract_progress").select("*").eq("game_session_id", gameId).order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      return json(request, 200, { data: { contractSubmissions: result.data || [], submissions: result.data || [] } });
    }

    if (suffix.startsWith("/store/items") && request.method === "GET") {
      const storeItems = await loadStore(context.service, gameId);
      return json(request, 200, { data: { storeItems, items: storeItems } });
    }

    if (suffix === "/market/assets" && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      return json(request, 200, { data: { assets: market.assets, marketplaceSecurities: market.assets } });
    }
    const profileMatch = suffix.match(/^\/market\/assets\/([^/]+)\/profile$/);
    if (profileMatch && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      const asset = market.assets.find((item) => String(item.id) === decodeURIComponent(profileMatch[1]));
      if (!asset) return json(request, 404, { code: "asset_not_found", message: "Market asset was not found." });
      return json(request, 200, { data: { asset, profile: asset } });
    }
    const chartMatch = suffix.match(/^\/market\/assets\/([^/]+)\/chart$/);
    if (chartMatch && request.method === "GET") {
      const assetId = decodeURIComponent(chartMatch[1]);
      const ticks = await context.service.from("stock_price_ticks").select("tick_index,price,previous_price,change_pct,volume,created_at").eq("game_session_id", gameId).eq("stock_asset_id", assetId).order("tick_index", { ascending: true }).limit(500);
      if (ticks.error) throw ticks.error;
      const candles = (ticks.data || []).map((row) => ({ time: row.created_at, timestamp: row.created_at, close: number(row.price), open: number(row.previous_price, number(row.price)), high: Math.max(number(row.price), number(row.previous_price, number(row.price))), low: Math.min(number(row.price), number(row.previous_price, number(row.price))), volume: number(row.volume), changePct: number(row.change_pct) }));
      return json(request, 200, { data: { candles, chart: candles } });
    }
    const financialsMatch = suffix.match(/^\/market\/assets\/([^/]+)\/financials$/);
    if (financialsMatch && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      const asset = market.assets.find((item) => String(item.id) === decodeURIComponent(financialsMatch[1]));
      if (!asset) return json(request, 404, { code: "asset_not_found", message: "Market asset was not found." });
      return json(request, 200, { data: { assetId: asset.id, financials: asset.financials || {}, fundamentals: asset.fundamentals || {} } });
    }
    if (suffix === "/market/trades/recent" && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      return json(request, 200, { data: { trades: market.trades, marketplaceTrades: market.trades } });
    }
    if (suffix === "/market/events" && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      return json(request, 200, { data: { events: market.events, marketEvents: market.events } });
    }

    if (suffix === "/settings" && request.method === "GET") {
      return json(request, 200, { data: { settings: await loadSettings(context.service, gameId) } });
    }

    if (suffix === "/logs" && request.method === "GET") {
      const auditLogs = await loadLogs(context.service, gameId);
      return json(request, 200, { data: { auditLogs, logs: auditLogs } });
    }

    if (suffix === "/join-code/reset" && request.method === "POST") {
      return proxyClassroom(
        request,
        context,
        `/games/${encodeURIComponent(gameId)}/join-code/reset`,
        "POST",
      );
    }

    const resetCodeMatch = suffix.match(/^\/players\/([^/]+)\/access-code\/reset$/);
    if (resetCodeMatch && request.method === "POST") return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(decodeURIComponent(resetCodeMatch[1]))}/access-code/reset`, "POST");
    if (suffix === "/players" && request.method === "POST") return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/players`, "POST");
    if (suffix === "/attendance/scans" && request.method === "POST") return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/attendance/scan`, "POST");
    if (suffix === "/contracts" && request.method === "POST") return proxyClassroom(request, context, `/staff/game-sessions/${encodeURIComponent(gameId)}/contracts`, "POST");
    if (suffix.startsWith("/store/items") && request.method !== "GET") return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}${suffix.replace(/^\/store/, "/store")}`, request.method);
    if (suffix.startsWith("/settings") && request.method !== "GET") return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/settings`, request.method);

    return json(request, 501, { code: "admin_route_not_implemented", message: "This administrator operation is not connected yet.", path });
  } catch (error) {
    console.error("admin-api failure", { path, error: String(error?.message || error) });
    return json(request, 500, { code: "admin_api_failed", message: "Administrator data could not be loaded." });
  }
});
