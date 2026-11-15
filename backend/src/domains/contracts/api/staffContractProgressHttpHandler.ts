/// <reference lib="dom" />
import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
} from "../contracts/contractRepositoryContracts.ts";
import {
  type StaffContractProgressListResponseBody,
  type StaffContractProgressReviewResponseBody,
  toPlayerContractProgressDto,
  toStaffContractSummaryDto,
} from "../contracts/contractHttpContracts.ts";
import {
  readOptionalJsonObject,
  readProgressListFilters,
  readRequiredJsonObjectBody,
  readReviewAction,
  rejectClientSuppliedReviewAuthority,
  reviewActionToStatus,
} from "./staffContractRequestParser.ts";

export async function listStaffContractProgress(
  request: Request,
  gameSessionId: string,
  contractId: string,
  repository: ContractRepository,
): Promise<Response> {
  const contract = await readRequiredContract(
    repository,
    gameSessionId,
    contractId,
  );
  const filters = readProgressListFilters(new URL(request.url));
  const progress = await repository.listContractProgressForStaff({
    gameSessionId,
    contractId,
    statuses: filters.statuses,
    playerId: filters.playerId,
  });

  return jsonResponse<StaffContractProgressListResponseBody>(200, {
    ok: true,
    contract: toStaffContractSummaryDto(contract),
    progress: progress.map(toPlayerContractProgressDto),
  });
}

export async function reviewStaffContractProgress(
  request: Request,
  gameSessionId: string,
  contractId: string,
  progressId: string,
  repository: ContractRepository,
  reviewedAt: string,
): Promise<Response> {
  const body = await readRequiredJsonObjectBody(request);
  rejectClientSuppliedReviewAuthority(body);

  if (body.issueRewardNow === true) {
    throw new EdgeActivationError(
      "issue_reward_now_not_supported",
      "Use the contract rewards issue route after approving progress.",
      400,
    );
  }

  const action = readReviewAction(body.action);
  const resultPayload = readOptionalJsonObject(
    body.resultPayload,
    "resultPayload",
  );
  const [contract, existingProgress] = await Promise.all([
    readRequiredContract(repository, gameSessionId, contractId),
    repository.getContractProgressById({
      gameSessionId,
      contractId,
      progressId,
    }),
  ]);

  if (!existingProgress) {
    return jsonError(404, {
      code: "contract_progress_not_found",
      message: "Contract progress was not found for this contract.",
      retryable: false,
    });
  }

  if (existingProgress.rewardIssuedAt !== null) {
    return jsonError(409, {
      code: "contract_reward_already_issued",
      message: "Contract progress cannot be reviewed after rewards are issued.",
      retryable: false,
    });
  }

  const updated = await repository.reviewPlayerContractProgress({
    gameSessionId,
    contractId,
    progressId,
    status: reviewActionToStatus(action),
    resultPayload,
    completedAt: action === "approve" ? reviewedAt : undefined,
  });

  if (!updated) {
    return jsonError(404, {
      code: "contract_progress_not_found",
      message: "Contract progress was not found for this contract.",
      retryable: false,
    });
  }

  return jsonResponse<StaffContractProgressReviewResponseBody>(200, {
    ok: true,
    contract: toStaffContractSummaryDto(contract),
    progress: toPlayerContractProgressDto(updated),
  });
}

export async function readRequiredContract(
  repository: ContractRepository,
  gameSessionId: string,
  contractId: string,
): Promise<GameSessionContractRecord> {
  const contract = await repository.getGameSessionContractById({
    gameSessionId,
    contractId,
  });

  if (!contract) {
    throw new EdgeActivationError(
      "contract_not_found",
      "Contract was not found for this game session.",
      404,
      false,
    );
  }

  return contract;
}
