import type {
  ActorType,
  GameSessionRecord,
  ISODateTimeString,
  PlayerSessionRecord,
  StaffUserRecord,
  UUID,
} from "../auth/types";

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

export interface CoreSupabaseTables {
  readonly staff_users: StaffUsersRow;
  readonly game_sessions: GameSessionsRow;
  readonly game_settings: GameSettingsRow;
  readonly player_sessions: PlayerSessionsRow;
  readonly audit_log: AuditLogRow;
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
