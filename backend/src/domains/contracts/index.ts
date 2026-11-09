import type { EdgeSupabaseClient } from "../../platform/supabase/edgeStaffSession.ts";
import type { ContractRepository } from "./contracts/contractRepositoryContracts.ts";
import {
  type PlayerContractDto,
  type PlayerContractProgressDto,
  toPlayerContractDto,
  toPlayerContractProgressDto,
} from "./contracts/contractHttpContracts.ts";
import { SupabaseContractRepository } from "./infrastructure/supabaseContractRepository.ts";

export type {
  PlayerContractDto,
  PlayerContractProgressDto,
} from "./contracts/contractHttpContracts.ts";
export type { CreateGameSessionContractInput } from "./contracts/contractRepositoryContracts.ts";
export { ContractRepositoryError } from "./contracts/contractRepositoryContracts.ts";

export type GameSessionContractWriter = Pick<
  ContractRepository,
  "createGameSessionContract"
>;

export function createGameSessionContractWriter(
  client: Pick<EdgeSupabaseClient, "from">,
): GameSessionContractWriter {
  const repository = new SupabaseContractRepository(client);
  return {
    createGameSessionContract: (input) =>
      repository.createGameSessionContract(input),
  };
}

export interface PlayerContractsReadInput {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface PlayerContractsReadResult {
  readonly available: readonly PlayerContractDto[];
  readonly progress: readonly PlayerContractProgressDto[];
}

export interface PlayerContractsReadQuery {
  read(input: PlayerContractsReadInput): Promise<PlayerContractsReadResult>;
}

export function createPlayerContractsReadQuery(
  client: Pick<EdgeSupabaseClient, "from">,
): PlayerContractsReadQuery {
  const repository = new SupabaseContractRepository(client);
  return {
    read: async (input) => {
      const scope = {
        gameSessionId: input.gameSessionId,
        playerId: input.playerId,
      };
      const [available, progress] = await Promise.all([
        repository.listPlayerAvailableContracts(scope),
        repository.listPlayerContractProgress(scope),
      ]);
      return {
        available: available.map(toPlayerContractDto),
        progress: progress.map(toPlayerContractProgressDto),
      };
    },
  };
}
