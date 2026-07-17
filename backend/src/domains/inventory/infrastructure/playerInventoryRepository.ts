import type {
  PlayerInventoryReadInput,
  PlayerInventoryRecord,
} from "../contracts/playerInventoryContracts.ts";

export interface PlayerInventoryRepository {
  readonly readPlayerInventory: (
    input: PlayerInventoryReadInput,
  ) => Promise<readonly PlayerInventoryRecord[]>;
}
