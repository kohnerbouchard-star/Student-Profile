import type { JsonValue } from "../../../supabase/tableTypes.ts";
import { isRecord, readBalanceNumber } from "../../../platform/supabase/edgeParsing.ts";
import type {
  ContractRewardLedgerWriter,
  ContractRewardAtomicApplyInput,
  ContractRewardAtomicApplyResult,
  ContractCashRewardWriteInput,
  ContractRewardWriteResult,
  ContractRewardResult,
} from "./contractRewardService.ts";

export class ContractRewardLedgerRpcWriter
  implements ContractRewardLedgerWriter {
  constructor(private readonly client: ContractRewardRpcClient) {}

  async applyRewardPlanAtomically(
    input: ContractRewardAtomicApplyInput,
  ): Promise<ContractRewardAtomicApplyResult> {
    const response = await this.client.rpc<unknown[]>(
      "apply_contract_rewards_atomic_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_contract_id: input.contractId,
        p_progress_id: input.progressId,
        p_staff_user_id: input.staffId,
        p_request_id: input.requestId,
      },
    );

    if (response.error) {
      throw new Error(
        response.error.message || "Contract reward plan failed.",
      );
    }

    const row = readAtomicRewardRpcRow(response.data);
    if (!row) {
      throw new Error("Contract reward plan returned no result.");
    }

    return row;
  }

  async recordCashReward(
    input: ContractCashRewardWriteInput,
  ): Promise<ContractRewardWriteResult> {
    const response = await this.client.rpc<unknown[]>(
      "record_player_ledger_entry",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
        p_account_type: input.accountType,
        p_amount: input.amount,
        p_currency_code: input.currencyCode,
        p_entry_type: "credit",
        p_source_domain: "contracts",
        p_source_action: "contract_reward_cash",
        p_source_id: input.progressId,
        p_created_by_type: "staff_user",
        p_created_by_id: input.staffId,
        p_audit_metadata: {
          requestId: input.requestId,
          contractId: input.contractId,
          progressId: input.progressId,
          rewardIssuedAt: input.issuedAt,
          source: "classroom_api_edge_contract_reward",
        },
      },
    );

    if (response.error) {
      throw new Error(response.error.message || "Contract cash reward failed.");
    }

    const row = readLedgerRpcRow(response.data);

    if (!row) {
      throw new Error("Contract cash reward returned no ledger entry.");
    }

    return {
      id: row.ledger_entry_id,
      accountType: canonicalPersonalAccountType(row.account_type),
      balance: readBalanceNumber(row.balance),
      currencyCode: row.currency_code,
      createdAt: row.created_at,
    };
  }
}

interface ContractRewardRpcClient {
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

function readAtomicRewardRpcRow(
  value: unknown,
): ContractRewardAtomicApplyResult | null {
  if (!Array.isArray(value) || !isRecord(value[0])) {
    return null;
  }

  const row = value[0];
  if (
    typeof row.reward_applied !== "boolean" ||
    typeof row.already_applied !== "boolean" ||
    typeof row.applied_at !== "string" ||
    !isRecord(row.reward_result) ||
    !isJsonValue(row.reward_result)
  ) {
    return null;
  }

  return {
    rewardApplied: row.reward_applied,
    alreadyApplied: row.already_applied,
    appliedAt: row.applied_at,
    rewardResult: row.reward_result as unknown as ContractRewardResult,
  };
}

export function canonicalPersonalAccountType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cash" || normalized === "checking") return "checking";
  return normalized;
}

function readLedgerRpcRow(value: unknown): LedgerRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.ledger_entry_id !== "string" ||
    typeof row.account_type !== "string" ||
    typeof row.currency_code !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  if (
    typeof row.balance !== "number" &&
    typeof row.balance !== "string"
  ) {
    return null;
  }

  return {
    ledger_entry_id: row.ledger_entry_id,
    account_type: row.account_type,
    balance: row.balance,
    currency_code: row.currency_code,
    created_at: row.created_at,
  };
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}
