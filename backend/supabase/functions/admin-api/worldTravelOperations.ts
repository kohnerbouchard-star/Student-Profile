import {
  type WorldRuntimeAdminService,
  type Input,
  type OperationResult,
  ASSIGNMENT_ID,
  CLASS_IDS,
  ROUTE_ID,
} from "./worldRuntimeContracts.ts";
import {
  rejectQuery,
  boundedInteger,
  databaseError,
  success,
  publicRecord,
  strictBody,
  publicId,
  nonnegativeInteger,
  enumText,
  uuid,
  text,
  idempotency,
  rpcResult,
  publicIdArray,
  boundedNumber,
} from "./worldRuntimeValidation.ts";


export async function readArrivalClasses(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  const url = new URL(input.request.url);
  rejectQuery(input.request, ["limit"]);
  const limit = boundedInteger(url.searchParams.get("limit"), 100, 1, 250);
  const result = await service.from("arrival_class_assignments")
    .select(
      "public_id,country_id,class_id,source,questionnaire_id,questionnaire_version,score_result,override_reason,revision,assigned_at,created_at,updated_at,player_id",
    )
    .eq("game_session_id", input.gameId)
    .order("assigned_at", { ascending: false })
    .limit(limit);
  if (result.error) return databaseError(result.error);
  return success({ assignments: (result.data ?? []).map(publicRecord) });
}


export async function correctArrivalClass(
  service: WorldRuntimeAdminService,
  input: Input,
  assignmentId: string,
): Promise<OperationResult> {
  const body = await strictBody(input.request, [
    "classId",
    "expectedRevision",
    "reason",
    "requestId",
  ]);
  const result = await service.rpc("correct_arrival_class_assignment_v1", {
    p_game_session_id: input.gameId,
    p_assignment_public_id: publicId(
      assignmentId,
      ASSIGNMENT_ID,
      "assignmentId",
    ),
    p_expected_revision: nonnegativeInteger(body.expectedRevision),
    p_class_id: enumText(body.classId, CLASS_IDS),
    p_actor_staff_user_id: uuid(input.staffUserId),
    p_reason: text(body.reason, 12, 1000),
    p_idempotency_key: idempotency(body.requestId),
    p_corrected_at: new Date().toISOString(),
  });
  return rpcResult(result, "Arrival Class correction");
}


export async function readGeography(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  rejectQuery(input.request, []);
  const [runtime, locations, routes] = await Promise.all([
    service.from("world_runtime_instances")
      .select("pack_id,pack_version,definition_digest,revision,initialized_at,updated_at")
      .eq("game_session_id", input.gameId)
      .maybeSingle(),
    service.from("world_location_states")
      .select(
        "public_location_id,country_id,display_name,location_kind,availability,revision,updated_at",
      )
      .eq("game_session_id", input.gameId)
      .order("public_location_id", { ascending: true }),
    service.from("world_route_states")
      .select(
        "public_route_id,from_location_id,to_location_id,mode,bidirectional,base_cost_minor,base_duration_minutes,status,reason,cost_multiplier_basis_points,duration_multiplier_basis_points,revision,updated_at",
      )
      .eq("game_session_id", input.gameId)
      .order("public_route_id", { ascending: true }),
  ]);
  if (runtime.error) return databaseError(runtime.error);
  if (locations.error) return databaseError(locations.error);
  if (routes.error) return databaseError(routes.error);
  return success({
    runtime: runtime.data ? publicRecord(runtime.data) : null,
    locations: (locations.data ?? []).map(publicRecord),
    routes: (routes.data ?? []).map(publicRecord),
  });
}


export async function updateRouteState(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  const body = await strictBody(input.request, [
    "costMultiplierBasisPoints",
    "durationMultiplierBasisPoints",
    "expectedRevision",
    "reason",
    "requestId",
    "routeIds",
    "status",
  ]);
  const routeIds = publicIdArray(body.routeIds, ROUTE_ID, 1, 100);
  const result = await service.rpc("apply_world_route_state_v1", {
    p_game_session_id: input.gameId,
    p_expected_revision: nonnegativeInteger(body.expectedRevision),
    p_command_key: `admin:${idempotency(body.requestId)}`,
    p_public_route_ids: routeIds,
    p_status: enumText(body.status, ["open", "restricted", "closed"]),
    p_reason: enumText(body.reason, [
      "normal",
      "shortage",
      "meridian_disruption",
      "war",
      "recovery",
    ]),
    p_cost_multiplier_basis_points: boundedNumber(
      body.costMultiplierBasisPoints,
      1000,
      50000,
    ),
    p_duration_multiplier_basis_points: boundedNumber(
      body.durationMultiplierBasisPoints,
      1000,
      50000,
    ),
    p_applied_at: new Date().toISOString(),
  });
  return rpcResult(result, "route-state update");
}


export async function readTravel(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  const url = new URL(input.request.url);
  rejectQuery(input.request, ["limit"]);
  const limit = boundedInteger(url.searchParams.get("limit"), 100, 1, 250);
  const [states, journeys] = await Promise.all([
    service.from("player_travel_states")
      .select(
        "current_location_id,status,arrival_at,revision,created_at,updated_at,player_id",
      )
      .eq("game_session_id", input.gameId)
      .order("updated_at", { ascending: false })
      .limit(limit),
    service.from("player_travel_journeys")
      .select(
        "public_id,from_location_id,to_location_id,currency_code,total_cost_minor,total_duration_minutes,status,departed_at,arrival_at,completed_at,created_at,updated_at,player_id",
      )
      .eq("game_session_id", input.gameId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (states.error) return databaseError(states.error);
  if (journeys.error) return databaseError(journeys.error);
  return success({
    states: (states.data ?? []).map(publicRecord),
    journeys: (journeys.data ?? []).map(publicRecord),
  });
}


export async function readResidency(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  const url = new URL(input.request.url);
  rejectQuery(input.request, ["limit"]);
  const limit = boundedInteger(url.searchParams.get("limit"), 100, 1, 250);
  const result = await service.from("player_residency_states")
    .select(
      "current_country_id,currency_code,eligible_country_ids,pending_country_id,revision,created_at,updated_at,player_id",
    )
    .eq("game_session_id", input.gameId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (result.error) return databaseError(result.error);
  return success({ residency: (result.data ?? []).map(publicRecord) });
}
