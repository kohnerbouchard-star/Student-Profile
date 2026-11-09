import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";

export interface ContractReviewSubmissionIdentity {
  readonly contractId: string;
  readonly progressId: string;
}

export interface ContractReviewReadRepository {
  findSubmissionIdentity(input: {
    readonly gameSessionId: string;
    readonly submissionId: string;
  }): Promise<ContractReviewSubmissionIdentity | null>;
}

/** Read-only identity resolution for the submission-only Admin review route. */
export class SupabaseContractReviewReadRepository
  implements ContractReviewReadRepository {
  constructor(private readonly client: EdgeSupabaseClient) {}

  async findSubmissionIdentity(input: {
    readonly gameSessionId: string;
    readonly submissionId: string;
  }): Promise<ContractReviewSubmissionIdentity | null> {
    const progress = await this.client.from("player_contract_progress")
      .select("id,contract_id")
      .eq("game_session_id", input.gameSessionId)
      .eq("id", input.submissionId)
      .maybeSingle();
    if (progress.error) throw progress.error;
    if (!progress.data) return null;
    return {
      contractId: progress.data.contract_id,
      progressId: input.submissionId,
    };
  }
}
