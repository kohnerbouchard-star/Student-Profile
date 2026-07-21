import type {
  ArrivalClassId,
  ArrivalClassScore,
  ArrivalQuestionAnswer,
} from "../../arrival/contracts/arrivalClassContracts.ts";
import type { PlayerCampaignContext } from "../../campaign/services/campaignCoordinator.ts";
import type {
  PlayerResidencyState,
  PlayerTravelJourney,
  PlayerTravelState,
  StoredTravelQuote,
  WorldLocationState,
  WorldRouteMode,
  WorldRouteState,
} from "../contracts/worldRuntimeContracts.ts";

export interface PlayerArrivalQuestionnairePayload {
  readonly questionnaireId: string;
  readonly version: string;
  readonly questions: readonly {
    readonly questionId: string;
    readonly prompt: string;
    readonly options: readonly {
      readonly optionId: string;
      readonly label: string;
    }[];
  }[];
}

export interface PlayerArrivalAssignmentPayload {
  readonly classId: ArrivalClassId;
  readonly source: "questionnaire" | "admin_override";
  readonly countryId: string;
  readonly revision: number;
  readonly explanation: string | null;
  readonly scores: readonly Pick<ArrivalClassScore, "classId" | "total">[];
  readonly economicRestrictions: readonly never[];
}

export interface PlayerWorldRuntimeContextPayload {
  readonly campaign: PlayerCampaignContext | null;
  readonly arrival: {
    readonly required: boolean;
    readonly questionnaire: PlayerArrivalQuestionnairePayload | null;
    readonly assignment: PlayerArrivalAssignmentPayload | null;
  };
  readonly travel: {
    readonly state: PlayerTravelState | null;
    readonly activeJourney: PlayerTravelJourney | null;
  };
  readonly residency: Omit<PlayerResidencyState, "gameId" | "gameSessionId" | "playerUuid"> | null;
  readonly world: {
    readonly revision: number;
    readonly locations: readonly Pick<WorldLocationState, "publicLocationId" | "availability" | "revision">[];
    readonly routes: readonly Pick<
      WorldRouteState,
      | "publicRouteId"
      | "status"
      | "reason"
      | "costMultiplierBasisPoints"
      | "durationMultiplierBasisPoints"
      | "revision"
    >[];
  } | null;
}

export interface SubmitArrivalQuestionnaireRequest {
  readonly answers: readonly ArrivalQuestionAnswer[];
}

export interface CreateTravelQuoteRequest {
  readonly toLocationId: string;
  readonly allowedModes: readonly WorldRouteMode[];
}

export interface CreateTravelQuoteResponse {
  readonly quote: Omit<StoredTravelQuote, "gameId" | "playerUuid">;
}

export interface ExecuteTravelRequest {
  readonly quoteId: string;
}

export interface ExecuteTravelResponse {
  readonly journey: PlayerTravelJourney;
}

export interface CompleteTravelRequest {
  readonly journeyId: string;
}

export interface RequestResidencyChangeRequest {
  readonly countryId: string;
  readonly expectedRevision: number;
}
