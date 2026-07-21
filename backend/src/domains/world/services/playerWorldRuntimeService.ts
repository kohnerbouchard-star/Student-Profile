import type { PlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import {
  buildArrivalGrantCommand,
  createArrivalClassAssignment,
  DEFAULT_ARRIVAL_QUESTIONNAIRE,
  scoreArrivalQuestionnaire,
} from "../../arrival/services/arrivalClassScoring.ts";
import type {
  ArrivalClassAssignment,
  ArrivalClassScoreResult,
} from "../../arrival/contracts/arrivalClassContracts.ts";
import type {
  CampaignHistoryEntry,
  PlayerCampaignContext,
} from "../../campaign/services/campaignCoordinator.ts";
import { buildPlayerCampaignContext } from "../../campaign/services/campaignCoordinator.ts";
import type { CampaignInstance } from "../../campaign/contracts/campaignRuntimeContracts.ts";
import type {
  CreateTravelQuoteResponse,
  ExecuteTravelResponse,
  PlayerWorldRuntimeContextPayload,
  RequestResidencyChangeRequest,
  SubmitArrivalQuestionnaireRequest,
} from "../api/playerWorldRuntimeContracts.ts";
import type {
  PlayerResidencyState,
  PlayerTravelContext,
  PlayerTravelJourney,
  PlayerTravelState,
  StoredTravelQuote,
  WorldDefinitionBundle,
  WorldRuntimeState,
} from "../contracts/worldRuntimeContracts.ts";
import { WorldRuntimeError } from "../contracts/worldRuntimeContracts.ts";
import { quoteTravel } from "./worldRouteGraph.ts";
import { prepareStoredTravelQuote } from "./playerTravelService.ts";

export interface PlayerWorldRuntimeSnapshot {
  readonly campaign: {
    readonly instance: CampaignInstance;
    readonly history: readonly CampaignHistoryEntry[];
    readonly affectedLocationIds: readonly string[];
  } | null;
  readonly arrivalAssignment: ArrivalClassAssignment | null;
  readonly travelState: PlayerTravelState | null;
  readonly activeJourney: PlayerTravelJourney | null;
  readonly residency: PlayerResidencyState | null;
  readonly world: WorldRuntimeState | null;
}

export interface PlayerArrivalRuntimeInput {
  readonly countryId: string;
  readonly arrivalPackageDefinitionId: string;
  readonly classGrantDefinitionId: (classId: string) => string;
}

export interface PlayerTravelPlanningInput {
  readonly bundle: WorldDefinitionBundle;
  readonly state: WorldRuntimeState;
  readonly context: Omit<PlayerTravelContext, "allowedModes"> & {
    readonly allowedModes: readonly string[];
  };
}

export interface PlayerWorldRuntimeRepository {
  readSnapshot(scope: PlayerRequestScope): Promise<PlayerWorldRuntimeSnapshot>;
  readArrivalInput(scope: PlayerRequestScope): Promise<PlayerArrivalRuntimeInput>;
  assignArrivalClassAtomic(input: {
    readonly scope: PlayerRequestScope;
    readonly assignment: ArrivalClassAssignment;
    readonly scoreResult: ArrivalClassScoreResult;
    readonly arrivalPackageDefinitionId: string;
    readonly grantDefinitionId: string;
    readonly assignmentIdempotencyKey: string;
    readonly grantIdempotencyKey: string;
  }): Promise<void>;
  readTravelPlanningInput(scope: PlayerRequestScope): Promise<PlayerTravelPlanningInput>;
  storeTravelQuote(input: {
    readonly scope: PlayerRequestScope;
    readonly quote: StoredTravelQuote;
  }): Promise<StoredTravelQuote>;
  executeTravelAtomic(input: {
    readonly scope: PlayerRequestScope;
    readonly publicQuoteId: string;
    readonly idempotencyKey: string;
    readonly occurredAt: string;
  }): Promise<PlayerTravelJourney>;
  completeTravelAtomic(input: {
    readonly scope: PlayerRequestScope;
    readonly publicJourneyId: string;
    readonly occurredAt: string;
  }): Promise<PlayerTravelJourney>;
  requestResidencyChange(input: {
    readonly scope: PlayerRequestScope;
    readonly request: RequestResidencyChangeRequest;
    readonly occurredAt: string;
  }): Promise<PlayerResidencyState>;
}

export interface PlayerWorldRuntimeServiceDependencies {
  readonly repository: PlayerWorldRuntimeRepository;
  readonly now?: () => string;
  readonly createPublicQuoteId: () => string;
  readonly createAssignmentId: () => string;
}

export function createPlayerWorldRuntimeService(
  dependencies: PlayerWorldRuntimeServiceDependencies,
) {
  const now = dependencies.now ?? (() => new Date().toISOString());

  return Object.freeze({
    readContext: async (
      scope: PlayerRequestScope,
    ): Promise<PlayerWorldRuntimeContextPayload> =>
      buildPublicContext(
        await dependencies.repository.readSnapshot(scope),
      ),

    assignArrivalClass: async (input: {
      readonly scope: PlayerRequestScope;
      readonly request: SubmitArrivalQuestionnaireRequest;
      readonly idempotencyKey: string;
    }): Promise<PlayerWorldRuntimeContextPayload["arrival"]> => {
      const runtimeInput = await dependencies.repository.readArrivalInput(input.scope);
      const scoreResult = scoreArrivalQuestionnaire(
        DEFAULT_ARRIVAL_QUESTIONNAIRE,
        input.request.answers,
      );
      const assignedAt = now();
      const assignment = createArrivalClassAssignment({
        assignmentId: dependencies.createAssignmentId(),
        gameId: input.scope.gameId,
        gameSessionId: input.scope.gameId,
        playerUuid: input.scope.playerUuid,
        countryId: runtimeInput.countryId,
        scoreResult,
        assignedAt,
      });
      const grant = buildArrivalGrantCommand({
        assignment,
        arrivalPackageDefinitionId: runtimeInput.arrivalPackageDefinitionId,
        grantDefinitionId: runtimeInput.classGrantDefinitionId(assignment.classId),
      });
      await dependencies.repository.assignArrivalClassAtomic({
        scope: input.scope,
        assignment,
        scoreResult,
        arrivalPackageDefinitionId: grant.arrivalPackageDefinitionId,
        grantDefinitionId: grant.grantDefinitionId,
        assignmentIdempotencyKey: input.idempotencyKey,
        grantIdempotencyKey: grant.idempotencyKey,
      });
      return buildPublicContext(
        await dependencies.repository.readSnapshot(input.scope),
      ).arrival;
    },

    createTravelQuote: async (input: {
      readonly scope: PlayerRequestScope;
      readonly request: {
        readonly toLocationId: string;
        readonly allowedModes: PlayerTravelContext["allowedModes"];
      };
    }): Promise<CreateTravelQuoteResponse> => {
      const planning = await dependencies.repository.readTravelPlanningInput(
        input.scope,
      );
      if (planning.context.currentLocationId === input.request.toLocationId) {
        throw new WorldRuntimeError(
          "world_travel_quote_invalid",
          "Travel destination must differ from the current location.",
          false,
        );
      }
      const travelContext: PlayerTravelContext = Object.freeze({
        ...planning.context,
        allowedModes: input.request.allowedModes,
      });
      const quote = quoteTravel(
        planning.bundle,
        planning.state,
        travelContext,
        input.request.toLocationId,
      );
      const stored = await dependencies.repository.storeTravelQuote({
        scope: input.scope,
        quote: prepareStoredTravelQuote({
          quote,
          state: planning.state,
          context: travelContext,
          publicQuoteId: dependencies.createPublicQuoteId(),
          createdAt: now(),
        }),
      });
      return Object.freeze({
        quote: stripQuoteScope(stored),
      });
    },

    executeTravel: async (input: {
      readonly scope: PlayerRequestScope;
      readonly request: { readonly quoteId: string };
      readonly idempotencyKey: string;
    }): Promise<ExecuteTravelResponse> => Object.freeze({
      journey: await dependencies.repository.executeTravelAtomic({
        scope: input.scope,
        publicQuoteId: input.request.quoteId,
        idempotencyKey: input.idempotencyKey,
        occurredAt: now(),
      }),
    }),

    completeTravel: async (input: {
      readonly scope: PlayerRequestScope;
      readonly request: { readonly journeyId: string };
    }): Promise<ExecuteTravelResponse> => Object.freeze({
      journey: await dependencies.repository.completeTravelAtomic({
        scope: input.scope,
        publicJourneyId: input.request.journeyId,
        occurredAt: now(),
      }),
    }),

    requestResidencyChange: async (input: {
      readonly scope: PlayerRequestScope;
      readonly request: RequestResidencyChangeRequest;
    }) => stripResidencyScope(
      await dependencies.repository.requestResidencyChange({
        scope: input.scope,
        request: input.request,
        occurredAt: now(),
      }),
    ),
  });
}

function buildPublicContext(
  snapshot: PlayerWorldRuntimeSnapshot,
): PlayerWorldRuntimeContextPayload {
  const questionnaire = snapshot.arrivalAssignment
    ? null
    : Object.freeze({
      questionnaireId: DEFAULT_ARRIVAL_QUESTIONNAIRE.questionnaireId,
      version: DEFAULT_ARRIVAL_QUESTIONNAIRE.version,
      questions: Object.freeze(DEFAULT_ARRIVAL_QUESTIONNAIRE.questions.map(
        (question) => Object.freeze({
          questionId: question.questionId,
          prompt: question.prompt,
          options: Object.freeze(question.options.map((option) => Object.freeze({
            optionId: option.optionId,
            label: option.label,
          }))),
        }),
      )),
    });
  const campaign: PlayerCampaignContext | null = snapshot.campaign &&
      snapshot.travelState
    ? buildPlayerCampaignContext({
      instance: snapshot.campaign.instance,
      history: snapshot.campaign.history,
      playerLocationId: snapshot.travelState.currentLocationId,
      affectedLocationIds: snapshot.campaign.affectedLocationIds,
    })
    : null;

  return Object.freeze({
    campaign,
    arrival: Object.freeze({
      required: snapshot.arrivalAssignment === null,
      questionnaire,
      assignment: snapshot.arrivalAssignment
        ? Object.freeze({
          classId: snapshot.arrivalAssignment.classId,
          source: snapshot.arrivalAssignment.source,
          countryId: snapshot.arrivalAssignment.countryId,
          revision: snapshot.arrivalAssignment.revision,
          explanation: snapshot.arrivalAssignment.scoreResult?.explanation ?? null,
          scores: Object.freeze(
            snapshot.arrivalAssignment.scoreResult?.scores.map((score) =>
              Object.freeze({ classId: score.classId, total: score.total })
            ) ?? [],
          ),
          economicRestrictions: Object.freeze([]),
        })
        : null,
    }),
    travel: Object.freeze({
      state: snapshot.travelState ? stripTravelStateScope(snapshot.travelState) : null,
      activeJourney: snapshot.activeJourney,
    }),
    residency: snapshot.residency ? stripResidencyScope(snapshot.residency) : null,
    world: snapshot.world
      ? Object.freeze({
        revision: snapshot.world.revision,
        locations: Object.freeze(snapshot.world.locationStates.map((location) =>
          Object.freeze({
            publicLocationId: location.publicLocationId,
            availability: location.availability,
            revision: location.revision,
          })
        )),
        routes: Object.freeze(snapshot.world.routeStates.map((route) =>
          Object.freeze({
            publicRouteId: route.publicRouteId,
            status: route.status,
            reason: route.reason,
            costMultiplierBasisPoints: route.costMultiplierBasisPoints,
            durationMultiplierBasisPoints: route.durationMultiplierBasisPoints,
            revision: route.revision,
          })
        )),
      })
      : null,
  });
}

function stripTravelStateScope(state: PlayerTravelState) {
  const {
    gameId: _gameId,
    gameSessionId: _gameSessionId,
    playerUuid: _playerUuid,
    ...publicState
  } = state;
  return Object.freeze(publicState);
}

function stripResidencyScope(state: PlayerResidencyState) {
  const {
    gameId: _gameId,
    gameSessionId: _gameSessionId,
    playerUuid: _playerUuid,
    ...publicState
  } = state;
  return Object.freeze(publicState);
}

function stripQuoteScope(quote: StoredTravelQuote) {
  const {
    gameId: _gameId,
    playerUuid: _playerUuid,
    ...publicQuote
  } = quote;
  return Object.freeze(publicQuote);
}
