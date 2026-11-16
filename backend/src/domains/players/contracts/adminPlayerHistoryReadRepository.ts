/** Staff-only read projection. Scope is derived by the authorized Admin route. */
export interface AdminPlayerHistoryScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}
export interface AdminPlayerHistoryRow {
  readonly [key: string]: unknown;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly corrected_at?: string;
  readonly clocked_in_at?: string;
}
export interface AdminPlayerHistoryRecords {
  readonly player: AdminPlayerHistoryRow;
  readonly auditLogs: readonly AdminPlayerHistoryRow[];
  readonly ledgerEntries: readonly AdminPlayerHistoryRow[];
  readonly attendance: readonly AdminPlayerHistoryRow[];
  readonly contractProgress: readonly AdminPlayerHistoryRow[];
  readonly sessions: readonly AdminPlayerHistoryRow[];
  readonly flags: readonly AdminPlayerHistoryRow[];
  readonly settings: unknown;
}
export interface AdminPlayerHistoryReadRepository {
  readHistory(
    scope: AdminPlayerHistoryScope,
  ): Promise<AdminPlayerHistoryRecords | null>;
}
