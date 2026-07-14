import { number } from "./common.ts";

export async function loadContractSubmissions(
  service: any,
  gameId: string,
  contractId = "",
): Promise<any[]> {
  let query = service.from("player_contract_progress").select("*")
    .eq("game_session_id", gameId)
    .order("updated_at", { ascending: false });
  if (contractId) query = query.eq("contract_id", contractId);
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

export async function loadContractRewardAudit(
  service: any,
  gameId: string,
  contractId = "",
): Promise<any[]> {
  let progressQuery = service.from("player_contract_progress")
    .select("id,contract_id,player_id,status,reward_issued_at,updated_at")
    .eq("game_session_id", gameId)
    .order("updated_at", { ascending: false });
  if (contractId) progressQuery = progressQuery.eq("contract_id", contractId);
  const progressResult = await progressQuery;
  if (progressResult.error) throw progressResult.error;
  const progress: Array<Record<string, any>> = progressResult.data || [];
  if (!progress.length) return [];

  const ledgerResult = await service.from("ledger_entries")
    .select("id,player_id,amount,currency_code,entry_type,source_domain,source_action,source_id,created_at")
    .eq("game_session_id", gameId)
    .eq("source_domain", "contracts")
    .eq("source_action", "contract_reward_cash")
    .in("source_id", progress.map((row) => row.id))
    .order("created_at", { ascending: false });
  if (ledgerResult.error) throw ledgerResult.error;
  const progressById = new Map<string, Record<string, any>>(
    progress.map((row) => [String(row.id), row]),
  );
  return (ledgerResult.data || []).map((entry: any) => {
    const row = progressById.get(String(entry.source_id));
    return {
      id: entry.id,
      ledgerEntryId: entry.id,
      contractId: row?.contract_id || contractId || null,
      progressId: entry.source_id,
      playerId: entry.player_id,
      amount: number(entry.amount),
      currencyCode: entry.currency_code,
      entryType: entry.entry_type,
      sourceDomain: entry.source_domain,
      sourceAction: entry.source_action,
      rewardIssuedAt: row?.reward_issued_at || entry.created_at,
      createdAt: entry.created_at,
    };
  });
}

export async function loadMarketChart(
  service: any,
  gameId: string,
  assetId: string,
): Promise<any[]> {
  const ticks = await service.from("stock_price_ticks")
    .select("tick_index,price,previous_price,change_pct,volume,created_at")
    .eq("game_session_id", gameId)
    .eq("stock_asset_id", assetId)
    .order("tick_index", { ascending: true })
    .limit(500);
  if (ticks.error) throw ticks.error;
  return (ticks.data || []).map((row: any) => {
    const close = number(row.price);
    const open = number(row.previous_price, close);
    return {
      time: row.created_at,
      timestamp: row.created_at,
      close,
      open,
      high: Math.max(close, open),
      low: Math.min(close, open),
      volume: number(row.volume),
      changePct: number(row.change_pct),
    };
  });
}

export async function loadRelatedAuditRecord(
  service: any,
  gameId: string,
  auditLogId: string,
): Promise<any | null> {
  const auditResult = await service.from("audit_log").select("*")
    .eq("game_session_id", gameId).eq("id", auditLogId).maybeSingle();
  if (auditResult.error) throw auditResult.error;
  const audit = auditResult.data;
  if (!audit) return null;

  const tableByType: Record<string, string> = {
    player: "players",
    store_item: "store_items",
    game_session_contract: "game_session_contracts",
    player_contract_progress: "player_contract_progress",
    player_attendance_record: "player_attendance_records",
    ledger_entry: "ledger_entries",
    game_session: "game_sessions",
  };
  const table = tableByType[String(audit.target_type || "")];
  let related = null;
  if (table && audit.target_id) {
    const relatedResult = await service.from(table).select("*")
      .eq("id", audit.target_id).maybeSingle();
    if (relatedResult.error) throw relatedResult.error;
    related = relatedResult.data || null;
  }
  return { auditLog: audit, relatedRecord: related, relatedTable: table || null };
}
