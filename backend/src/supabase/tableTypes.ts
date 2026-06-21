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
}

export interface CoreSupabaseFunctions {
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
