import type {
  AdminPlayerHistoryReadRepository,
  AdminPlayerHistoryRecords,
  AdminPlayerHistoryRow,
  AdminPlayerHistoryScope,
} from "../contracts/adminPlayerHistoryReadRepository.ts";

interface QueryResult<T> {
  readonly data: T | null;
  readonly error: unknown;
}
interface HistoryQuery
  extends PromiseLike<QueryResult<readonly AdminPlayerHistoryRow[]>> {
  select(columns: string): HistoryQuery;
  eq(column: string, value: string): HistoryQuery;
  order(column: string, options: { ascending: boolean }): HistoryQuery;
  limit(count: number): HistoryQuery;
  maybeSingle(): PromiseLike<QueryResult<AdminPlayerHistoryRow>>;
}
export interface AdminPlayerHistoryClient {
  from(table: string): HistoryQuery;
}

/** Adapter for the staff history projection, never an economic write owner. */
export class SupabaseAdminPlayerHistoryReadRepository
  implements AdminPlayerHistoryReadRepository {
  constructor(private readonly service: AdminPlayerHistoryClient) {}
  async readHistory(
    { gameSessionId, playerId }: AdminPlayerHistoryScope,
  ): Promise<AdminPlayerHistoryRecords | null> {
    const service = this.service;
    const playerResult = await service.from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId).eq("id", playerId).maybeSingle();
    if (playerResult.error) throw playerResult.error;
    const player = playerResult.data || null;
    if (!player) return null;
    const [
      auditResult,
      ledgerResult,
      attendanceResult,
      contractsResult,
      sessionsResult,
      flagsResult,
      settingsResult,
    ] = await Promise.all([
      service.from("audit_log").select("*").eq("game_session_id", gameSessionId)
        .eq("target_id", playerId).order("created_at", { ascending: false })
        .limit(250),
      service.from("ledger_entries").select("*").eq(
        "game_session_id",
        gameSessionId,
      ).eq("player_id", playerId).order("created_at", { ascending: false })
        .limit(
          250,
        ),
      service.from("player_attendance_records").select("*").eq(
        "game_session_id",
        gameSessionId,
      ).eq("player_id", playerId).order("attendance_date", { ascending: false })
        .limit(250),
      service.from("player_contract_progress").select("*").eq(
        "game_session_id",
        gameSessionId,
      ).eq("player_id", playerId).order("updated_at", { ascending: false })
        .limit(
          250,
        ),
      service.from("player_sessions").select(
        "id,status,created_at,updated_at,expires_at,revoked_at",
      ).eq("game_session_id", gameSessionId).eq("player_id", playerId).order(
        "created_at",
        { ascending: false },
      ).limit(100),
      service.from("player_admin_flags").select("*").eq(
        "game_session_id",
        gameSessionId,
      ).eq("player_id", playerId).order("created_at", { ascending: false })
        .limit(
          100,
        ),
      service.from("player_admin_settings").select("*").eq(
        "game_session_id",
        gameSessionId,
      ).eq("player_id", playerId).maybeSingle(),
    ]);
    const error = auditResult.error || ledgerResult.error ||
      attendanceResult.error || contractsResult.error || sessionsResult.error ||
      flagsResult.error || settingsResult.error;
    if (error) throw error;

    return {
      player,
      auditLogs: auditResult.data || [],
      ledgerEntries: ledgerResult.data || [],
      attendance: attendanceResult.data || [],
      contractProgress: contractsResult.data || [],
      sessions: sessionsResult.data || [],
      flags: flagsResult.data || [],
      settings: settingsResult.data?.settings || {},
    };
  }
}
