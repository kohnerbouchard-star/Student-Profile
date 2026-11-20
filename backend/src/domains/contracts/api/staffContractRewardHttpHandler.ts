/// <reference lib="dom" />
import {
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";
import {
  type StaffContractRewardIssueResponseBody,
  toPlayerContractProgressDto,
  toStaffContractSummaryDto,
} from "../contracts/contractHttpContracts.ts";
import {
  alreadyIssuedRewardResult,
  type ContractRewardLedgerWriter,
  issueContractRewards,
} from "../services/contractRewardService.ts";
import { readRequiredContract } from "./staffContractProgressHttpHandler.ts";

export async function issueStaffContractRewards(input: {
  readonly request: Request;
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly staffId: string;
  readonly repository: ContractRepository;
  readonly rewardLedgerWriter: ContractRewardLedgerWriter;
  readonly issuedAt: string;
}): Promise<Response> {
  const [contract, progress] = await Promise.all([
    readRequiredContract(
      input.repository,
      input.gameSessionId,
      input.contractId,
    ),
    input.repository.getContractProgressById({
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      progressId: input.progressId,
    }),
  ]);

  if (!progress) {
    return jsonError(404, {
      code: "contract_progress_not_found",
      message: "Contract progress was not found for this contract.",
      retryable: false,
    });
  }

  if (progress.rewardIssuedAt !== null) {
    return rewardIssueResponse({
      rewardIssued: false,
      alreadyIssued: true,
      contract,
      progress,
      rewardResult: alreadyIssuedRewardResult(),
    });
  }

  if (progress.status !== "completed") {
    return jsonError(409, {
      code: "contract_progress_not_completed",
      message: "Only completed contract progress can receive rewards.",
      retryable: false,
    });
  }

  const rewardResult = await issueContractRewards({
    gameSessionId: input.gameSessionId,
    contractId: input.contractId,
    progressId: input.progressId,
    playerId: progress.playerId,
    rewardPayload: contract.rewardPayload,
    issuedAt: input.issuedAt,
    staffId: input.staffId,
    requestId: buildContractRewardIdempotencyKey({
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      progressId: input.progressId,
    }),
    ledger: input.rewardLedgerWriter,
  });

  if (rewardResult.ok !== true) {
    return jsonError(
      rewardResult.code === "contract_reward_issue_failed" ? 500 : 400,
      {
        code: rewardResult.code,
        message: rewardResult.message,
        retryable: false,
      },
    );
  }

  const updatedProgress = await input.repository.markContractRewardIssued({
    gameSessionId: input.gameSessionId,
    contractId: input.contractId,
    progressId: input.progressId,
    rewardIssuedAt: input.issuedAt,
  });

  if (!updatedProgress) {
    const latestProgress = await input.repository.getContractProgressById({
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      progressId: input.progressId,
    });

    if (latestProgress && latestProgress.rewardIssuedAt !== null) {
      return rewardIssueResponse({
        rewardIssued: false,
        alreadyIssued: true,
        contract,
        progress: latestProgress,
        rewardResult: alreadyIssuedRewardResult(),
      });
    }

    return jsonError(409, {
      code: "contract_reward_mark_failed",
      message: "Contract reward was issued but progress could not be marked.",
      retryable: false,
    });
  }

  return rewardIssueResponse({
    rewardIssued: true,
    alreadyIssued: false,
    contract,
    progress: updatedProgress,
    rewardResult: rewardResult.rewardResult,
  });
}

function buildContractRewardIdempotencyKey(input: {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
}): string {
  return [
    "contract_reward",
    input.gameSessionId,
    input.contractId,
    input.progressId,
  ].join(":");
}

function rewardIssueResponse(input: {
  readonly rewardIssued: boolean;
  readonly alreadyIssued: boolean;
  readonly contract: GameSessionContractRecord;
  readonly progress: PlayerContractProgressRecord;
  readonly rewardResult: unknown;
}): Response {
  return jsonResponse<StaffContractRewardIssueResponseBody>(200, {
    ok: true,
    rewardIssued: input.rewardIssued,
    alreadyIssued: input.alreadyIssued,
    contract: toStaffContractSummaryDto(input.contract),
    progress: toPlayerContractProgressDto(input.progress),
    rewardResult: input.rewardResult as Record<string, unknown>,
  });
}
