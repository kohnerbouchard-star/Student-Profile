import type { PlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import type {
  ArrivalClassAssignment,
  ArrivalClassId,
  ArrivalClassScoreResult,
} from "../../arrival/contracts/arrivalClassContracts.ts";
import type {
  CampaignInstance,
  CampaignPhase,
  CampaignStatus,
} from "../../campaign/contracts/campaignRuntimeContracts.ts";
import type {
  CampaignHistoryEntry,
} from "../../campaign/services/campaignCoordinator.ts";
import type {
  RequestResidencyChangeRequest,
} from "../api/playerWorldRuntimeContracts.ts";
import type {
  PlayerResidencyState,
  PlayerTravelJourney,
  PlayerTravelState,
  StoredTravelQuote,
  WorldDefinitionBundle,
  WorldLocationDefinition,
  WorldLocationState,
  WorldRouteDefinition,
  WorldRouteState,
  WorldRuntimeState,
} from "../contracts/worldRuntimeContracts.ts";
import { WorldRuntimeError } from "../contracts/worldRuntimeContracts.ts";
import type {
  PlayerArrivalRuntimeInput,
  PlayerTravelPlanningInput,
  PlayerWorldRuntimeRepository,
  PlayerWorldRuntimeSnapshot,
} from "../services/playerWorldRuntimeService.ts";

interface DatabaseError {
  readonly code?: string;
  readonly message: string;
}

interface DatabaseResult<T> {
  readonly data: T | null;
  readonly error: DatabaseError | null;
}

interface QueryBuilder<T = unknown> extends PromiseLike<DatabaseResult<T[]>> {
  select(columns?: string): QueryBuilder<T>;
  insert(values: unknown): QueryBuilder<T>;
  update(values: unknown): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: readonly unknown[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  maybeSingle(): Promise<DatabaseResult<T>>;
  single(): Promise<DatabaseResult<T>>;
}

export interface PlayerWorldRuntimeSupabaseClient {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
  rpc<T = Record<string, unknown>>(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<DatabaseResult<T[]>>;
}

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
  const instance: CampaignInstance = Object.freeze({
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
  });
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

function mapWorldRuntime(
  runtime: WorldRuntimeRow,
  locations: readonly LocationRow[],
  routes: readonly RouteRow[],
  gameId: string,
): WorldRuntimeState {
  return Object.freeze({
    gameId,
    definition: Object.freeze({
      packId: runtime.pack_id,
      packVersion: runtime.pack_version,
      definitionDigest: runtime.definition_digest,
    }),
    locationStates: Object.freeze(locations.map(mapLocationState)),
    routeStates: Object.freeze(routes.map(mapRouteState)),
    executedCommandKeys: Object.freeze([]),
    revision: requireNonnegativeInteger(runtime.revision, "world revision"),
    updatedAt: requireTimestamp(runtime.updated_at, "world update"),
  });
}

function mapArrivalAssignment(
  row: ArrivalAssignmentRow,
  scope: PlayerRequestScope,
): ArrivalClassAssignment {
  const score = isRecord(row.score_result)
    ? row.score_result as unknown as ArrivalClassScoreResult
    : null;
  return Object.freeze({
    assignmentId: row.public_id,
    gameId: scope.gameId,
    gameSessionId: scope.gameId,
    playerUuid: scope.playerUuid,
    countryId: row.country_id,
    classId: requireClassId(row.class_id),
    source: row.source === "admin_override" ? "admin_override" : "questionnaire",
    questionnaireId: row.questionnaire_id,
    questionnaireVersion: row.questionnaire_version,
    scoreResult: score,
    overrideReason: typeof row.override_reason === "string" ? row.override_reason : null,
    revision: requireNonnegativeInteger(row.revision, "arrival revision"),
    assignedAt: requireTimestamp(row.assigned_at, "arrival assignment"),
    updatedAt: requireTimestamp(row.updated_at, "arrival assignment update"),
    economicRestrictions: Object.freeze([]),
  });
}

function mapTravelState(
  row: TravelStateRow,
  scope: PlayerRequestScope,
): PlayerTravelState {
  return Object.freeze({
    gameId: scope.gameId,
    gameSessionId: scope.gameId,
    playerUuid: scope.playerUuid,
    currentLocationId: row.current_location_id,
    status: row.status === "in_transit" ? "in_transit" : "available",
    activeJourneyId: typeof row.active_journey_id === "string"
      ? row.active_journey_id
      : null,
    arrivalAt: nullableTimestamp(row.arrival_at),
    revision: requireNonnegativeInteger(row.revision, "travel revision"),
    updatedAt: requireTimestamp(row.updated_at, "travel update"),
  });
}

function mapResidency(
  row: ResidencyRow,
  scope: PlayerRequestScope,
): PlayerResidencyState {
  return Object.freeze({
    gameId: scope.gameId,
    gameSessionId: scope.gameId,
    playerUuid: scope.playerUuid,
    currentCountryId: row.current_country_id,
    currencyCode: requireCurrency(row.currency_code),
    eligibleCountryIds: Object.freeze(readStringArray(row.eligible_country_ids)),
    pendingCountryId: typeof row.pending_country_id === "string"
      ? row.pending_country_id
      : null,
    revision: requireNonnegativeInteger(row.revision, "residency revision"),
    updatedAt: requireTimestamp(row.updated_at, "residency update"),
  });
}

function mapResidencyRpc(
  row: ResidencyRpcRow,
  scope: PlayerRequestScope,
): PlayerResidencyState {
  return Object.freeze({
    gameId: scope.gameId,
    gameSessionId: scope.gameId,
    playerUuid: scope.playerUuid,
    currentCountryId: row.current_country_id,
    currencyCode: requireCurrency(row.currency_code),
    eligibleCountryIds: Object.freeze(readStringArray(row.eligible_country_ids)),
    pendingCountryId: typeof row.pending_country_id === "string"
      ? row.pending_country_id
      : null,
    revision: requireNonnegativeInteger(row.revision, "residency revision"),
    updatedAt: requireTimestamp(row.updated_at, "residency update"),
  });
}

function mapStoredTravelQuote(
  row: TravelQuoteRow,
  scope: PlayerRequestScope,
): StoredTravelQuote {
  const legs = Array.isArray(row.legs) ? row.legs : [];
  return Object.freeze({
    publicQuoteId: row.public_id,
    gameId: scope.gameId,
    playerUuid: scope.playerUuid,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    currencyCode: requireCurrency(row.currency_code),
    totalCostMinor: requireNonnegativeInteger(row.total_cost_minor, "travel cost"),
    totalDurationMinutes: requirePositiveInteger(row.total_duration_minutes, "travel duration"),
    routeStateRevision: requireNonnegativeInteger(row.route_state_revision, "route revision"),
    legs: Object.freeze(legs.map(mapStoredLeg)),
    status: row.status === "consumed"
      ? "consumed"
      : row.status === "expired"
      ? "expired"
      : "created",
    expiresAt: requireTimestamp(row.expires_at, "quote expiry"),
  });
}

function mapStoredLeg(value: unknown): StoredTravelQuote["legs"][number] {
  if (!isRecord(value)) throw unavailable("Stored travel leg is malformed.");
  const mode = String(value.mode);
  if (!["land", "sea", "air", "meridian"].includes(mode)) {
    throw unavailable("Stored travel leg mode is invalid.");
  }
  return Object.freeze({
    publicRouteId: requireString(value.publicRouteId, "route id"),
    fromLocationId: requireString(value.fromLocationId, "route origin"),
    toLocationId: requireString(value.toLocationId, "route destination"),
    mode: mode as StoredTravelQuote["legs"][number]["mode"],
    costMinor: requireNonnegativeInteger(value.costMinor, "leg cost"),
    durationMinutes: requirePositiveInteger(value.durationMinutes, "leg duration"),
    routeRevision: requireNonnegativeInteger(value.routeRevision, "leg revision"),
  });
}

function mapTravelJourney(row: TravelJourneyRpcRow): PlayerTravelJourney {
  return Object.freeze({
    publicJourneyId: row.journey_id,
    publicQuoteId: row.quote_id,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    currencyCode: requireCurrency(row.currency_code),
    totalCostMinor: requireNonnegativeInteger(row.total_cost_minor, "journey cost"),
    totalDurationMinutes: requirePositiveInteger(row.total_duration_minutes, "journey duration"),
    status: row.status === "completed" ? "completed" : "in_transit",
    departedAt: requireTimestamp(row.departed_at, "journey departure"),
    arrivalAt: requireTimestamp(row.arrival_at, "journey arrival"),
    completedAt: nullableTimestamp(row.completed_at),
  });
}

function mapTravelJourneyRow(row: TravelJourneyRow): PlayerTravelJourney {
  return Object.freeze({
    publicJourneyId: row.public_id,
    publicQuoteId: requireString(row.quote.public_id, "quote id"),
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    currencyCode: requireCurrency(row.currency_code),
    totalCostMinor: requireNonnegativeInteger(row.total_cost_minor, "journey cost"),
    totalDurationMinutes: requirePositiveInteger(row.total_duration_minutes, "journey duration"),
    status: row.status === "completed" ? "completed" : "in_transit",
    departedAt: requireTimestamp(row.departed_at, "journey departure"),
    arrivalAt: requireTimestamp(row.arrival_at, "journey arrival"),
    completedAt: nullableTimestamp(row.completed_at),
  });
}

function mapLocationDefinition(row: LocationRow): WorldLocationDefinition {
  const kind = String(row.location_kind);
  if (![
    "capital",
    "city",
    "port",
    "airport",
    "industrial",
    "meridian_hub",
  ].includes(kind)) {
    throw unavailable(`Location ${row.public_location_id} has no reviewed kind.`);
  }
  return Object.freeze({
    publicLocationId: row.public_location_id,
    countryId: row.country_id,
    name: requireString(row.display_name, "location name"),
    kind: kind as WorldLocationDefinition["kind"],
    enabled: row.availability !== "closed",
  });
}

function mapRouteDefinition(row: RouteRow): WorldRouteDefinition {
  const mode = String(row.mode);
  if (!["land", "sea", "air", "meridian"].includes(mode)) {
    throw unavailable(`Route ${row.public_route_id} has an invalid mode.`);
  }
  return Object.freeze({
    publicRouteId: row.public_route_id,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    mode: mode as WorldRouteDefinition["mode"],
    bidirectional: Boolean(row.bidirectional),
    baseCostMinor: requireNonnegativeInteger(row.base_cost_minor, "route base cost"),
    baseDurationMinutes: requirePositiveInteger(row.base_duration_minutes, "route base duration"),
  });
}

function mapLocationState(row: LocationRow): WorldLocationState {
  const availability = String(row.availability);
  if (!["normal", "shortage", "conflict", "closed"].includes(availability)) {
    throw unavailable(`Location ${row.public_location_id} has invalid state.`);
  }
  return Object.freeze({
    publicLocationId: row.public_location_id,
    availability: availability as WorldLocationState["availability"],
    revision: requireNonnegativeInteger(row.revision, "location revision"),
    updatedAt: requireTimestamp(row.updated_at, "location update"),
  });
}

function mapRouteState(row: RouteRow): WorldRouteState {
  const status = String(row.status);
  const reason = String(row.reason);
  if (![
    "open",
    "restricted",
    "closed",
  ].includes(status) || ![
    "normal",
    "shortage",
    "meridian_disruption",
    "war",
    "recovery",
  ].includes(reason)) {
    throw unavailable(`Route ${row.public_route_id} has invalid state.`);
  }
  return Object.freeze({
    publicRouteId: row.public_route_id,
    status: status as WorldRouteState["status"],
    reason: reason as WorldRouteState["reason"],
    costMultiplierBasisPoints: requirePositiveInteger(
      row.cost_multiplier_basis_points,
      "route cost multiplier",
    ),
    durationMultiplierBasisPoints: requirePositiveInteger(
      row.duration_multiplier_basis_points,
      "route duration multiplier",
    ),
    revision: requireNonnegativeInteger(row.revision, "route revision"),
    updatedAt: requireTimestamp(row.updated_at, "route update"),
  });
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

function unavailable(message: string): WorldRuntimeError {
  return new WorldRuntimeError("world_travel_unavailable", message, true);
}

function requireClassId(value: unknown): ArrivalClassId {
  const classId = String(value);
  if (![
    "analyst",
    "builder",
    "maker",
    "mediator",
    "navigator",
    "operator",
    "steward",
    "trader",
  ].includes(classId)) throw unavailable("Stored arrival class is invalid.");
  return classId as ArrivalClassId;
}

function requireCampaignStatus(value: unknown): CampaignStatus {
  const status = String(value);
  if (!["active", "paused", "emergency_disabled", "completed"].includes(status)) {
    throw unavailable("Stored campaign status is invalid.");
  }
  return status as CampaignStatus;
}

function requirePhase(value: unknown): CampaignPhase {
  const phase = String(value);
  if (![
    "arrival",
    "opportunity",
    "rivalry",
    "shortage",
    "meridian_disruption",
    "open_conflict",
    "adaptation",
    "reconstruction",
    "continued_conflict",
  ].includes(phase)) throw unavailable("Stored campaign phase is invalid.");
  return phase as CampaignPhase;
}

function requireCurrency(value: unknown): string {
  const currency = String(value ?? "");
  if (!/^[A-Z]{3}$/.test(currency)) throw unavailable("Settlement currency is invalid.");
  return currency;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw unavailable(`${label} is invalid.`);
  }
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = String(value ?? "");
  if (!Number.isFinite(Date.parse(timestamp))) throw unavailable(`${label} is invalid.`);
  return timestamp;
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requireTimestamp(value, "timestamp");
}

function requireNonnegativeInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw unavailable(`${label} is invalid.`);
  }
  return number;
}

function requirePositiveInteger(value: unknown, label: string): number {
  const number = requireNonnegativeInteger(value, label);
  if (number === 0) throw unavailable(`${label} must be positive.`);
  return number;
}

function readStringArray(
  value: unknown,
  property?: string,
): readonly string[] {
  const candidate = property && isRecord(value) ? value[property] : value;
  if (!Array.isArray(candidate)) return Object.freeze([]);
  return Object.freeze(candidate.filter((item): item is string =>
    typeof item === "string"
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface PlayerCountryRow { readonly country_id: string; }
interface CountryRuntimeRow {
  readonly country_id: string;
  readonly currency_code: string;
  readonly arrival_location_id: string;
  readonly arrival_package_definition_id: string;
}
interface ClassGrantRow {
  readonly class_id: string;
  readonly grant_definition_id: string;
}
interface ArrivalAssignmentRow {
  readonly public_id: string;
  readonly country_id: string;
  readonly class_id: string;
  readonly source: string;
  readonly questionnaire_id: string;
  readonly questionnaire_version: string;
  readonly score_result: unknown;
  readonly override_reason: unknown;
  readonly revision: unknown;
  readonly assigned_at: unknown;
  readonly updated_at: unknown;
}
interface TravelStateRow {
  readonly current_location_id: string;
  readonly status: string;
  readonly active_journey_id: unknown;
  readonly arrival_at: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
interface ResidencyRow {
  readonly current_country_id: string;
  readonly currency_code: unknown;
  readonly eligible_country_ids: unknown;
  readonly pending_country_id: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
interface WorldRuntimeRow {
  readonly pack_id: string;
  readonly pack_version: string;
  readonly definition_digest: string;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
interface LocationRow {
  readonly public_location_id: string;
  readonly country_id: string;
  readonly display_name: unknown;
  readonly location_kind: unknown;
  readonly availability: string;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
interface RouteRow {
  readonly public_route_id: string;
  readonly from_location_id: string;
  readonly to_location_id: string;
  readonly mode: string;
  readonly bidirectional: unknown;
  readonly base_cost_minor: unknown;
  readonly base_duration_minutes: unknown;
  readonly status: string;
  readonly reason: string;
  readonly cost_multiplier_basis_points: unknown;
  readonly duration_multiplier_basis_points: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
interface CampaignRow {
  readonly id: string;
  readonly public_id: string;
  readonly pack_id: string;
  readonly pack_version: string;
  readonly definition_id: string;
  readonly definition_digest: string;
  readonly status: string;
  readonly current_phase: string;
  readonly revision: unknown;
  readonly event_sequence: unknown;
  readonly outcome: unknown;
  readonly scheduled_at: unknown;
  readonly paused_at: unknown;
  readonly disabled_at: unknown;
  readonly completed_at: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}
interface CampaignExecutionRow {
  readonly public_id: string;
  readonly event_key: string;
  readonly execution_key: string;
  readonly to_phase: string;
  readonly sequence: unknown;
  readonly occurred_at: unknown;
}
interface CampaignCommandRow {
  readonly idempotency_key: string;
  readonly payload: unknown;
  readonly status: string;
  readonly created_at: unknown;
}
interface TravelQuoteRow {
  readonly public_id: string;
  readonly from_location_id: string;
  readonly to_location_id: string;
  readonly currency_code: string;
  readonly total_cost_minor: unknown;
  readonly total_duration_minutes: unknown;
  readonly route_state_revision: unknown;
  readonly legs: unknown;
  readonly status: string;
  readonly expires_at: unknown;
}
interface TravelJourneyRow {
  readonly public_id: string;
  readonly quote: { readonly public_id: string };
  readonly from_location_id: string;
  readonly to_location_id: string;
  readonly currency_code: string;
  readonly total_cost_minor: unknown;
  readonly total_duration_minutes: unknown;
  readonly status: string;
  readonly departed_at: unknown;
  readonly arrival_at: unknown;
  readonly completed_at: unknown;
}
interface TravelJourneyRpcRow {
  readonly journey_id: string;
  readonly quote_id: string;
  readonly from_location_id: string;
  readonly to_location_id: string;
  readonly currency_code: string;
  readonly total_cost_minor: unknown;
  readonly total_duration_minutes: unknown;
  readonly status: string;
  readonly departed_at: unknown;
  readonly arrival_at: unknown;
  readonly completed_at: unknown;
}
interface TravelCompletionRpcRow {
  readonly journey_id: string;
  readonly current_location_id: string;
  readonly status: string;
  readonly completed_at: unknown;
  readonly travel_state_revision: unknown;
}
interface ResidencyRpcRow {
  readonly current_country_id: string;
  readonly currency_code: unknown;
  readonly eligible_country_ids: unknown;
  readonly pending_country_id: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
