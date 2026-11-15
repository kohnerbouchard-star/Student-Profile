import type {
  GameSessionRecord,
  ISODateTimeString,
  PlayerSessionRecord,
  StaffUserRecord,
  UUID,
} from "../auth/types.ts";
import type {
  JsonObject,
  StaffUsersRow,
  PurchaseCodesRow,
  EntitlementsRow,
  GameSessionsRow,
  GameSettingsRow,
  PlayerSessionsRow,
  AuditLogRow,
  MutationIdempotencyKeysRow,
  ApplyStockMarketRunnerTickRpcRow,
  ExecuteStockMarketOrderRpcRow,
  InitializeStockMarketAssetsForGameRpcRow,
  RedeemPurchaseCodeForGameRpcRow,
  GameSettingsRecord,
  PurchaseCodeRecord,
  EntitlementRecord,
  AuditLogInsert,
} from "./coreTableTypes.ts";
import type {
  StockTemplatesRow,
  GameSessionStockAssetsRow,
  StockPriceTicksRow,
  StockMarketEventsRow,
  StockMarketRegimesRow,
  StockHoldingsRow,
  StockOrdersRow,
  StockTradesRow,
} from "./stockTableTypes.ts";
export type {
  StockMarketEventScope,
  StockMarketRegimeName,
  StockTemplatesRow,
  StockTemplateInsert,
  StockTemplateUpdate,
  GameSessionStockAssetsRow,
  GameSessionStockAssetInsert,
  GameSessionStockAssetUpdate,
  StockPriceTicksRow,
  StockPriceTickInsert,
  StockPriceTickUpdate,
  StockMarketEventsRow,
  StockMarketEventInsert,
  StockMarketEventUpdate,
  StockMarketRegimesRow,
  StockMarketRegimeInsert,
  StockMarketRegimeUpdate,
  StockHoldingsRow,
  StockHoldingInsert,
  StockHoldingUpdate,
  StockOrdersRow,
  StockOrderInsert,
  StockOrderUpdate,
  StockTradesRow,
  StockTradeInsert,
} from "./stockTableTypes.ts";
export type {
  JsonPrimitive,
  JsonValue,
  JsonObject,
  StaffUsersRow,
  StaffUserInsert,
  GameSessionsRow,
  GameSessionInsert,
  GameSettingsRecord,
  GameSettingsRow,
  GameSettingsInsert,
  PurchaseCodeRecord,
  PurchaseCodesRow,
  EntitlementRecord,
  EntitlementsRow,
  EntitlementInsert,
  RedeemPurchaseCodeForGameRpcArgs,
  RedeemPurchaseCodeForGameRpcRow,
  ApplyStockMarketRunnerTickRpcArgs,
  ApplyStockMarketRunnerTickRpcRow,
  InitializeStockMarketAssetsForGameRpcArgs,
  InitializeStockMarketAssetsForGameRpcRow,
  ExecuteStockMarketOrderRpcArgs,
  ExecuteStockMarketOrderRpcRow,
  PlayerSessionsRow,
  AuditLogRow,
  AuditLogInsert,
  MutationIdempotencyStatus,
  MutationIdempotencyKeysRow,
  MutationIdempotencyKeyInsert,
} from "./coreTableTypes.ts";

export type StorePurchaseQuoteStatus =
  | "CREATED"
  | "USED"
  | "EXPIRED"
  | "CANCELLED";

export interface StorePurchaseQuotesRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly store_item_id: UUID;
  readonly quantity: number;
  readonly currency_code: string;
  readonly base_unit_price: number;
  readonly inflation_multiplier: number;
  readonly location_multiplier: number;
  readonly scarcity_multiplier: number;
  readonly discount_amount: number;
  readonly final_unit_price: number;
  readonly final_total_price: number;
  readonly pricing_version: string;
  readonly status: StorePurchaseQuoteStatus | string;
  readonly created_at: ISODateTimeString;
  readonly expires_at: ISODateTimeString;
  readonly used_at?: ISODateTimeString | null;
  readonly cancelled_at?: ISODateTimeString | null;
}

export interface StorePurchaseQuoteInsert {
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly store_item_id: UUID;
  readonly quantity: number;
  readonly currency_code?: string;
  readonly base_unit_price: number;
  readonly inflation_multiplier?: number;
  readonly location_multiplier?: number;
  readonly scarcity_multiplier?: number;
  readonly discount_amount?: number;
  readonly final_unit_price: number;
  readonly final_total_price: number;
  readonly pricing_version?: string;
  readonly status?: StorePurchaseQuoteStatus | string;
  readonly expires_at: ISODateTimeString;
  readonly used_at?: ISODateTimeString | null;
  readonly cancelled_at?: ISODateTimeString | null;
}

export type StorePurchaseStatus = "COMPLETED" | "FAILED" | "REVERSED";

export interface StorePurchasesRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly store_item_id: UUID;
  readonly quote_id?: UUID | null;
  readonly quantity: number;
  readonly currency_code: string;
  readonly final_unit_price: number;
  readonly final_total_price: number;
  readonly ledger_entry_id?: UUID | null;
  readonly idempotency_key: string;
  readonly status: StorePurchaseStatus | string;
  readonly client_submitted_at?: ISODateTimeString | null;
  readonly created_at: ISODateTimeString;
}

