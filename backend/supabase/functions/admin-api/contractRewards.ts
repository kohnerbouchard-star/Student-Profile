function toContractDto(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    contractId: row.id,
    gameSessionId: row.game_session_id,
    contractKey: row.contract_key,
    key: row.contract_key,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    targetingPayload: row.targeting_payload || {},
    requirementsPayload: row.requirements_payload || {},
    rewardPayload: row.reward_payload || {},
    completionMode: row.completion_mode,
    publishedAt: row.published_at,
    deadlineAt: row.deadline_at,
    expiresAt: row.expires_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProgressDto(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    progressId: row.id,
    gameSessionId: row.game_session_id,
    contractId: row.contract_id,
    playerId: row.player_id,
    status: row.status,
    evidencePayload: row.evidence_payload || {},
    resultPayload: row.result_payload || {},
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    rewardIssuedAt: row.reward_issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function issueContractRewardsAtomically(
  service: any,
  input: {
    gameSessionId: string;
    contractId: string;
    progressId: string;
    staffUserId: string;
    requestId?: string | null;
  },
): Promise<any> {
  const rpc = await service.rpc("issue_contract_rewards_atomic_v1", {
    p_game_session_id: input.gameSessionId,
    p_contract_id: input.contractId,
    p_progress_id: input.progressId,
    p_staff_user_id: input.staffUserId,
    p_request_id: input.requestId || null,
  });

  if (rpc.error) {
    const message = String(rpc.error.message || "Contract rewards could not be issued.");
    const normalized = message.toUpperCase();
    let status = 400;
    let code = "contract_reward_issue_failed";

    if (normalized.includes("CONTRACT_PROGRESS_NOT_FOUND")) {
      status = 404;
      code = "contract_progress_not_found";
    } else if (normalized.includes("CONTRACT_NOT_FOUND")) {
      status = 404;
      code = "contract_not_found";
    } else if (normalized.includes("CONTRACT_PROGRESS_NOT_COMPLETED")) {
      status = 409;
      code = "contract_progress_not_completed";
    } else if (normalized.includes("OUT_OF_STOCK")) {
      status = 409;
      code = "contract_reward_item_out_of_stock";
    } else if (normalized.includes("UNSUPPORTED_CONTRACT_REWARD_TYPES")) {
      code = "unsupported_reward_type";
    } else if (normalized.includes("INVALID_CONTRACT")) {
      code = "invalid_reward_payload";
    }

    return {
      ok: false,
      status,
      error: {
        code,
        message,
        retryable: false,
      },
    };
  }

  const row = Array.isArray(rpc.data) ? rpc.data[0] : null;
  if (!row) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "contract_reward_issue_failed",
        message: "Contract reward issuance returned no result.",
        retryable: false,
      },
    };
  }

  const [contractResult, progressResult] = await Promise.all([
    service
      .from("game_session_contracts")
      .select("*")
      .eq("game_session_id", input.gameSessionId)
      .eq("id", input.contractId)
      .maybeSingle(),
    service
      .from("player_contract_progress")
      .select("*")
      .eq("game_session_id", input.gameSessionId)
      .eq("contract_id", input.contractId)
      .eq("id", input.progressId)
      .maybeSingle(),
  ]);

  if (contractResult.error) throw contractResult.error;
  if (progressResult.error) throw progressResult.error;

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      rewardIssued: Boolean(row.reward_issued),
      alreadyIssued: Boolean(row.already_issued),
      issuedAt: row.issued_at || null,
      contract: toContractDto(contractResult.data),
      progress: toProgressDto(progressResult.data),
      rewardResult: row.reward_result || {},
    },
  };
}
