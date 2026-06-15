import {
  normalizeRequiredQueryRow,
  type SupabaseRepositoryClient,
} from "./queryResult";
import {
  normalizeAuditLogInsert,
  type AuditLogInsert,
  type AuditLogRow,
  type CoreSupabaseTables,
} from "./tableTypes";

type AuditRepositoryTables = Pick<CoreSupabaseTables, "audit_log">;

export type SupabaseAuditRepositoryClient =
  SupabaseRepositoryClient<AuditRepositoryTables>;

export interface AuditRepository {
  writeAuditLogEntry(entry: AuditLogInsert): Promise<AuditLogRow>;
}

export const AUDIT_LOG_ACCESS_COLUMNS =
  "id,game_session_id,actor_type,actor_id,action,target_type,target_id,metadata,created_at";

export function createSupabaseAuditRepository(
  client: SupabaseAuditRepositoryClient,
): AuditRepository {
  return {
    writeAuditLogEntry: (entry) => writeAuditLogEntry(client, entry),
  };
}

export async function writeAuditLogEntry(
  client: SupabaseAuditRepositoryClient,
  entry: AuditLogInsert,
): Promise<AuditLogRow> {
  const response = await client
    .from("audit_log")
    .insert(normalizeAuditLogInsert(entry))
    .select(AUDIT_LOG_ACCESS_COLUMNS)
    .single();

  return normalizeRequiredQueryRow(response, {
    tableName: "audit_log",
    operation: "insert audit log entry",
  });
}