export interface StorePurchaseInsert {
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly store_item_id: UUID;
  readonly quote_id?: UUID | null;
  readonly quantity: number;
  readonly currency_code?: string;
  readonly final_unit_price: number;
  readonly final_total_price: number;
  readonly ledger_entry_id?: UUID | null;
  readonly idempotency_key: string;
  readonly status?: StorePurchaseStatus | string;
  readonly client_submitted_at?: ISODateTimeString | null;
}

export interface InventoryHoldingsRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly store_item_id: UUID;
  readonly quantity_owned: number;
  readonly quantity_reserved: number;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface InventoryHoldingInsert {
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly store_item_id: UUID;
  readonly quantity_owned?: number;
  readonly quantity_reserved?: number;
}

export type InventoryEventType =
  | "PURCHASED"
  | "USED"
  | "RESERVED"
  | "RELEASED"
  | "ADJUSTED"
  | "REVERSED";

export interface InventoryEventsRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly store_item_id: UUID;
  readonly quantity_delta: number;
  readonly event_type: InventoryEventType | string;
  readonly source_domain: string;
  readonly source_action: string;
  readonly source_id?: UUID | null;
  readonly metadata: JsonObject;
  readonly created_at: ISODateTimeString;
}

export interface InventoryEventInsert {
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly store_item_id: UUID;
  readonly quantity_delta: number;
  readonly event_type: InventoryEventType | string;
  readonly source_domain: string;
  readonly source_action: string;
  readonly source_id?: UUID | null;
  readonly metadata?: JsonObject;
}

export interface CoreSupabaseTables {
  readonly staff_users: StaffUsersRow;
  readonly purchase_codes: PurchaseCodesRow;
  readonly entitlements: EntitlementsRow;
  readonly game_sessions: GameSessionsRow;
  readonly game_settings: GameSettingsRow;
  readonly player_sessions: PlayerSessionsRow;
  readonly audit_log: AuditLogRow;
  readonly mutation_idempotency_keys: MutationIdempotencyKeysRow;
  readonly store_purchase_quotes: StorePurchaseQuotesRow;
  readonly store_purchases: StorePurchasesRow;
  readonly inventory_holdings: InventoryHoldingsRow;
  readonly inventory_events: InventoryEventsRow;
  readonly stock_templates: StockTemplatesRow;
  readonly game_session_stock_assets: GameSessionStockAssetsRow;
  readonly stock_price_ticks: StockPriceTicksRow;
  readonly stock_market_events: StockMarketEventsRow;
  readonly stock_market_regimes: StockMarketRegimesRow;
  readonly stock_holdings: StockHoldingsRow;
  readonly stock_orders: StockOrdersRow;
  readonly stock_trades: StockTradesRow;
}

export interface CoreSupabaseFunctions {
  readonly apply_stock_market_runner_tick: ReadonlyArray<
    ApplyStockMarketRunnerTickRpcRow
  >;
  readonly execute_stock_market_order: ReadonlyArray<
    ExecuteStockMarketOrderRpcRow
  >;
  readonly initialize_stock_market_assets_for_game: ReadonlyArray<
    InitializeStockMarketAssetsForGameRpcRow
  >;
  readonly redeem_purchase_code_for_game: ReadonlyArray<
    RedeemPurchaseCodeForGameRpcRow
  >;
}

export function mapStaffUserRow(row: StaffUsersRow): StaffUserRecord {
  return {
    id: row.id,
    supabase_auth_user_id: row.supabase_auth_user_id,
    email: row.email,
    display_name: row.display_name,
  };
}

export function mapGameSessionRow(row: GameSessionsRow): GameSessionRecord {
  return {
    id: row.id,
    owner_staff_user_id: row.owner_staff_user_id,
    status: row.status,
  };
}

export function mapGameSettingsRow(row: GameSettingsRow): GameSettingsRecord {
  return {
    id: row.id,
    game_session_id: row.game_session_id,
    difficulty_preset: row.difficulty_preset,
    attendance_window: row.attendance_window,
    business_market_window: row.business_market_window,
    stock_market_window: row.stock_market_window,
    news_schedule: row.news_schedule,
  };
}

export function mapPurchaseCodeRow(row: PurchaseCodesRow): PurchaseCodeRecord {
  return {
    id: row.id,
    code_hash: row.code_hash,
    status: row.status,
    max_redemptions: row.max_redemptions,
    redeemed_count: row.redeemed_count,
    expires_at: row.expires_at,
  };
}

export function mapEntitlementRow(row: EntitlementsRow): EntitlementRecord {
  return {
    id: row.id,
    purchase_code_id: row.purchase_code_id,
    staff_user_id: row.staff_user_id,
    game_session_id: row.game_session_id,
    status: row.status,
  };
}

export function mapPlayerSessionRow(
  row: PlayerSessionsRow,
): PlayerSessionRecord {
  return {
    id: row.id,
    game_session_id: row.game_session_id,
    player_id: row.player_id,
    session_token_hash: row.session_token_hash,
    status: row.status,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
  };
}

export function normalizeAuditLogInsert(entry: AuditLogInsert): AuditLogInsert {
  return {
    ...entry,
    game_session_id: entry.game_session_id ?? null,
    actor_id: entry.actor_id ?? null,
    target_id: entry.target_id ?? null,
    metadata: entry.metadata ?? {},
  };
}
