import type { PlayerRequestScope } from "../../players/index.ts";
import type {
  CampaignHistoryEntry,
  PlayerCampaignProjectionSource,
} from "../../campaign/index.ts";
import type {
  PlayerTravelJourney,
  WorldDefinitionBundle,
} from "../contracts/worldRuntimeContracts.ts";
import { WorldRuntimeError } from "../contracts/worldRuntimeContracts.ts";
import type {
  PlayerArrivalRuntimeInput,
  PlayerTravelPlanningInput,
  PlayerWorldRuntimeRepository,
  PlayerWorldRuntimeSnapshot,
} from "../services/playerWorldRuntimeService.ts";
import type {
  ArrivalAssignmentRow,
  CampaignCommandRow,
  CampaignExecutionRow,
  CampaignRow,
  ClassGrantRow,
  CountryRuntimeRow,
  DatabaseResult,
  LocationRow,
  PlayerCountryRow,
  PlayerWorldRuntimeSupabaseClient,
  ResidencyRow,
  ResidencyRpcRow,
  RouteRow,
  TravelCompletionRpcRow,
  TravelJourneyRow,
  TravelJourneyRpcRow,
  TravelQuoteRow,
  TravelStateRow,
  WorldRuntimeRow,
} from "./playerWorldRuntimeRows.ts";
import {
  mapWorldRuntime,
  mapArrivalAssignment,
  mapTravelState,
  mapResidency,
  mapResidencyRpc,
  mapStoredTravelQuote,
  mapTravelJourney,
  mapTravelJourneyRow,
  mapLocationDefinition,
  mapRouteDefinition,
  unavailable,
  requireCampaignStatus,
  requirePhase,
  requireCurrency,
  requireTimestamp,
  nullableTimestamp,
  requireNonnegativeInteger,
  readStringArray,
} from "./playerWorldRuntimeRowMapping.ts";

export type { PlayerWorldRuntimeSupabaseClient } from "./playerWorldRuntimeRows.ts";

