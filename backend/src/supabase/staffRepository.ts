import type { StaffAccessRepository } from "../auth/staffAccess";
import type { GameSessionRecord, StaffUserRecord, UUID } from "../auth/types";
import {
  normalizeMaybeQueryRow,
  type SupabaseRepositoryClient,
} from "./queryResult";
import {
  mapGameSessionRow,
  mapStaffUserRow,
  type CoreSupabaseTables,
} from "./tableTypes";

type StaffRepositoryTables = Pick<
  CoreSupabaseTables,
  "staff_users" | "game_sessions"
>;

export type SupabaseStaffRepositoryClient =
  SupabaseRepositoryClient<StaffRepositoryTables>;

export const STAFF_USERS_ACCESS_COLUMNS =
  "id,supabase_auth_user_id,email,display_name,created_at,updated_at";

export const GAME_SESSIONS_ACCESS_COLUMNS =
  "id,owner_staff_user_id,name,status,game_join_code_hash,game_join_code_status,created_at,updated_at";

export function createSupabaseStaffRepository(
  client: SupabaseStaffRepositoryClient,
): StaffAccessRepository {
  return {
    findStaffUserBySupabaseAuthUserId: (supabaseAuthUserId) =>
      findStaffUserBySupabaseAuthUserId(client, supabaseAuthUserId),
    findGameSessionById: (gameSessionId) =>
      findGameSessionById(client, gameSessionId),
  };
}

export async function findStaffUserBySupabaseAuthUserId(
  client: SupabaseStaffRepositoryClient,
  supabaseAuthUserId: UUID,
): Promise<StaffUserRecord | null> {
  const response = await client
    .from("staff_users")
    .select(STAFF_USERS_ACCESS_COLUMNS)
    .eq("supabase_auth_user_id", supabaseAuthUserId)
    .maybeSingle();
  const row = normalizeMaybeQueryRow(response, {
    tableName: "staff_users",
    operation: "find by supabase_auth_user_id",
  });

  return row ? mapStaffUserRow(row) : null;
}

export async function findGameSessionById(
  client: SupabaseStaffRepositoryClient,
  gameSessionId: UUID,
): Promise<GameSessionRecord | null> {
  const response = await client
    .from("game_sessions")
    .select(GAME_SESSIONS_ACCESS_COLUMNS)
    .eq("id", gameSessionId)
    .maybeSingle();
  const row = normalizeMaybeQueryRow(response, {
    tableName: "game_sessions",
    operation: "find by id",
  });

  return row ? mapGameSessionRow(row) : null;
}
