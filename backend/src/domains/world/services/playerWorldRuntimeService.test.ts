import type { PlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import type { ArrivalClassAssignment } from "../../arrival/contracts/arrivalClassContracts.ts";
import type { PlayerWorldRuntimeRepository } from "./playerWorldRuntimeService.ts";
import { createPlayerWorldRuntimeService } from "./playerWorldRuntimeService.ts";
import type {
  PlayerResidencyState,
  PlayerTravelJourney,
  PlayerTravelState,
  StoredTravelQuote,
  WorldDefinitionBundle,
  WorldRuntimeState,
} from "../contracts/worldRuntimeContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SCOPE: PlayerRequestScope = {
  playerUuid: "00000000-0000-4000-8000-000000000021",
  gameId: "00000000-0000-4000-8000-000000000001",
  activeSessionId: "00000000-0000-4000-8000-000000000011",
  sessionValid: true,
  sessionExpiresAt: "2026-07-22T00:00:00.000Z",
  authorizationContext: {
    actorType: "player",
    source: "player_session",
    gameScope: "session",
    resourceScope: "own_player",
  },
};
const NOW = "2026-07-21T00:00:00.000Z";
const QUOTE_ID = `trq_${"a".repeat(32)}`;
const JOURNEY_ID = `trj_${"b".repeat(32)}`;

Deno.test("runtime context exposes questionnaire before assignment and strips ownership scope", async () => {
  const repository = memoryRepository();
  const service = createService(repository);
  const context = await service.readContext(SCOPE);
  assertEquals(context.arrival.required, true);
  assertEquals(context.arrival.questionnaire?.questions.length, 8);
  const serialized = JSON.stringify(context);
  for (const privateValue of [SCOPE.gameId, SCOPE.playerUuid, SCOPE.activeSessionId]) {
    assertEquals(serialized.includes(privateValue), false);
  }
});

Deno.test("arrival assignment scores deterministically and sends definition references atomically", async () => {
  const repository = memoryRepository();
  const service = createService(repository);
  const questionnaire = (await service.readContext(SCOPE)).arrival.questionnaire;
  if (!questionnaire) throw new Error("Missing questionnaire");
  const answers = questionnaire.questions.map((question) => ({
    questionId: question.questionId,
    optionId: question.options[0]!.optionId,
  }));
  const result = await service.assignArrivalClass({
    scope: SCOPE,
    request: { answers },
    idempotencyKey: "arrival-assignment-0001",
  });
  assertEquals(result.required, false);
  assertEquals(repository.state.assignment?.countryId, "eldoran");
  assertEquals(repository.state.assignmentInput?.arrivalPackageDefinitionId, "arrival-calibration-v1:eldoran");
  assertEquals(repository.state.assignmentInput?.grantDefinitionId.startsWith("class-grant-v1:"), true);
  assertEquals(repository.state.assignmentInput?.assignmentIdempotencyKey, "arrival-assignment-0001");
  assertEquals(repository.state.assignment?.economicRestrictions, []);
});

Deno.test("travel quote is server-computed, revision-bound, persisted, and scope stripped", async () => {
  const repository = memoryRepository();
  const service = createService(repository);
  const response = await service.createTravelQuote({
    scope: SCOPE,
    request: {
      toLocationId: "loc_destination",
      allowedModes: ["land"],
    },
  });
  assertEquals(response.quote.publicQuoteId, QUOTE_ID);
  assertEquals(response.quote.currencyCode, "ELD");
  assertEquals(response.quote.legs[0]?.routeRevision, 3);
  assertEquals("gameId" in response.quote, false);
  assertEquals("playerUuid" in response.quote, false);
  assertEquals(repository.state.quote?.publicQuoteId, QUOTE_ID);
});

Deno.test("travel execution, completion, and residency preserve server-derived scope", async () => {
  const repository = memoryRepository();
  const service = createService(repository);
  const executed = await service.executeTravel({
    scope: SCOPE,
    request: { quoteId: QUOTE_ID },
    idempotencyKey: "travel-execution-0001",
  });
  assertEquals(executed.journey.publicJourneyId, JOURNEY_ID);
  assertEquals(repository.state.execution?.scope, SCOPE);
  assertEquals(repository.state.execution?.idempotencyKey, "travel-execution-0001");

  const completed = await service.completeTravel({
    scope: SCOPE,
    request: { journeyId: JOURNEY_ID },
  });
  assertEquals(completed.journey.status, "completed");

  const residency = await service.requestResidencyChange({
    scope: SCOPE,
    request: { countryId: "valerion", expectedRevision: 0 },
  });
  assertEquals(residency.pendingCountryId, "valerion");
  assertEquals("gameId" in residency, false);
  assertEquals("playerUuid" in residency, false);
});

function createService(repository: ReturnType<typeof memoryRepository>) {
  return createPlayerWorldRuntimeService({
    repository,
    now: () => NOW,
    createPublicQuoteId: () => QUOTE_ID,
    createAssignmentId: () => "assignment-public-runtime",
  });
}