export function createSupabasePlayerWorldRuntimeRepository(
  client: PlayerWorldRuntimeSupabaseClient,
): PlayerWorldRuntimeRepository {
  const repository: PlayerWorldRuntimeRepository = {
    readSnapshot: async (scope) => readSnapshot(client, scope),
    readArrivalInput: async (scope) => readArrivalInput(client, scope),
    assignArrivalClassAtomic: async (input) => {
      const result = await client.rpc("assign_arrival_class_atomic_v2", {
        p_game_session_id: input.scope.gameId,
        p_player_id: input.scope.playerUuid,
        p_country_id: input.assignment.countryId,
        p_class_id: input.assignment.classId,
        p_questionnaire_id: input.scoreResult.questionnaireId,
        p_questionnaire_version: input.scoreResult.questionnaireVersion,
        p_score_result: input.scoreResult,
        p_assignment_idempotency_key: input.assignmentIdempotencyKey,
        p_arrival_package_definition_id: input.arrivalPackageDefinitionId,
        p_grant_definition_id: input.grantDefinitionId,
        p_grant_idempotency_key: input.grantIdempotencyKey,
        p_assigned_at: input.assignment.assignedAt,
      });
      requireRows(result, "arrival assignment");
    },
    readTravelPlanningInput: async (scope) =>
      readTravelPlanningInput(client, scope),
    storeTravelQuote: async ({ scope, quote }) => {
      const result = await client.from<TravelQuoteRow>("player_travel_quotes")
        .insert({
          public_id: quote.publicQuoteId,
          game_session_id: scope.gameId,
          player_id: scope.playerUuid,
          from_location_id: quote.fromLocationId,
          to_location_id: quote.toLocationId,
          currency_code: quote.currencyCode,
          total_cost_minor: quote.totalCostMinor,
          total_duration_minutes: quote.totalDurationMinutes,
          route_state_revision: quote.routeStateRevision,
          legs: quote.legs.map((leg) => ({
            publicRouteId: leg.publicRouteId,
            fromLocationId: leg.fromLocationId,
            toLocationId: leg.toLocationId,
            mode: leg.mode,
            costMinor: leg.costMinor,
            durationMinutes: leg.durationMinutes,
            routeRevision: leg.routeRevision,
          })),
          status: quote.status,
          expires_at: quote.expiresAt,
        })
        .select("*")
        .single();
      const row = requireRow(result, "travel quote");
      return mapStoredTravelQuote(row, scope);
    },
    executeTravelAtomic: async (input) => {
      const result = await client.rpc<TravelJourneyRpcRow>(
        "execute_player_travel_v1",
        {
          p_game_session_id: input.scope.gameId,
          p_player_id: input.scope.playerUuid,
          p_quote_public_id: input.publicQuoteId,
          p_idempotency_key: input.idempotencyKey,
          p_departed_at: input.occurredAt,
          p_request_metadata: {
            source: "player_world_runtime",
          },
        },
      );
      return mapTravelJourney(
        requireFirst(result, "travel execution"),
      );
    },
    completeTravelAtomic: async (input) => {
      const result = await client.rpc<TravelCompletionRpcRow>(
        "complete_player_travel_v1",
        {
          p_game_session_id: input.scope.gameId,
          p_player_id: input.scope.playerUuid,
          p_journey_public_id: input.publicJourneyId,
          p_effective_at: input.occurredAt,
        },
      );
      requireFirst(result, "travel completion");
      const journey = await client.from<TravelJourneyRow>(
        "player_travel_journeys",
      )
        .select("*, quote:player_travel_quotes(public_id)")
        .eq("game_session_id", input.scope.gameId)
        .eq("player_id", input.scope.playerUuid)
        .eq("public_id", input.publicJourneyId)
        .maybeSingle();
      return mapTravelJourneyRow(requireRow(journey, "completed journey"));
    },
    requestResidencyChange: async (input) => {
      const result = await client.rpc<ResidencyRpcRow>(
        "request_player_residency_change_v1",
        {
          p_game_session_id: input.scope.gameId,
          p_player_id: input.scope.playerUuid,
          p_target_country_id: input.request.countryId,
          p_expected_revision: input.request.expectedRevision,
          p_requested_at: input.occurredAt,
        },
      );
      return mapResidencyRpc(
        requireFirst(result, "residency request"),
        input.scope,
      );
    },
  };
  return Object.freeze(repository);
}

