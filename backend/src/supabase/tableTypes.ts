import type {
  ActorType,
  GameSessionRecord,
  ISODateTimeString,
  PlayerSessionRecord,
  StaffUserRecord,
  UUID,
} from "../auth/types.ts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface StaffUsersRow extends StaffUserRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StaffUserInsert {
  readonly supabase_auth_user_id: UUID;
  readonly email: string;
  readonly display_name: string;
}

export interface GameSessionsRow extends GameSessionRecord {
  readonly name: string;
  readonly game_join_code_hash?: string | null;
  readonly game_join_code_status: "pending" | "active" | "revoked" | string;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface GameSessionInsert {
  readonly owner_staff_user_id: UUID;
  readonly name: string;
  readonly status?: "active" | "archived" | "disabled" | string;
  readonly game_join_code_hash?: string | null;
  readonly game_join_code_status?: "pending" | "active" | "revoked" | string;
}

export interface GameSettingsRecord {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly difficulty_preset: string;
  readonly attendance_window: JsonObject;
  readonly business_market_window: JsonObject;
  readonly stock_market_window: JsonObject;
  readonly news_schedule: JsonObject;
}

export interface GameSettingsRow extends GameSettingsRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface GameSettingsInsert {
  readonly game_session_id: UUID;
  readonly difficulty_preset?: string;
  readonly attendance_window?: JsonObject;
  readonly business_market_window?: JsonObject;
  readonly stock_market_window?: JsonObject;
  readonly news_schedule?: JsonObject;
}

export interface PurchaseCodeRecord {
  readonly id: UUID;
  readonly code_hash: string;
  readonly status: "active" | "exhausted" | "expired" | "revoked" | string;
  readonly max_redemptions: number;
  readonly redeemed_count: number;
  readonly expires_at?: ISODateTimeString | null;
}

export interface PurchaseCodesRow extends PurchaseCodeRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface EntitlementRecord {
  readonly id: UUID;
  readonly purchase_code_id: UUID;
  readonly staff_user_id: UUID;
  readonly game_session_id: UUID;
  readonly status: "active" | "expired" | "revoked" | string;
}

export interface EntitlementsRow extends EntitlementRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface EntitlementInsert {
  readonly purchase_code_id: UUID;
  readonly staff_user_id: UUID;
  readonly game_session_id: UUID;
  readonly status?: "active" | "expired" | "revoked" | string;
}

export interface RedeemPurchaseCodeForGameRpcArgs {
  readonly p_staff_user_id: UUID;
  readonly p_purchase_code_hash: string;
  readonly p_game_name: string;
  readonly p_game_settings?: JsonObject;
  readonly p_request_metadata?: JsonObject;
}

export interface RedeemPurchaseCodeForGameRpcRow {
  readonly game_session_id: UUID;
  readonly entitlement_id: UUID;
  readonly purchase_code_id: UUID;
  readonly purchase_code_status: "active" | "exhausted" | "expired" | "revoked" | string;
  readonly redeemed_count: number;
  readonly max_redemptions: number;
  readonly activated_at: ISODateTimeString;
}

export interface ApplyStockMarketRunnerTickRpcArgs {
  readonly p_game_session_id: UUID;
  readonly p_tick_index: number;
  readonly p_asset_updates: readonly JsonObject[];
  readonly p_tick_rows: readonly JsonObject[];
}

export interface ApplyStockMarketRunnerTickRpcRow {
  readonly assets_updated: number;
  readonly ticks_inserted: number;
}

export interface InitializeStockMarketAssetsForGameRpcArgs {
  readonly p_game_session_id: UUID;
  readonly p_mode?: "missing_only" | "reset_empty_only" | string;
}

export interface InitializeStockMarketAssetsForGameRpcRow {
  readonly game_session_id: UUID;
  readonly templates_available: number;
  readonly assets_before: number;
  readonly assets_inserted: number;
  readonly baseline_ticks_inserted: number;
  readonly assets_after: number;
}

export interface PlayerSessionsRow extends PlayerSessionRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface AuditLogRow {
  readonly id: UUID;
  readonly game_session_id?: UUID | null;
  readonly actor_type: ActorType;
  readonly actor_id?: UUID | null;
  readonly action: string;
  readonly target_type: string;
  readonly target_id?: UUID | null;
  readonly metadata: JsonObject;
  readonly created_at: ISODateTimeString;
}

export interface AuditLogInsert {
  readonly game_session_id?: UUID | null;
  readonly actor_type: ActorType;
  readonly actor_id?: UUID | null;
  readonly action: string;
  readonly target_type: string;
  readonly target_id?: UUID | null;
  readonly metadata?: JsonObject;
}

export type MutationIdempotencyStatus = "STARTED" | "COMPLETED" | "FAILED";

export interface MutationIdempotencyKeysRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly route_key: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly status: MutationIdempotencyStatus | string;
  readonly result_type?: string | null;
  readonly result_id?: UUID | null;
  readonly response_body?: JsonObject | null;
  readonly created_at: ISODateTimeString;
  readonly completed_at?: ISODateTimeString | null;
  readonly expires_at: ISODateTimeString;
}

export interface MutationIdempotencyKeyInsert {
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly route_key: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly status?: MutationIdempotencyStatus | string;
  readonly result_type?: string | null;
  readonly result_id?: UUID | null;
  readonly response_body?: JsonObject | null;
  readonly completed_at?: ISODateTimeString | null;
  readonly expires_at: ISODateTimeString;
}

export type StorePurchaseQuoteStatus = "CREATED" | "USED" | "EXPIRED" | "CANCELLED";

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

export type StockMarketEventScope = "global" | "country" | "sector" | "ticker";

export type StockMarketRegimeName =
  | "bull"
  | "bear"
  | "sideways"
  | "crisis"
  | "recovery"
  | "sector_rotation";

