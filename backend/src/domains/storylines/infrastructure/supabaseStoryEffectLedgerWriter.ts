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

interface StoryCashAdjustmentRpcRow {
  readonly adjustment_outcome: "applied" | "replayed" | string;
  readonly adjustment_id: string;
  readonly ledger_entry_id: string;
  readonly currency_code: string;
  readonly balance: number | string;
}

export class SupabaseStoryEffectLedgerWriter
  implements StoryEffectLedgerWriter {
  constructor(private readonly client: StoryEffectLedgerRpcClient) {}

  async recordCashAdjustment(
    input: StoryCashAdjustmentWriteInput,
  ): Promise<StoryWriteResult> {
    const response = await this.client.rpc<unknown[]>(
      "apply_story_cash_adjustment_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
        p_storyline_event_id: input.storylineEventId,
        p_effect_type: input.effectType,
        p_amount: input.amount,
        p_signed_amount: input.signedAmount,
        p_label: input.label,
        p_reason: input.reason,
        p_payload: input.payload,
        p_idempotency_key: input.idempotencyKey,
      },
    );

    if (response.error) {
      throw new Error(
        response.error.message || "Storyline cash adjustment failed.",
      );
    }

    const row = readCashAdjustmentRpcRow(response.data);

    if (!row) {
      throw new Error("Storyline cash adjustment returned no ledger entry.");
    }

    return {
      id: row.ledger_entry_id,
    };
  }
}

function readCashAdjustmentRpcRow(
  value: unknown,
): StoryCashAdjustmentRpcRow | null {
  const row = Array.isArray(value) ? value[0] : value;

  if (!isRecord(row)) {
    return null;
  }

  if (
    (row.adjustment_outcome !== "applied" &&
      row.adjustment_outcome !== "replayed") ||
    typeof row.adjustment_id !== "string" ||
    typeof row.ledger_entry_id !== "string" ||
    typeof row.currency_code !== "string" ||
    !isBalanceValue(row.balance)
  ) {
    return null;
  }

  return {
    adjustment_outcome: row.adjustment_outcome,
    adjustment_id: row.adjustment_id,
    ledger_entry_id: row.ledger_entry_id,
    currency_code: row.currency_code,
    balance: readBalanceNumber(row.balance),
  };
}

function isBalanceValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
