export interface LedgerHistoryBalanceRow {
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

export interface LedgerHistoryEntryRow {
  readonly id: string;
  readonly account_type: string;
  readonly amount: number | string;
  readonly currency_code: string;
  readonly entry_type: string;
  readonly source_domain: string;
  readonly source_action: string;
  readonly source_id: string | null;
  readonly created_by_type: string;
  readonly created_at: string;
}

export interface LedgerHistoryReadRepository {
  readHistory(scope: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly limit: number;
  }): Promise<{
    readonly balances: readonly LedgerHistoryBalanceRow[];
    readonly entries: readonly LedgerHistoryEntryRow[];
  }>;
}
