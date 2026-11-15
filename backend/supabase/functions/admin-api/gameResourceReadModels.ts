import { number, object, text, todayIsoDate } from "./common.ts";
import type { GameSessionsStaffApplicationContext } from "../../../src/domains/game-sessions/contracts/gameSessionsStaffApplicationContext.ts";
import type { GameSettingsReadRepository } from "../../../src/domains/game-sessions/application/readGameSettings.ts";
import {
  type DbService,
  type DbRow,
  pushByKey,
} from "./playerReadSupport.ts";


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
      .select("*,game_item:game_items!store_items_game_item_scope_fk(source_kind)")
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
    sourceType: ["physical_pack", "system"].includes(row.game_item?.source_kind)
      ? "seeded"
      : ["store_created", "admin_created"].includes(row.game_item?.source_kind)
      ? "custom"
      : undefined,
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
  repository: Pick<GameSettingsReadRepository, "readAdminGameSettingsView">,
  applicationContext: GameSessionsStaffApplicationContext,
): Promise<any> {
  const result = await repository.readAdminGameSettingsView({
    applicationContext,
  });
  const settings: DbRow = result.settings || {};
  const policy: DbRow = result.difficultyPolicy || {};
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
