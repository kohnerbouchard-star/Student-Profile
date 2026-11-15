import {
  findPlayer,
} from "./playerOperationSupport.ts";


export async function loadPlayerHistoryAudit(
  service: any,
  gameSessionId: string,
  playerId: string,
): Promise<any> {
  const player = await findPlayer(service, gameSessionId, playerId);
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
    ).eq("player_id", playerId).order("created_at", { ascending: false }).limit(
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
    ).eq("player_id", playerId).order("updated_at", { ascending: false }).limit(
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
    ).eq("player_id", playerId).order("created_at", { ascending: false }).limit(
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

  const timeline = [
    ...(auditResult.data || []).map((row: any) => ({
      type: "audit",
      at: row.created_at,
      data: row,
    })),
    ...(ledgerResult.data || []).map((row: any) => ({
      type: "ledger",
      at: row.created_at,
      data: row,
    })),
    ...(attendanceResult.data || []).map((row: any) => ({
      type: "attendance",
      at: row.corrected_at || row.clocked_in_at || row.created_at,
      data: row,
    })),
    ...(contractsResult.data || []).map((row: any) => ({
      type: "contract",
      at: row.updated_at || row.created_at,
      data: row,
    })),
    ...(sessionsResult.data || []).map((row: any) => ({
      type: "session",
      at: row.updated_at || row.created_at,
      data: row,
    })),
    ...(flagsResult.data || []).map((row: any) => ({
      type: "flag",
      at: row.created_at,
      data: row,
    })),
  ].sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));

  return {
    player,
    timeline,
    auditLogs: auditResult.data || [],
    ledgerEntries: ledgerResult.data || [],
    attendance: attendanceResult.data || [],
    contractProgress: contractsResult.data || [],
    sessions: sessionsResult.data || [],
    flags: flagsResult.data || [],
    settings: settingsResult.data?.settings || {},
  };
}
