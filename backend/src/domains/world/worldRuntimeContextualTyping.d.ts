import type { CampaignAdminRepository } from "../campaign/infrastructure/supabaseCampaignRuntimeRepository.ts";
import type { CampaignEffectWorkerRepository } from "../campaign/services/campaignEffectWorker.ts";
import type { CampaignSchedulerRepository } from "../campaign/services/campaignScheduler.ts";
import type {
  PlayerTravelPlanningInput,
  PlayerWorldRuntimeRepository,
} from "./services/playerWorldRuntimeService.ts";
import type { PlayerTravelContext } from "./contracts/worldRuntimeContracts.ts";

declare global {
  interface ObjectConstructor {
    freeze(
      value: CampaignSchedulerRepository,
    ): Readonly<CampaignSchedulerRepository>;
    freeze(
      value: CampaignEffectWorkerRepository,
    ): Readonly<CampaignEffectWorkerRepository>;
    freeze(value: CampaignAdminRepository): Readonly<CampaignAdminRepository>;
    freeze(
      value: PlayerWorldRuntimeRepository,
    ): Readonly<PlayerWorldRuntimeRepository>;
    freeze(
      value: PlayerTravelPlanningInput,
    ): Readonly<PlayerTravelPlanningInput>;
    freeze(value: PlayerTravelContext): Readonly<PlayerTravelContext>;
  }
}

export {};
