import type { PlayerSessionRepository } from "../auth/playerAccess";
import type { PlayerSessionRecord } from "../auth/types";
import {
  normalizeQueryRows,
  type SupabaseRepositoryClient,
} from "./queryResult";
import {
  mapPlayerSessionRow,
  type CoreSupabaseTables,
} from "./tableTypes";

type PlayerSessionRepositoryTables = Pick<CoreSupabaseTables, "player_sessions">;

export type SupabasePlayerSessionRepositoryClient =
  SupabaseRepositoryClient<PlayerSessionRepositoryTables>;

export const PLAYER_SESSIONS_ACCESS_COLUMNS =
  "id,game_session_id,player_id,session_token_hash,status,created_at,updated_at,expires_at,revoked_at";

export function createSupabasePlayerSessionRepository(
  client: SupabasePlayerSessionRepositoryClient,
): PlayerSessionRepository {
  return {
    findPlayerSessionsByTokenHash: (sessionTokenHash) =>
      findPlayerSessionsByTokenHash(client, sessionTokenHash),
  };
}

export async function findPlayerSessionsByTokenHash(
  client: SupabasePlayerSessionRepositoryClient,
  sessionTokenHash: string,
): Promise<ReadonlyArray<PlayerSessionRecord>> {
  const response = await client
    .from("player_sessions")
    .select(PLAYER_SESSIONS_ACCESS_COLUMNS)
    .eq("session_token_hash", sessionTokenHash)
    .limit(2);
  const rows = normalizeQueryRows(response, {
    tableName: "player_sessions",
    operation: "find by session_token_hash",
  });

  return rows.map(mapPlayerSessionRow);
}
