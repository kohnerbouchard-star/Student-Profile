import {
  CONTRACT_ID,
  CONTRACT_PROGRESS_ID,
  GAME_SESSION_ID,
  ORDER_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
  STOCK_ASSET_ID,
  STORE_ITEM_ID,
  STORY_DELIVERY_ID,
  STORY_NOTIFICATION_ID,
  TRADE_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";

export function playerSession(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_SESSION_ID,
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    session_token_hash: "session-token-hash",
    status: "active",
    expires_at: "2999-01-01T00:00:00.000Z",
    revoked_at: null,
    ...overrides,
  };
}

export function stockAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: STOCK_ASSET_ID,
    game_session_id: GAME_SESSION_ID,
    ticker: "AURA",
    company_name: "Aurora Aerospace Systems",
    sector_key: "AI_AEROSPACE",
    country_code: "SOLVEND",
    listing_currency_code: "SLV",
    description: "A game-public stock.",
    current_price: 125,
    previous_close: 100,
    open_price: 100,
    day_high: 130,
    day_low: 98,
    market_cap: 1000000,
    current_volatility: 0.2,
    long_run_volatility: 0.3,
    is_active: true,
    ...overrides,
  };
}

export function stockTick(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_SESSION_ID,
    stock_asset_id: STOCK_ASSET_ID,
    tick_index: 7,
    ticker: "AURA",
    price: 125,
    previous_price: 120,
    change_pct: 4.166667,
    volume: 1000,
    created_at: "2026-06-24T00:05:00.000Z",
    ...overrides,
  };
}

export function holdingRow(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    quantity: 5,
    average_cost: 100,
    realized_pnl: 30,
    ...overrides,
  };
}

export function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "buy",
    quantity: 5,
    execution_price: 100,
    gross_value: 500,
    status: "filled",
    rejection_reason: null,
    idempotency_key: "order-1",
    created_at: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

export function tradeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRADE_ID,
    order_id: ORDER_ID,
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "buy",
    quantity: 5,
    execution_price: 100,
    gross_value: 500,
    created_at: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

export function storeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: STORE_ITEM_ID,
    game_session_id: GAME_SESSION_ID,
    item_key: "homework_pass",
    name: "Homework Pass",
    description: "Skip one homework assignment.",
    category: "privilege",
    price: 75,
    currency_code: "SLV",
    stock_quantity: 10,
    status: "active",
    visibility: "visible",
    sort_order: 10,
    created_at: "2026-06-24T00:03:00.000Z",
    updated_at: "2026-06-24T00:04:00.000Z",
    ...overrides,
  };
}

export function gameSessionContract(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: CONTRACT_ID,
    game_session_id: GAME_SESSION_ID,
    contract_key: "market_research_brief",
    source_type: "teacher",
    source_id: null,
    created_by_staff_id: "00000000-0000-4000-8000-000000000c01",
    title: "Market Research Brief",
    description: "Research one Econovaria market.",
    instructions: "Submit a short market note.",
    category: "research",
    status: "active",
    visibility: "public",
    targeting_payload: {},
    requirements_payload: {},
    reward_payload: { cash: { amount: 100, currencyCode: "SLV" } },
    completion_mode: "manual_review",
    published_at: "2026-06-24T00:01:00.000Z",
    deadline_at: "2026-06-30T00:00:00.000Z",
    expires_at: null,
    metadata: {},
    created_at: "2026-06-24T00:00:00.000Z",
    updated_at: "2026-06-24T00:01:00.000Z",
    ...overrides,
  };
}

export function playerContractProgress(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: CONTRACT_PROGRESS_ID,
    game_session_id: GAME_SESSION_ID,
    contract_id: CONTRACT_ID,
    player_id: PLAYER_ID,
    status: "submitted",
    evidence_payload: { note: "Solvend demand is rising." },
    result_payload: {},
    submitted_at: "2026-06-24T00:08:00.000Z",
    completed_at: null,
    reward_issued_at: null,
    created_at: "2026-06-24T00:07:00.000Z",
    updated_at: "2026-06-24T00:08:00.000Z",
    ...overrides,
  };
}

export function storyNotificationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: STORY_NOTIFICATION_ID,
    game_session_id: GAME_SESSION_ID,
    source_type: "storyline_event",
    source_id: "story-event-1",
    notification_type: "story_cutscene",
    title: "Northreach closes northern migration corridors",
    summary: "Border restrictions escalate after security concerns.",
    priority: "major",
    display_mode: "modal_on_next_login",
    payload: {
      videoAssetKey: "northreach-border-closure-v1",
      posterAssetKey: "northreach-border-closure-poster",
      requiresAcknowledgement: true,
    },
    published_at: "2026-06-24T00:12:00.000Z",
    ...overrides,
  };
}

export function storyDeliveryRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: STORY_DELIVERY_ID,
    notification_id: STORY_NOTIFICATION_ID,
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    delivered_at: "2026-06-24T00:12:30.000Z",
    seen_at: null,
    dismissed_at: null,
    acknowledged_at: null,
    ...overrides,
  };
}
