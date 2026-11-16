import {
  type BusinessCandidateHireReceiptDto,
  type BusinessWorkforceSnapshotDto,
  PlayerBusinessError,
  type PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";
import { parseBusinessCandidateHireReceipt } from "../application/workforce/businessWorkforceResultParser.ts";
import {
  readIdempotencyKey,
  readKey,
} from "./playerBusinessRequestValidation.ts";

type Scope = {
  readonly gameSessionId: string;
  readonly playerId: string;
};

export async function readBusinessWorkforceCandidates(
  repository: PlayerBusinessRepository,
  scope: Scope,
): Promise<BusinessWorkforceSnapshotDto> {
  if (!repository.readWorkforceCandidates) {
    throw new PlayerBusinessError(
      "business_workforce_unavailable",
      "The Business workforce market is not available.",
      503,
      true,
    );
  }
  return repository.readWorkforceCandidates(scope);
}

export async function hireBusinessWorkforceCandidate(
  repository: PlayerBusinessRepository,
  scope: Scope,
  candidateKey: string,
  body: Record<string, unknown>,
): Promise<BusinessCandidateHireReceiptDto> {
  const result = await repository.execute(
    "hire_business_workforce_candidate_v2",
    {
      p_game_session_id: scope.gameSessionId,
      p_player_id: scope.playerId,
      p_business_key: readKey(body.businessKey, "businessKey", "biz"),
      p_candidate_key: candidateKey,
      p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
    },
  );
  return parseBusinessCandidateHireReceipt(result);
}