export interface StockTemplatesRow {
  readonly id: UUID;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly base_price: number;
  readonly beta: number;
  readonly liquidity: number;
  readonly long_run_volatility: number;
  readonly shares_outstanding?: number | null;
  readonly fundamentals: JsonObject;
  readonly country_exposure: JsonObject;
  readonly sector_exposure: JsonObject;
  readonly commodity_exposure: JsonObject;
  readonly is_active: boolean;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StockTemplateInsert {
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly base_price: number;
  readonly beta: number;
  readonly liquidity: number;
  readonly long_run_volatility: number;
  readonly shares_outstanding?: number | null;
  readonly fundamentals?: JsonObject;
  readonly country_exposure?: JsonObject;
  readonly sector_exposure?: JsonObject;
  readonly commodity_exposure?: JsonObject;
  readonly is_active?: boolean;
}

export type StockTemplateUpdate = Partial<StockTemplateInsert>;

export interface GameSessionStockAssetsRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly template_id?: UUID | null;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly current_price: number;
  readonly previous_close: number;
  readonly open_price: number;
  readonly day_high: number;
  readonly day_low: number;
  readonly market_cap?: number | null;
  readonly shares_outstanding?: number | null;
  readonly beta: number;
  readonly liquidity: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly fair_value_anchor?: number | null;
  readonly recent_returns: JsonValue[];
  readonly chart_history: JsonValue[];
  readonly fundamentals: JsonObject;
  readonly country_exposure: JsonObject;
  readonly sector_exposure: JsonObject;
  readonly commodity_exposure: JsonObject;
  readonly is_active: boolean;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface GameSessionStockAssetInsert {
  readonly game_session_id: UUID;
  readonly template_id?: UUID | null;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly current_price: number;
  readonly previous_close: number;
  readonly open_price: number;
  readonly day_high: number;
  readonly day_low: number;
  readonly market_cap?: number | null;
  readonly shares_outstanding?: number | null;
  readonly beta: number;
  readonly liquidity: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly fair_value_anchor?: number | null;
  readonly recent_returns?: JsonValue[];
  readonly chart_history?: JsonValue[];
  readonly fundamentals?: JsonObject;
  readonly country_exposure?: JsonObject;
  readonly sector_exposure?: JsonObject;
  readonly commodity_exposure?: JsonObject;
  readonly is_active?: boolean;
}

export type GameSessionStockAssetUpdate = Partial<GameSessionStockAssetInsert>;

export interface StockPriceTicksRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly stock_asset_id: UUID;
  readonly tick_index: number;
  readonly ticker: string;
  readonly price: number;
  readonly previous_price: number;
  readonly log_return: number;
  readonly change_pct: number;
  readonly volume: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly explanation: JsonObject;
  readonly created_at: ISODateTimeString;
}

export interface StockPriceTickInsert {
  readonly game_session_id: UUID;
  readonly stock_asset_id: UUID;
  readonly tick_index: number;
  readonly ticker: string;
  readonly price: number;
  readonly previous_price: number;
  readonly log_return: number;
  readonly change_pct: number;
  readonly volume: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly explanation?: JsonObject;
}

export type StockPriceTickUpdate = Partial<StockPriceTickInsert>;

export interface StockMarketEventsRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly shock_id: string;
  readonly scope: StockMarketEventScope | string;
  readonly target_key?: string | null;
  readonly magnitude: number;
  readonly decay: number;
  readonly confidence: number;
  readonly volatility_impact?: number | null;
  readonly volume_impact?: number | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number;
  readonly expires_tick?: number | null;
  readonly is_active: boolean;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StockMarketEventInsert {
  readonly game_session_id: UUID;
  readonly shock_id: string;
  readonly scope: StockMarketEventScope | string;
  readonly target_key?: string | null;
  readonly magnitude: number;
  readonly decay: number;
  readonly confidence: number;
  readonly volatility_impact?: number | null;
  readonly volume_impact?: number | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number;
  readonly expires_tick?: number | null;
  readonly is_active?: boolean;
}

export type StockMarketEventUpdate = Partial<StockMarketEventInsert>;

export interface StockMarketRegimesRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly regime: StockMarketRegimeName | string;
  readonly starts_tick: number;
  readonly ends_tick?: number | null;
  readonly drift_bias: number;
  readonly volatility_multiplier: number;
  readonly news_sensitivity: number;
  readonly volume_multiplier: number;
  readonly beta_multiplier?: number | null;
  readonly sector_rotation: JsonObject;
  readonly student_label?: string | null;
  readonly is_active: boolean;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StockMarketRegimeInsert {
  readonly game_session_id: UUID;
  readonly regime: StockMarketRegimeName | string;
  readonly starts_tick: number;
  readonly ends_tick?: number | null;
  readonly drift_bias: number;
  readonly volatility_multiplier: number;
  readonly news_sensitivity: number;
  readonly volume_multiplier: number;
  readonly beta_multiplier?: number | null;
  readonly sector_rotation?: JsonObject;
  readonly student_label?: string | null;
  readonly is_active?: boolean;
}

export type StockMarketRegimeUpdate = Partial<StockMarketRegimeInsert>;

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
}

export interface CoreSupabaseFunctions {
  readonly apply_stock_market_runner_tick: ReadonlyArray<ApplyStockMarketRunnerTickRpcRow>;
  readonly initialize_stock_market_assets_for_game: ReadonlyArray<
    InitializeStockMarketAssetsForGameRpcRow
  >;
  readonly redeem_purchase_code_for_game: ReadonlyArray<RedeemPurchaseCodeForGameRpcRow>;
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

export function mapPlayerSessionRow(row: PlayerSessionsRow): PlayerSessionRecord {
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
