import {
  contractErrorToResponse,
  reviewStaffContractProgress,
} from "../api/staffContractHttpHandler.ts";
import type { ContractRepository } from "../contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "../infrastructure/supabaseContractRepository.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";

export interface StaffContractReviewOperationInput {
  readonly request: Request;
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly reviewedAt: string;
}

export interface StaffContractReviewOperationDependencies {
  readonly createRepository?: (serviceClient: EdgeSupabaseClient) => ContractRepository;
}

/** Thin local composition over the existing Staff review authority. */
export async function executeStaffContractReviewOperation(
  serviceClient: EdgeSupabaseClient,
  input: StaffContractReviewOperationInput,
  dependencies: StaffContractReviewOperationDependencies = {},
): Promise<Response> {
  const repository = dependencies.createRepository
    ? dependencies.createRepository(serviceClient)
    : new SupabaseContractRepository(serviceClient);
  try {
    return await reviewStaffContractProgress(
      input.request,
      input.gameSessionId,
      input.contractId,
      input.progressId,
      repository,
      input.reviewedAt,
    );
  } catch (error) {
    return contractErrorToResponse(error);
  }
}
