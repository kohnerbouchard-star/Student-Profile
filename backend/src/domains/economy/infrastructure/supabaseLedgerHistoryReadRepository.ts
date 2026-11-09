import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { LedgerHistoryBalanceRow, LedgerHistoryEntryRow, LedgerHistoryReadRepository } from "../contracts/ledgerHistoryReadRepository.ts";

export class SupabaseLedgerHistoryReadRepository implements LedgerHistoryReadRepository {
  constructor(private readonly serviceClient: EdgeSupabaseClient) {}

  async readHistory(scope: { readonly gameSessionId: string; readonly playerId: string; readonly limit: number }) {
    // Preserve the original serial reads: a balance failure must prevent the ledger query.
    const balances = await this.serviceClient
      .from("account_balances")
      .select("account_type,balance,currency_code")
      .eq("game_session_id", scope.gameSessionId)
      .eq("player_id", scope.playerId)
      .order("account_type", { ascending: true });
    if (balances.error) throw new Error("ledger_history_read_failed");

    const entries = await this.serviceClient
      .from("ledger_entries")
      .select("id,account_type,amount,currency_code,entry_type,source_domain,source_action,source_id,created_by_type,created_at")
      .eq("game_session_id", scope.gameSessionId)
      .eq("player_id", scope.playerId)
      .order("created_at", { ascending: false })
      .limit(scope.limit);
    if (entries.error) throw new Error("ledger_history_read_failed");

    // Decimal text remains untouched here; each audience owns its existing HTTP projection.
    return {
      balances: (balances.data ?? []) as unknown as readonly LedgerHistoryBalanceRow[],
      entries: (entries.data ?? []) as unknown as readonly LedgerHistoryEntryRow[],
    };
  }
}