async function readSnapshot(
  client: PlayerWorldRuntimeSupabaseClient,
  scope: PlayerRequestScope,
): Promise<PlayerWorldRuntimeSnapshot> {
  const [
    arrivalResult,
    travelResult,
    residencyResult,
    runtimeResult,
    locationResult,
    routeResult,
    campaignResult,
  ] = await Promise.all([
    client.from<ArrivalAssignmentRow>("arrival_class_assignments")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .eq("player_id", scope.playerUuid)
      .maybeSingle(),
    client.from<TravelStateRow>("player_travel_states")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .eq("player_id", scope.playerUuid)
      .maybeSingle(),
    client.from<ResidencyRow>("player_residency_states")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .eq("player_id", scope.playerUuid)
      .maybeSingle(),
    client.from<WorldRuntimeRow>("world_runtime_instances")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .maybeSingle(),
    client.from<LocationRow>("world_location_states")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .order("public_location_id", { ascending: true }),
    client.from<RouteRow>("world_route_states")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .order("public_route_id", { ascending: true }),
    client.from<CampaignRow>("campaign_instances")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  assertNoError(arrivalResult, "arrival context");
  assertNoError(travelResult, "travel context");
  assertNoError(residencyResult, "residency context");
  assertNoError(runtimeResult, "world runtime");
  const locations = requireRows(locationResult, "world locations");
  const routes = requireRows(routeResult, "world routes");
  assertNoError(campaignResult, "campaign context");

  const persistedTravelState = travelResult.data
    ? mapTravelState(travelResult.data, scope)
    : null;
  const activeJourney = persistedTravelState?.activeJourneyId
    ? await readJourneyByInternalId(
      client,
      scope,
      persistedTravelState.activeJourneyId,
    )
    : null;
  const travelState = persistedTravelState
    ? Object.freeze({
      ...persistedTravelState,
      activeJourneyId: activeJourney?.publicJourneyId ?? null,
    })
    : null;
  const campaign = campaignResult.data
    ? await readCampaignContext(client, scope, campaignResult.data)
    : null;

  return Object.freeze({
    campaign,
    arrivalAssignment: arrivalResult.data
      ? mapArrivalAssignment(arrivalResult.data, scope)
      : null,
    travelState,
    activeJourney,
    residency: residencyResult.data
      ? mapResidency(residencyResult.data, scope)
      : null,
    world: runtimeResult.data
      ? mapWorldRuntime(runtimeResult.data, locations, routes, scope.gameId)
      : null,
  });
}

async function readArrivalInput(
  client: PlayerWorldRuntimeSupabaseClient,
  scope: PlayerRequestScope,
): Promise<PlayerArrivalRuntimeInput> {
  const playerResult = await client.from<PlayerCountryRow>("players")
    .select("country_id")
    .eq("game_session_id", scope.gameId)
    .eq("id", scope.playerUuid)
    .maybeSingle();
  const player = requireRow(playerResult, "player country");
  const countryResult = await client.from<CountryRuntimeRow>(
    "world_country_runtime",
  )
    .select("*")
    .eq("game_session_id", scope.gameId)
    .eq("country_uuid", player.country_id)
    .maybeSingle();
  const country = requireRow(countryResult, "world country runtime");
  const grants = requireRows(
    await client.from<ClassGrantRow>("arrival_class_grant_runtime")
      .select("*")
      .eq("game_session_id", scope.gameId),
    "arrival class grants",
  );
  const grantMap = new Map(
    grants.map((grant) => [grant.class_id, grant.grant_definition_id]),
  );
  if (grantMap.size !== 8) {
    throw unavailable("Arrival class grant registry is incomplete.");
  }
  return Object.freeze({
    countryId: country.country_id,
    arrivalPackageDefinitionId: country.arrival_package_definition_id,
    classGrantDefinitionId: (classId: string) => {
      const definitionId = grantMap.get(classId);
      if (!definitionId) {
        throw unavailable(`No grant definition exists for class ${classId}.`);
      }
      return definitionId;
    },
  });
}

async function readTravelPlanningInput(
  client: PlayerWorldRuntimeSupabaseClient,
  scope: PlayerRequestScope,
): Promise<PlayerTravelPlanningInput> {
  const snapshot = await readSnapshot(client, scope);
  if (!snapshot.world || !snapshot.travelState || !snapshot.residency) {
    throw unavailable("World, travel, or residency state is not initialized.");
  }
  if (snapshot.travelState.status !== "available") {
    throw new WorldRuntimeError(
      "world_travel_unavailable",
      "Player is already in transit.",
      true,
    );
  }
  const [locationRows, routeRows] = await Promise.all([
    client.from<LocationRow>("world_location_states")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .order("public_location_id", { ascending: true }),
    client.from<RouteRow>("world_route_states")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .order("public_route_id", { ascending: true }),
  ]);
  const locations = requireRows(locationRows, "travel locations");
  const routes = requireRows(routeRows, "travel routes");
  const bundle: WorldDefinitionBundle = Object.freeze({
    definition: snapshot.world.definition,
    locations: Object.freeze(locations.map(mapLocationDefinition)),
    routes: Object.freeze(routes.map(mapRouteDefinition)),
  });
  return Object.freeze({
    bundle,
    state: snapshot.world,
    context: Object.freeze({
      gameId: scope.gameId,
      gameSessionId: scope.gameId,
      playerUuid: scope.playerUuid,
      currentLocationId: snapshot.travelState.currentLocationId,
      settlementCurrencyCode: requireCurrency(snapshot.residency.currencyCode),
      residency: snapshot.residency,
      allowedModes: Object.freeze(["land", "sea", "air", "meridian"] as const),
    }),
  });
}

async function readCampaignContext(
  client: PlayerWorldRuntimeSupabaseClient,
  scope: PlayerRequestScope,
  row: CampaignRow,
): Promise<PlayerWorldRuntimeSnapshot["campaign"]> {
  const [executionResult, commandResult] = await Promise.all([
    client.from<CampaignExecutionRow>("campaign_event_executions")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .eq("campaign_instance_id", row.id)
      .order("sequence", { ascending: true })
      .limit(200),
    client.from<CampaignCommandRow>("campaign_effect_commands")
      .select("*")
      .eq("game_session_id", scope.gameId)
      .eq("campaign_instance_id", row.id)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  const executions = requireRows(executionResult, "campaign history");
  const commands = requireRows(commandResult, "campaign effects");
  const affectedLocations = new Set<string>();
  for (const command of commands) {
    for (const locationId of readStringArray(command.payload, "targetLocationIds")) {
      if (/^loc_[a-z0-9_]+$/.test(locationId)) affectedLocations.add(locationId);
    }
  }
  const history: CampaignHistoryEntry[] = executions.map((execution) =>
    Object.freeze({
      publicEventId: execution.public_id,
      eventKey: execution.event_key,
      phase: requirePhase(execution.to_phase),
      sequence: requireNonnegativeInteger(execution.sequence, "campaign sequence"),
      occurredAt: requireTimestamp(execution.occurred_at, "campaign occurrence"),
      summaryDefinitionId: execution.event_key,
    })
  );
  const instance = Object.freeze({
    campaignInstanceId: row.public_id,
    gameId: scope.gameId,
    definition: Object.freeze({
      packId: row.pack_id,
      packVersion: row.pack_version,
      definitionId: row.definition_id,
      definitionDigest: row.definition_digest,
    }),
    status: requireCampaignStatus(row.status),
    currentPhase: requirePhase(row.current_phase),
    revision: requireNonnegativeInteger(row.revision, "campaign revision"),
    eventSequence: requireNonnegativeInteger(row.event_sequence, "campaign event sequence"),
    executedEventKeys: Object.freeze(executions.map((execution) => execution.execution_key)),
    completedEffectKeys: Object.freeze(commands
      .filter((command) => command.status === "completed")
      .map((command) => command.idempotency_key)),
    outcome: row.outcome === "reconstruction" || row.outcome === "continued_conflict"
      ? row.outcome
      : null,
    scheduledAt: nullableTimestamp(row.scheduled_at),
    pausedAt: nullableTimestamp(row.paused_at),
    disabledAt: nullableTimestamp(row.disabled_at),
    completedAt: nullableTimestamp(row.completed_at),
    createdAt: requireTimestamp(row.created_at, "campaign creation"),
    updatedAt: requireTimestamp(row.updated_at, "campaign update"),
  }) satisfies PlayerCampaignProjectionSource;
  return Object.freeze({
    instance,
    history: Object.freeze(history),
    affectedLocationIds: Object.freeze([...affectedLocations].sort()),
  });
}

async function readJourneyByInternalId(
  client: PlayerWorldRuntimeSupabaseClient,
  scope: PlayerRequestScope,
  journeyId: string,
): Promise<PlayerTravelJourney | null> {
  const result = await client.from<TravelJourneyRow>("player_travel_journeys")
    .select("*, quote:player_travel_quotes(public_id)")
    .eq("game_session_id", scope.gameId)
    .eq("player_id", scope.playerUuid)
    .eq("id", journeyId)
    .maybeSingle();
  assertNoError(result, "active journey");
  return result.data ? mapTravelJourneyRow(result.data) : null;
}

function requireFirst<T>(
  result: DatabaseResult<T[]>,
  label: string,
): T {
  const rows = requireRows(result, label);
  if (rows.length !== 1) throw unavailable(`${label} returned ${rows.length} rows.`);
  return rows[0]!;
}

function requireRows<T>(
  result: DatabaseResult<T[]>,
  label: string,
): readonly T[] {
  assertNoError(result, label);
  return Object.freeze(result.data ?? []);
}

function requireRow<T>(
  result: DatabaseResult<T>,
  label: string,
): T {
  assertNoError(result, label);
  if (!result.data) throw unavailable(`${label} was not found.`);
  return result.data;
}

function assertNoError(
  result: DatabaseResult<unknown>,
  label: string,
): void {
  if (result.error) {
    throw unavailable(`${label} failed: ${result.error.code ?? "database_error"}.`);
  }
}