function memoryRepository(): PlayerWorldRuntimeRepository & {
  readonly state: {
    assignment: ArrivalClassAssignment | null;
    assignmentInput: Parameters<PlayerWorldRuntimeRepository["assignArrivalClassAtomic"]>[0] | null;
    quote: StoredTravelQuote | null;
    execution: Parameters<PlayerWorldRuntimeRepository["executeTravelAtomic"]>[0] | null;
  };
} {
  const travelState: PlayerTravelState = {
    gameId: SCOPE.gameId,
    gameSessionId: SCOPE.activeSessionId,
    playerUuid: SCOPE.playerUuid,
    currentLocationId: "loc_origin",
    status: "available",
    activeJourneyId: null,
    arrivalAt: null,
    revision: 0,
    updatedAt: NOW,
  };
  const residency: PlayerResidencyState = {
    gameId: SCOPE.gameId,
    gameSessionId: SCOPE.activeSessionId,
    playerUuid: SCOPE.playerUuid,
    currentCountryId: "eldoran",
    eligibleCountryIds: ["valerion"],
    pendingCountryId: null,
    revision: 0,
    updatedAt: NOW,
  };
  const bundle: WorldDefinitionBundle = {
    definition: {
      packId: "econovaria.beta-seed-pack.v1",
      packVersion: "1.0.0-beta",
      definitionDigest: "sha256:world-runtime",
    },
    locations: Array.from({ length: 50 }, (_, index) => ({
      publicLocationId: index === 0 ? "loc_origin" : index === 1 ? "loc_destination" : `loc_filler_${index}`,
      countryId: index < 5 ? "eldoran" : `country_${Math.floor(index / 5)}`,
      name: `Location ${index}`,
      kind: "city" as const,
      enabled: true,
    })),
    routes: [{
      publicRouteId: "rte_origin_destination",
      fromLocationId: "loc_origin",
      toLocationId: "loc_destination",
      mode: "land",
      bidirectional: true,
      baseCostMinor: 125,
      baseDurationMinutes: 45,
    }],
  };
  const world: WorldRuntimeState = {
    gameId: SCOPE.gameId,
    definition: bundle.definition,
    locationStates: bundle.locations.map((location) => ({
      publicLocationId: location.publicLocationId,
      availability: "normal" as const,
      revision: 0,
      updatedAt: NOW,
    })),
    routeStates: [{
      publicRouteId: "rte_origin_destination",
      status: "open",
      reason: "normal",
      costMultiplierBasisPoints: 10_000,
      durationMultiplierBasisPoints: 10_000,
      revision: 3,
      updatedAt: NOW,
    }],
    executedCommandKeys: [],
    revision: 7,
    updatedAt: NOW,
  };
  const state = {
    assignment: null as ArrivalClassAssignment | null,
    assignmentInput: null as Parameters<PlayerWorldRuntimeRepository["assignArrivalClassAtomic"]>[0] | null,
    quote: null as StoredTravelQuote | null,
    execution: null as Parameters<PlayerWorldRuntimeRepository["executeTravelAtomic"]>[0] | null,
  };
  return {
    state,
    readSnapshot: async () => ({
      campaign: null,
      arrivalAssignment: state.assignment,
      travelState,
      activeJourney: null,
      residency,
      world,
    }),
    readArrivalInput: async () => ({
      countryId: "eldoran",
      arrivalPackageDefinitionId: "arrival-calibration-v1:eldoran",
      classGrantDefinitionId: (classId) => `class-grant-v1:${classId}`,
    }),
    assignArrivalClassAtomic: async (input) => {
      state.assignmentInput = input;
      state.assignment = input.assignment;
    },
    readTravelPlanningInput: async () => ({
      bundle,
      state: world,
      context: {
        gameId: SCOPE.gameId,
        gameSessionId: SCOPE.activeSessionId,
        playerUuid: SCOPE.playerUuid,
        currentLocationId: "loc_origin",
        settlementCurrencyCode: "ELD",
        residency,
        allowedModes: ["land"],
      },
    }),
    storeTravelQuote: async ({ quote }) => {
      state.quote = quote;
      return quote;
    },
    executeTravelAtomic: async (input) => {
      state.execution = input;
      return journey("in_transit");
    },
    completeTravelAtomic: async () => journey("completed"),
    requestResidencyChange: async ({ request, occurredAt }) => ({
      ...residency,
      pendingCountryId: request.countryId,
      revision: residency.revision + 1,
      updatedAt: occurredAt,
    }),
  };
}

function journey(status: "in_transit" | "completed"): PlayerTravelJourney {
  return {
    publicJourneyId: JOURNEY_ID,
    publicQuoteId: QUOTE_ID,
    fromLocationId: "loc_origin",
    toLocationId: "loc_destination",
    currencyCode: "ELD",
    totalCostMinor: 125,
    totalDurationMinutes: 45,
    status,
    departedAt: NOW,
    arrivalAt: "2026-07-21T00:45:00.000Z",
    completedAt: status === "completed" ? "2026-07-21T00:45:00.000Z" : null,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
