export type PlayerContractAcceptanceOutcome =
  | "accepted"
  | "already_accepted"
  | "not_available"
  | "locked";

export interface PlayerContractAcceptanceInput {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly contractKey: string;
}

export interface PlayerContractAcceptanceRecord {
  readonly outcome: Exclude<PlayerContractAcceptanceOutcome, "not_available">;
  readonly contractKey: string;
  readonly progressStatus: string;
  readonly acceptedAt: string;
}

export type PlayerContractAcceptanceResult =
  | PlayerContractAcceptanceRecord
  | {
    readonly outcome: "not_available";
    readonly contractKey: string;
    readonly progressStatus: null;
    readonly acceptedAt: null;
  };

export interface PlayerContractAcceptanceRepository {
  acceptContract(
    input: PlayerContractAcceptanceInput,
  ): Promise<PlayerContractAcceptanceResult>;
}

export interface PlayerContractAcceptanceResponseBody {
  readonly ok: true;
  readonly alreadyAccepted: boolean;
  readonly contract: {
    readonly contractKey: string;
    readonly status: "in_progress";
    readonly acceptedAt: string;
  };
}

export type PlayerContractAcceptanceErrorCode =
  | "invalid_player_contract_acceptance_request"
  | "player_contract_not_available"
  | "player_contract_progress_locked"
  | "player_contract_acceptance_failed";

export class PlayerContractAcceptanceError extends Error {
  constructor(
    readonly code: PlayerContractAcceptanceErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerContractAcceptanceError";
  }
}

export type PlayerContractAcceptancePersistenceErrorCode =
  | "player_contract_acceptance_schema_not_applied"
  | "player_contract_acceptance_persistence_failed"
  | "player_contract_acceptance_invalid_result";

export class PlayerContractAcceptancePersistenceError extends Error {
  constructor(
    readonly code: PlayerContractAcceptancePersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlayerContractAcceptancePersistenceError";
  }
}
