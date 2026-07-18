import {
  type PlayerContractAcceptanceInput,
  PlayerContractAcceptancePersistenceError,
  type PlayerContractAcceptanceRepository,
  type PlayerContractAcceptanceResult,
} from "../contracts/playerContractAcceptanceContracts.ts";

interface QueryError {
  readonly message: string;
  readonly code?: string;
}

interface RpcResponse {
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error: QueryError | null;
}

interface PlayerContractAcceptanceClient {
  rpc(
    functionName: "accept_player_contract_by_key",
    args: Record<string, unknown>,
  ): PromiseLike<RpcResponse>;
}

export class SupabasePlayerContractAcceptanceRepository
  implements PlayerContractAcceptanceRepository {
  constructor(private readonly client: PlayerContractAcceptanceClient) {}

  async acceptContract(
    input: PlayerContractAcceptanceInput,
  ): Promise<PlayerContractAcceptanceResult> {
    const response = await this.client.rpc("accept_player_contract_by_key", {
      p_game_session_id: input.gameId,
      p_player_id: input.playerUuid,
      p_contract_key: input.contractKey,
    });

    if (response.error) throw mapPersistenceError(response.error);

    const rows = response.data ?? [];
    if (rows.length !== 1) throw invalidResult();

    const row = rows[0];
    const outcome = requireOutcome(row.accept_outcome);
    const contractKey = requireContractKey(row.contract_key);

    if (contractKey !== input.contractKey) throw invalidResult();

    if (outcome === "not_available") {
      if (row.progress_status !== null || row.accepted_at !== null) {
        throw invalidResult();
      }
      return {
        outcome,
        contractKey,
        progressStatus: null,
        acceptedAt: null,
      };
    }

    return {
      outcome,
      contractKey,
      progressStatus: requireText(row.progress_status),
      acceptedAt: requireIsoDateTime(row.accepted_at),
    };
  }
}

function requireOutcome(value: unknown): PlayerContractAcceptanceResult["outcome"] {
  if (
    value === "accepted" ||
    value === "already_accepted" ||
    value === "not_available" ||
    value === "locked"
  ) {
    return value;
  }
  throw invalidResult();
}

function requireContractKey(value: unknown): string {
  const text = requireText(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(text)) throw invalidResult();
  return text;
}

function requireText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw invalidResult();
}

function requireIsoDateTime(value: unknown): string {
  const text = requireText(value);
  if (Number.isNaN(Date.parse(text))) throw invalidResult();
  return text;
}

function mapPersistenceError(
  error: QueryError,
): PlayerContractAcceptancePersistenceError {
  const message = error.message.toLowerCase();
  const schemaMissing = error.code === "42883" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");

  return new PlayerContractAcceptancePersistenceError(
    schemaMissing
      ? "player_contract_acceptance_schema_not_applied"
      : "player_contract_acceptance_persistence_failed",
    "Player Contract acceptance could not be persisted.",
  );
}

function invalidResult(): PlayerContractAcceptancePersistenceError {
  return new PlayerContractAcceptancePersistenceError(
    "player_contract_acceptance_invalid_result",
    "Player Contract acceptance returned an invalid result.",
  );
}
