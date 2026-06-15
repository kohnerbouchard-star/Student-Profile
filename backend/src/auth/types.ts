export type UUID = string;
export type ISODateTimeString = string;

export type ActorType = "staff_user" | "player" | "system";

export interface SupabaseAuthUser {
  readonly id: UUID;
  readonly email?: string | null;
}

export interface StaffUserRecord {
  readonly id: UUID;
  readonly supabase_auth_user_id: UUID;
  readonly email: string;
  readonly display_name: string;
}

export interface GameSessionRecord {
  readonly id: UUID;
  readonly owner_staff_user_id: UUID;
  readonly status: "active" | "archived" | "disabled" | string;
}

export interface PlayerSessionRecord {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly session_token_hash: string;
  readonly status: "active" | "expired" | "revoked" | string;
  readonly expires_at: ISODateTimeString;
  readonly revoked_at?: ISODateTimeString | null;
}

export interface StaffIdentity {
  readonly kind: "staff";
  readonly actorType: "staff_user";
  readonly staffUserId: UUID;
  readonly supabaseAuthUserId: UUID;
  readonly email: string;
  readonly displayName: string;
}

export interface PlayerIdentity {
  readonly kind: "player";
  readonly actorType: "player";
  readonly playerSessionId: UUID;
  readonly gameSessionId: UUID;
  readonly playerId: UUID;
  readonly expiresAt: ISODateTimeString;
}

export interface SystemIdentity {
  readonly kind: "system";
  readonly actorType: "system";
  readonly systemActorId: string;
}

export type RequestIdentity = StaffIdentity | PlayerIdentity;
export type AccessIdentity = RequestIdentity | SystemIdentity;

export type AccessErrorCode =
  | "missing_identity"
  | "ambiguous_identity"
  | "invalid_auth_user"
  | "staff_not_found"
  | "staff_game_not_found"
  | "staff_game_access_denied"
  | "missing_player_session_token"
  | "player_session_not_found"
  | "player_session_not_unique"
  | "player_session_inactive"
  | "player_session_expired"
  | "player_session_revoked"
  | "invalid_player_session_expiry"
  | "cross_game_access_denied"
  | "player_access_denied"
  | "permission_denied";

export interface AccessBoundaryError {
  readonly code: AccessErrorCode;
  readonly message: string;
  readonly status: 400 | 401 | 403 | 404 | 409;
  readonly details?: Record<string, unknown>;
}

export type AccessResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AccessBoundaryError };

export function allowAccess<T>(value: T): AccessResult<T> {
  return { ok: true, value };
}

export function denyAccess(
  code: AccessErrorCode,
  message: string,
  status: AccessBoundaryError["status"] = 403,
  details?: Record<string, unknown>,
): AccessResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      status,
      details,
    },
  };
}
