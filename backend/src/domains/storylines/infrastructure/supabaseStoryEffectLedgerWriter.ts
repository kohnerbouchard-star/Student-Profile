import {
  isRecord,
  readBalanceNumber,
} from "../../../platform/supabase/edgeParsing.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryEffectLedgerWriter,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

interface StoryEffectLedgerRpcClient {
  rpc<Data = unknown>(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    readonly data: Data | null;
    readonly error: { readonly message: string } | null;
  }>;
}

interface LedgerRpcRow {
  readonly ledger_entry_id: string;
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
  readonly created_at: string;
}

export class SupabaseStoryEffectLedgerWriter
  implements StoryEffectLedgerWriter {
  constructor(private readonly client: StoryEffectLedgerRpcClient) {}

  async recordCashAdjustment(
    input: StoryCashAdjustmentWriteInput,
  ): Promise<StoryWriteResult> {
    const response = await this.client.rpc<unknown[]>(
      "record_player_ledger_entry",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
        p_account_type: "cash",
        p_amount: input.signedAmount,
        p_currency_code: "ECO",
        p_entry_type: input.effectType === "cash_credit" ? "credit" : "debit",
        p_source_domain: "storylines",
        p_source_action: input.effectType,
        p_source_id: input.storylineEventId,
        p_created_by_type: "system",
        p_created_by_id: null,
        p_audit_metadata: {
          idempotencyKey: input.idempotencyKey,
          storylineEventId: input.storylineEventId,
          effectType: input.effectType,
          label: input.label,
          reason: input.reason,
          amount: input.amount,
          signedAmount: input.signedAmount,
          payload: input.payload,
          source: "classroom_api_edge_storyline_effect",
        },
      },
    );

    if (response.error) {
      throw new Error(
        response.error.message || "Storyline cash adjustment failed.",
      );
    }

    const row = readLedgerRpcRow(response.data);

    if (!row) {
      throw new Error("Storyline cash adjustment returned no ledger entry.");
    }

    return {
      id: row.ledger_entry_id,
    };
  }
}

function readLedgerRpcRow(value: unknown): LedgerRpcRow | null {
  const row = Array.isArray(value) ? value[0] : value;

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.ledger_entry_id !== "string" ||
    typeof row.account_type !== "string" ||
    typeof row.currency_code !== "string" ||
    typeof row.created_at !== "string" ||
    !isBalanceValue(row.balance)
  ) {
    return null;
  }

  return {
    ledger_entry_id: row.ledger_entry_id,
    account_type: row.account_type,
    balance: readBalanceNumber(row.balance),
    currency_code: row.currency_code,
    created_at: row.created_at,
  };
}

function isBalanceValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
