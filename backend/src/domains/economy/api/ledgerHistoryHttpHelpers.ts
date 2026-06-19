import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";

export function readLedgerHistoryLimitQuery(value: string | null): number {
  const rawLimit = value?.trim();

  if (!rawLimit) {
    return 50;
  }

  if (!/^\d+$/.test(rawLimit)) {
    throw new EdgeActivationError(
      "invalid_ledger_limit",
      "limit must be a positive integer.",
      400,
    );
  }

  const limit = Number.parseInt(rawLimit, 10);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new EdgeActivationError(
      "invalid_ledger_limit",
      "limit must be between 1 and 100.",
      400,
    );
  }

  return limit;
}
