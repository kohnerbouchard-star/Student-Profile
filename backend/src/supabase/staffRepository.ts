import type { StaffAccessRepository } from "../auth/staffAccess.ts";
import type { GameSessionRecord, StaffUserRecord, UUID } from "../auth/types.ts";
import {
  normalizeMaybeQueryRow,
  normalizeRequiredQueryRow,
  type SupabaseRepositoryClient,
} from "./queryResult.ts";
import {
  mapGameSessionRow,
  mapStaffUserRow,
  type CoreSupabaseTables,
  type StaffUserInsert,
} from "./tableTypes.ts";

type StaffRepositoryTables = Pick<
  CoreSupabaseTables,
  "staff_users" | "game_sessions"
>;

export type SupabaseStaffRepositoryClient =
  SupabaseRepositoryClient<StaffRepositoryTables>;

export interface SupabaseStaffRepository extends StaffAccessRepository {
  createStaffUser(input: StaffUserInsert): Promise<StaffUserRecord>;
}

export const STAFF_USERS_ACCESS_COLUMNS =
  "id,supabase_auth_user_id,email,display_name,created_at,updated_at";

export const GAME_SESSIONS_ACCESS_COLUMNS =
  "id,owner_staff_user_id,name,status,game_join_code_hash,game_join_code_status,created_at,updated_at";

export function createSupabaseStaffRepository(
  client: SupabaseStaffRepositoryClient,
): SupabaseStaffRepository {
  return {
    findStaffUserBySupabaseAuthUserId: (supabaseAuthUserId) =>
      findStaffUserBySupabaseAuthUserId(client, supabaseAuthUserId),
    findGameSessionById: (gameSessionId) =>
      findGameSessionById(client, gameSessionId),
    createStaffUser: (input) => createStaffUser(client, input),
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

export async function createStaffUser(
  client: SupabaseStaffRepositoryClient,
  input: StaffUserInsert,
): Promise<StaffUserRecord> {
  const response = await client
    .from("staff_users")
    .insert(input)
    .select(STAFF_USERS_ACCESS_COLUMNS)
    .single();
  const row = normalizeRequiredQueryRow(response, {
    tableName: "staff_users",
    operation: "create staff user",
  });

  return mapStaffUserRow(row);
}
