import type {
  IdempotentStaffLedgerAdjustmentInput,
  IdempotentStaffLedgerAdjustmentResult,
} from "../services/idempotentStaffLedgerAdjustment.ts";

export interface AuthorizedStaffLedgerAdjustment {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly staffUserId: string;
  readonly idempotencyKey: string;
  readonly accountType: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly reason: string;
}

export function adjustLedgerForAuthorizedStaff(
  input: AuthorizedStaffLedgerAdjustment,
  recordAdjustment: (
    input: IdempotentStaffLedgerAdjustmentInput,
  ) => Promise<IdempotentStaffLedgerAdjustmentResult>,
): Promise<IdempotentStaffLedgerAdjustmentResult> {
  // Authorization, player checks and rounding have already run in the HTTP boundary.
  // Keep one existing atomic command: its fingerprint includes this exact provenance.
  return recordAdjustment({
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
    staffUserId: input.staffUserId,
    routeKey: "staff.players.ledger_adjustment",
    idempotencyKey: input.idempotencyKey,
    accountType: input.accountType,
    amount: input.amount,
    currencyCode: input.currencyCode,
    entryType: input.amount > 0 ? "credit" : "debit",
    sourceDomain: "ledger",
    sourceAction: "staff_player_balance_adjustment",
    sourceId: null,
    auditMetadata: {
      requestId: input.idempotencyKey,
      reason: input.reason,
      source: "classroom_api_edge_staff_ledger_adjustment",
    },
  });
}
