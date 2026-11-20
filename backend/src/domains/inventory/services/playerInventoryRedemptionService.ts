import type {
  PlayerInventoryRedemptionRepository,
} from "../contracts/playerInventoryRedemptionContracts.ts";

export type PlayerInventoryRedemptionRequestInput = Parameters<
  PlayerInventoryRedemptionRepository["request"]
>[0];

export type PlayerInventoryRedemptionReadInput = Parameters<
  PlayerInventoryRedemptionRepository["read"]
>[0];

export class PlayerInventoryRedemptionService {
  constructor(
    private readonly repository: PlayerInventoryRedemptionRepository,
  ) {}

  requestRedemption(input: PlayerInventoryRedemptionRequestInput) {
    return this.repository.request(input);
  }

  readRedemptions(input: PlayerInventoryRedemptionReadInput) {
    return this.repository.read(input);
  }
}
