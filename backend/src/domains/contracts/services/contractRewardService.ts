import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import { canonicalPersonalAccountType, isJsonValue } from "./contractRewardLedgerWriter.ts";
export { ContractRewardLedgerRpcWriter } from "./contractRewardLedgerWriter.ts";

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
  applyRewardPlanAtomically?(
    input: ContractRewardAtomicApplyInput,
  ): Promise<ContractRewardAtomicApplyResult>;
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

export interface ContractRewardAtomicApplyInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly staffId: string;
  readonly requestId: string;
}

export interface ContractRewardAtomicApplyResult {
  readonly rewardApplied: boolean;
  readonly alreadyApplied: boolean;
  readonly appliedAt: string;
  readonly rewardResult: ContractRewardResult;
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

export type ContractRewardAppliedEntry =
  | {
    readonly rewardType: "cash" | "checking";
    readonly ledgerEntryId: string;
    readonly amount: number;
    readonly accountType: string;
    readonly currencyCode: string;
    readonly balance: number | null;
  }
  | {
    readonly rewardType: "story_flag";
    readonly flagKey: string;
    readonly value: JsonValue;
  }
  | {
    readonly rewardType: "item";
    readonly storeItemId: string;
    readonly itemName: string;
    readonly quantity: number;
    readonly quantityOwned: number;
  };

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

export async function issueContractRewards(
  input: ContractRewardIssueInput,
): Promise<ContractRewardIssueServiceResult> {
  if (
    input.ledger.applyRewardPlanAtomically &&
    requiresAtomicRewardPlan(input.rewardPayload)
  ) {
    try {
      const atomicResult = await input.ledger.applyRewardPlanAtomically({
        gameSessionId: input.gameSessionId,
        contractId: input.contractId,
        progressId: input.progressId,
        staffId: input.staffId,
        requestId: input.requestId,
      });

      return {
        ok: true,
        rewardResult: atomicResult.rewardResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const normalized = errorMessage.toUpperCase();
      const code = normalized.includes("UNSUPPORTED_CONTRACT_REWARD_TYPES")
        ? "unsupported_reward_type"
        : normalized.includes("INVALID_CONTRACT") ||
            normalized.includes("AMBIGUOUS_CONTRACT") ||
            normalized.includes("CONTRACT_REWARD_STORY_FLAG") ||
            normalized.includes("CONTRACT_REWARD_IDEMPOTENCY_CONFLICT")
        ? "invalid_reward_payload"
        : "contract_reward_issue_failed";

      return {
        ok: false,
        code,
        message: code === "contract_reward_issue_failed"
          ? "Contract reward could not be issued."
          : errorMessage,
        rewardResult: {
          status: "failed",
          appliedRewards: [],
          skippedRewards: [],
          failedRewards: [{
            rewardType: "all",
            errorMessage,
          }],
          unsupportedRewardTypes: [],
        },
      };
    }
  }

  const validation = readRewardPlan(input.rewardPayload);

  if (validation.ok !== true) {
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
        accountType: canonicalPersonalAccountType(
          ledgerResult.accountType ?? validation.cashReward.accountType,
        ),
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

function requiresAtomicRewardPlan(rewardPayload: JsonObject): boolean {
  return Object.prototype.hasOwnProperty.call(rewardPayload, "checking") ||
    Object.prototype.hasOwnProperty.call(rewardPayload, "items") ||
    Object.prototype.hasOwnProperty.call(rewardPayload, "storyFlagsToSet");
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

  const rawAccountType = typeof cash.accountType === "string"
    ? cash.accountType.trim()
    : "checking";
  const accountType = canonicalPersonalAccountType(rawAccountType);

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
