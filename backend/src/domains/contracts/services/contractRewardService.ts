import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import {
  isRecord,
  readBalanceNumber,
} from "../../../platform/supabase/edgeParsing.ts";

export interface ContractRewardIssueInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly playerId: string;
  readonly rewardPayload: JsonObject;
  readonly issuedAt: string;
  readonly staffId: string;
  readonly requestId: string;
  readonly ledger: ContractRewardLedgerWriter;
}

export interface ContractRewardLedgerWriter {
  recordCashReward(
    input: ContractCashRewardWriteInput,
  ): Promise<ContractRewardWriteResult>;
}

export interface ContractCashRewardWriteInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly playerId: string;
  readonly amount: number;
  readonly accountType: string;
  readonly currencyCode: string;
  readonly staffId: string;
  readonly requestId: string;
  readonly issuedAt: string;
}

export interface ContractRewardWriteResult {
  readonly id: string;
  readonly accountType?: string;
  readonly amount?: number;
  readonly balance?: number;
  readonly currencyCode?: string;
  readonly createdAt?: string;
}

export type ContractRewardIssueServiceResult =
  | {
    readonly ok: true;
    readonly rewardResult: ContractRewardResult;
  }
  | {
    readonly ok: false;
    readonly code:
      | "unsupported_reward_type"
      | "invalid_reward_payload"
      | "contract_reward_issue_failed";
    readonly message: string;
    readonly rewardResult: ContractRewardResult;
  };

export interface ContractRewardResult {
  readonly status: "applied" | "skipped" | "failed" | "unsupported";
  readonly appliedRewards: readonly ContractRewardAppliedEntry[];
  readonly skippedRewards: readonly ContractRewardSkippedEntry[];
  readonly failedRewards: readonly ContractRewardFailedEntry[];
  readonly unsupportedRewardTypes: readonly string[];
}

export interface ContractRewardAppliedEntry {
  readonly rewardType: "cash";
  readonly ledgerEntryId: string;
  readonly amount: number;
  readonly accountType: string;
  readonly currencyCode: string;
  readonly balance: number | null;
}

export interface ContractRewardSkippedEntry {
  readonly rewardType: string;
  readonly reason: string;
}

export interface ContractRewardFailedEntry {
  readonly rewardType: string;
  readonly errorMessage: string;
}

type ContractRewardPlanFailure = {
  readonly ok: false;
  readonly code:
    | "unsupported_reward_type"
    | "invalid_reward_payload"
    | "contract_reward_issue_failed";
  readonly message: string;
  readonly rewardResult: ContractRewardResult;
};

type ContractRewardPlanResult =
  | {
    readonly ok: true;
    readonly cashReward: {
      readonly amount: number;
      readonly accountType: string;
      readonly currencyCode: string;
    } | null;
  }
  | ContractRewardPlanFailure;

export class ContractRewardLedgerRpcWriter
  implements ContractRewardLedgerWriter {
  constructor(private readonly client: ContractRewardRpcClient) {}

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
      accountType: row.account_type,
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

export async function issueContractRewards(
  input: ContractRewardIssueInput,
): Promise<ContractRewardIssueServiceResult> {
  const validation = readRewardPlan(input.rewardPayload);

  if (!validation.ok) {
    return validation;
  }

  const appliedRewards: ContractRewardAppliedEntry[] = [];

  try {
    if (validation.cashReward) {
      const ledgerResult = await input.ledger.recordCashReward({
        gameSessionId: input.gameSessionId,
        contractId: input.contractId,
        progressId: input.progressId,
        playerId: input.playerId,
        amount: validation.cashReward.amount,
        accountType: validation.cashReward.accountType,
        currencyCode: validation.cashReward.currencyCode,
        staffId: input.staffId,
        requestId: input.requestId,
        issuedAt: input.issuedAt,
      });

      appliedRewards.push({
        rewardType: "cash",
        ledgerEntryId: ledgerResult.id,
        amount: validation.cashReward.amount,
        accountType: ledgerResult.accountType ??
          validation.cashReward.accountType,
        currencyCode: ledgerResult.currencyCode ??
          validation.cashReward.currencyCode,
        balance: ledgerResult.balance ?? null,
      });
    }
  } catch (error) {
    return {
      ok: false,
      code: "contract_reward_issue_failed",
      message: "Contract reward could not be issued.",
      rewardResult: {
        status: "failed",
        appliedRewards,
        skippedRewards: [],
        failedRewards: [{
          rewardType: "cash",
          errorMessage: error instanceof Error ? error.message : String(error),
        }],
        unsupportedRewardTypes: [],
      },
    };
  }

  return {
    ok: true,
    rewardResult: {
      status: appliedRewards.length === 0 ? "skipped" : "applied",
      appliedRewards,
      skippedRewards: appliedRewards.length === 0
        ? [{ rewardType: "none", reason: "No reward payload was configured." }]
        : [],
      failedRewards: [],
      unsupportedRewardTypes: [],
    },
  };
}

export function alreadyIssuedRewardResult(): ContractRewardResult {
  return {
    status: "skipped",
    appliedRewards: [],
    skippedRewards: [{
      rewardType: "all",
      reason: "Rewards were already issued for this progress row.",
    }],
    failedRewards: [],
    unsupportedRewardTypes: [],
  };
}

function readRewardPlan(
  rewardPayload: JsonObject,
): ContractRewardPlanResult {
  const unsupportedRewardTypes = Object.keys(rewardPayload)
    .filter((key) => key !== "cash")
    .sort();

  if (unsupportedRewardTypes.length > 0) {
    return {
      ok: false,
      code: "unsupported_reward_type",
      message: "Contract reward payload contains unsupported reward types.",
      rewardResult: {
        status: "unsupported",
        appliedRewards: [],
        skippedRewards: [],
        failedRewards: [],
        unsupportedRewardTypes,
      },
    };
  }

  if (!("cash" in rewardPayload) || rewardPayload.cash === null) {
    return {
      ok: true,
      cashReward: null,
    };
  }

  const cash = rewardPayload.cash;

  if (!isRecord(cash) || !isJsonValue(cash)) {
    return invalidRewardPayload("cash reward must be a JSON object.");
  }

  const amount = typeof cash.amount === "number"
    ? cash.amount
    : Number(cash.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return invalidRewardPayload("cash.amount must be a positive number.");
  }

  const currencyCode = typeof cash.currencyCode === "string"
    ? cash.currencyCode.trim().toUpperCase()
    : "ECO";

  if (!/^[A-Z0-9]{3,16}$/.test(currencyCode)) {
    return invalidRewardPayload(
      "cash.currencyCode must be 3 to 16 uppercase letters or numbers.",
    );
  }

  const accountType = typeof cash.accountType === "string"
    ? cash.accountType.trim()
    : "cash";

  if (!accountType) {
    return invalidRewardPayload("cash.accountType must be non-empty text.");
  }

  return {
    ok: true,
    cashReward: {
      amount: Math.round(amount * 100) / 100,
      accountType,
      currencyCode,
    },
  };
}

function invalidRewardPayload(message: string): ContractRewardPlanFailure {
  return {
    ok: false,
    code: "invalid_reward_payload",
    message,
    rewardResult: {
      status: "failed",
      appliedRewards: [],
      skippedRewards: [],
      failedRewards: [{ rewardType: "cash", errorMessage: message }],
      unsupportedRewardTypes: [],
    },
  };
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

function isJsonValue(value: unknown): value is JsonValue {
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
