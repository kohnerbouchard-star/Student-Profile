import type {
  AdminPlayerHistoryReadRepository,
  AdminPlayerHistoryScope,
} from "../contracts/adminPlayerHistoryReadRepository.ts";

export async function readAdminPlayerHistory(
  repository: AdminPlayerHistoryReadRepository,
  scope: AdminPlayerHistoryScope,
) {
  const records = await repository.readHistory(scope);
  if (!records) return null;
  const timeline = [
    ...(records.auditLogs || []).map((row) => ({
      type: "audit",
      at: row.created_at,
      data: row,
    })),
    ...(records.ledgerEntries || []).map((row) => ({
      type: "ledger",
      at: row.created_at,
      data: row,
    })),
    ...(records.attendance || []).map((row) => ({
      type: "attendance",
      at: row.corrected_at || row.clocked_in_at || row.created_at,
      data: row,
    })),
    ...(records.contractProgress || []).map((row) => ({
      type: "contract",
      at: row.updated_at || row.created_at,
      data: row,
    })),
    ...(records.sessions || []).map((row) => ({
      type: "session",
      at: row.updated_at || row.created_at,
      data: row,
    })),
    ...(records.flags || []).map((row) => ({
      type: "flag",
      at: row.created_at,
      data: row,
    })),
  ].sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));

  return {
    player: records.player,
    timeline,
    auditLogs: records.auditLogs,
    ledgerEntries: records.ledgerEntries,
    attendance: records.attendance,
    contractProgress: records.contractProgress,
    sessions: records.sessions,
    flags: records.flags,
    settings: records.settings,
  };
}
