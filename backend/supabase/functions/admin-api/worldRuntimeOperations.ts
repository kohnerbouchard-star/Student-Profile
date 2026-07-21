interface OperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

interface Input {
  readonly request: Request;
  readonly gameId: string;
  readonly staffUserId: string;
  readonly suffix: string;
}

interface DatabaseError {
  readonly code?: string;
  readonly message: string;
}

interface DatabaseResult<T> {
  readonly data: T | null;
  readonly error: DatabaseError | null;
}

interface QueryBuilder<T = Record<string, unknown>>
  extends PromiseLike<DatabaseResult<T[]>> {
  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  maybeSingle(): Promise<DatabaseResult<T>>;
}

interface AdminService {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
  rpc<T = Record<string, unknown>>(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<DatabaseResult<T[]>>;
}

const CAMPAIGN_ID = /^cmp_[0-9a-f]{32}$/u;
const EFFECT_ID = /^cec_[0-9a-f]{32}$/u;
const ASSIGNMENT_ID = /^acl_[0-9a-f]{32}$/u;
const ROUTE_ID = /^rte_[a-z0-9_]+$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;
const PHASES = [
  "arrival",
  "opportunity",
  "rivalry",
  "shortage",
  "meridian_disruption",
  "open_conflict",
  "adaptation",
  "reconstruction",
  "continued_conflict",
] as const;
const CLASS_IDS = [
  "analyst",
  "builder",
  "maker",
  "mediator",
  "navigator",
  "operator",
  "steward",
  "trader",
] as const;
const EFFECT_KINDS = [
  "publish_news",
  "create_contract",
  "notify_players",
  "apply_market_shock",
  "set_store_scarcity",
  "set_route_state",
] as const;

export async function handleWorldRuntimeAdminOperation(
  service: AdminService,
  input: Input,
): Promise<OperationResult> {
  try {
    if (input.suffix === "/world/campaign" && input.request.method === "GET") {
      return readCampaign(service, input);
    }
    if (
      input.suffix === "/world/campaign/history" &&
      input.request.method === "GET"
    ) {
      return readCampaignHistory(service, input);
    }
    if (
      input.suffix === "/world/campaign/effects" &&
      input.request.method === "GET"
    ) {
      return readCampaignEffects(service, input);
    }
    if (
      input.suffix === "/world/campaign/control" &&
      input.request.method === "POST"
    ) {
      return controlCampaign(service, input);
    }
    if (
      input.suffix === "/world/campaign/manual-trigger" &&
      input.request.method === "POST"
    ) {
      return manualTrigger(service, input);
    }

    const recovery = input.suffix.match(
      /^\/world\/campaign\/effects\/(cec_[0-9a-f]{32})\/recover$/u,
    );
    if (recovery && input.request.method === "POST") {
      return recoverEffect(service, input, recovery[1]!);
    }

    if (
      input.suffix === "/world/arrival-classes" &&
      input.request.method === "GET"
    ) {
      return readArrivalClasses(service, input);
    }
    const correction = input.suffix.match(
      /^\/world\/arrival-classes\/(acl_[0-9a-f]{32})\/correct$/u,
    );
    if (correction && input.request.method === "POST") {
      return correctArrivalClass(service, input, correction[1]!);
    }

    if (input.suffix === "/world/geography" && input.request.method === "GET") {
      return readGeography(service, input);
    }
    if (
      input.suffix === "/world/routes/state" &&
      input.request.method === "POST"
    ) {
      return updateRouteState(service, input);
    }
    if (input.suffix === "/world/travel" && input.request.method === "GET") {
      return readTravel(service, input);
    }
    if (input.suffix === "/world/residency" && input.request.method === "GET") {
      return readResidency(service, input);
    }

    return input.suffix.startsWith("/world/")
      ? methodOrRoute(input)
      : { handled: false };
  } catch (error) {
    return invalid(
      error instanceof Error ? error.message : "Invalid World administrator request.",
    );
  }
}

async function readCampaign(
  service: AdminService,
  input: Input,
): Promise<OperationResult> {
  rejectQuery(input.request, []);
  const result = await service.from("campaign_instances")
    .select(
      "public_id,pack_id,pack_version,definition_id,definition_digest,status,current_phase,revision,event_sequence,outcome,scheduled_at,paused_at,disabled_at,completed_at,created_at,updated_at",
    )
    .eq("game_session_id", input.gameId)
    .order("created_at", { ascending: true })
    .limit(10);
  if (result.error) return databaseError(result.error);
  const campaigns = (result.data ?? []).map((row) => publicRecord(row));
  const now = Date.now();
  return success({
    campaigns,
    scheduler: {
      due: campaigns.filter((campaign) =>
        campaign.status === "active" &&
        typeof campaign.scheduled_at === "string" &&
        Date.parse(campaign.scheduled_at) <= now
      ).length,
      active: campaigns.filter((campaign) => campaign.status === "active").length,
      paused: campaigns.filter((campaign) => campaign.status === "paused").length,
      emergencyDisabled: campaigns.filter((campaign) =>
        campaign.status === "emergency_disabled"
      ).length,
    },
  });
}

async function readCampaignHistory(
  service: AdminService,
  input: Input,
): Promise<OperationResult> {
  const url = new URL(input.request.url);
  rejectQuery(input.request, ["campaignId", "limit"]);
  const campaignId = optionalPublicId(
    url.searchParams.get("campaignId"),
    CAMPAIGN_ID,
    "campaignId",
  );
  const limit = boundedInteger(url.searchParams.get("limit"), 100, 1, 250);
  let query = service.from("campaign_event_executions")
    .select(
      "public_id,event_key,trigger_key,from_phase,to_phase,sequence,actor_type,reason,occurred_at,created_at,campaign_instance_id",
    )
    .eq("game_session_id", input.gameId)
    .order("sequence", { ascending: false })
    .limit(limit);
  if (campaignId) {
    const campaign = await internalCampaignId(service, input.gameId, campaignId);
    query = query.eq("campaign_instance_id", campaign);
  }
  const result = await query;
  if (result.error) return databaseError(result.error);
  return success({ history: (result.data ?? []).map(publicRecord) });
}

async function readCampaignEffects(
  service: AdminService,
  input: Input,
): Promise<OperationResult> {
  const url = new URL(input.request.url);
  rejectQuery(input.request, ["status", "limit"]);
  const status = url.searchParams.get("status")?.trim().toLowerCase() ?? "all";
  if (!["all", "pending", "processing", "completed", "failed"].includes(status)) {
    throw new Error("Effect status filter is invalid.");
  }
  const limit = boundedInteger(url.searchParams.get("limit"), 100, 1, 250);
  let query = service.from("campaign_effect_commands")
    .select(
      "public_id,idempotency_key,effect_kind,payload,status,attempt_count,last_error_code,claimed_at,completed_at,created_at,updated_at",
    )
    .eq("game_session_id", input.gameId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") query = query.eq("status", status);
  const result = await query;
  if (result.error) return databaseError(result.error);
  const effects = (result.data ?? []).map(publicRecord);
  return success({
    effects,
    summary: {
      pending: effects.filter((row) => row.status === "pending").length,
      processing: effects.filter((row) => row.status === "processing").length,
      completed: effects.filter((row) => row.status === "completed").length,
      failed: effects.filter((row) => row.status === "failed").length,
    },
  });
}

async function controlCampaign(
  service: AdminService,
  input: Input,
): Promise<OperationResult> {
  const body = await strictBody(input.request, [
    "action",
    "campaignId",
    "correctedPhase",
    "expectedRevision",
    "reason",
  ]);
  const action = enumText(body.action, [
    "pause",
    "resume",
    "emergency_disable",
    "correct_phase",
  ]);
  const correctedPhase = action === "correct_phase"
    ? enumText(body.correctedPhase, PHASES.slice(0, 7))
    : null;
  if (action !== "correct_phase" && body.correctedPhase !== null) {
    throw new Error("correctedPhase is only valid for a phase correction.");
  }
  const result = await service.rpc("control_campaign_instance_atomic_v1", {
    p_game_session_id: input.gameId,
    p_campaign_public_id: publicId(body.campaignId, CAMPAIGN_ID, "campaignId"),
    p_expected_revision: nonnegativeInteger(body.expectedRevision),
    p_action: action,
    p_corrected_phase: correctedPhase,
    p_actor_staff_user_id: uuid(input.staffUserId),
    p_reason: text(body.reason, 12, 1000),
    p_occurred_at: new Date().toISOString(),
  });
  return rpcResult(result, "campaign control");
}

async function manualTrigger(
  service: AdminService,
  input: Input,
): Promise<OperationResult> {
  const body = await strictBody(input.request, [
    "campaignId",
    "completeCampaign",
    "effects",
    "eventKey",
    "expectedPhase",
    "expectedRevision",
    "nextPhase",
    "nextScheduledAt",
    "prerequisiteEventKeys",
    "reason",
    "requestId",
  ]);
  const effects = strictEffects(body.effects);
  const completeCampaign = boolean(body.completeCampaign);
  const nextPhase = enumText(body.nextPhase, PHASES);
  const nextScheduledAt = nullableTimestamp(body.nextScheduledAt);
  if (completeCampaign ? nextScheduledAt !== null : nextScheduledAt === null) {
    throw new Error(
      completeCampaign
        ? "Completed campaign events cannot schedule another event."
        : "Nonterminal campaign events require nextScheduledAt.",
    );
  }
  const result = await service.rpc("execute_campaign_event_atomic_v2", {
    p_game_session_id: input.gameId,
    p_campaign_public_id: publicId(body.campaignId, CAMPAIGN_ID, "campaignId"),
    p_expected_revision: nonnegativeInteger(body.expectedRevision),
    p_event_key: token(body.eventKey, 128),
    p_trigger_key: `manual:${idempotency(body.requestId)}`,
    p_expected_phase: enumText(body.expectedPhase, PHASES),
    p_next_phase: nextPhase,
    p_complete_campaign: completeCampaign,
    p_prerequisite_event_keys: tokenArray(body.prerequisiteEventKeys, 50),
    p_effect_commands: effects.map((effect, index) => ({
      effectKind: effect.effectKind,
      idempotencyKey:
        `manual:${String(body.requestId)}:${index + 1}:${effect.effectKind}`,
      payload: effect.payload,
    })),
    p_next_scheduled_at: nextScheduledAt,
    p_actor_staff_user_id: uuid(input.staffUserId),
    p_reason: text(body.reason, 12, 1000),
    p_occurred_at: new Date().toISOString(),
  });
  return rpcResult(result, "manual campaign trigger");
}

async function recoverEffect(
  service: AdminService,
  input: Input,
  effectId: string,
): Promise<OperationResult> {
  const body = await strictBody(input.request, ["reason", "requestId"]);
  const result = await service.rpc("recover_campaign_effect_command_v1", {
    p_game_session_id: input.gameId,
    p_command_public_id: publicId(effectId, EFFECT_ID, "effectId"),
    p_actor_staff_user_id: uuid(input.staffUserId),
    p_reason: text(body.reason, 12, 1000),
    p_idempotency_key: idempotency(body.requestId),
    p_recovered_at: new Date().toISOString(),
  });
  return rpcResult(result, "campaign effect recovery");
}

async function readArrivalClasses(
  service: AdminService,
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

async function correctArrivalClass(
  service: AdminService,
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

async function readGeography(
  service: AdminService,
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

async function updateRouteState(
  service: AdminService,
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

async function readTravel(
  service: AdminService,
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

async function readResidency(
  service: AdminService,
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

async function internalCampaignId(
  service: AdminService,
  gameId: string,
  campaignId: string,
): Promise<string> {
  const result = await service.from<{ readonly id: unknown }>("campaign_instances")
    .select("id")
    .eq("game_session_id", gameId)
    .eq("public_id", campaignId)
    .maybeSingle();
  if (result.error) throw new Error("Campaign could not be loaded.");
  if (!result.data || typeof result.data.id !== "string") {
    throw new Error("Campaign was not found.");
  }
  return result.data.id;
}

function strictEffects(value: unknown): readonly {
  readonly effectKind: typeof EFFECT_KINDS[number];
  readonly payload: Record<string, unknown>;
}[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new Error("One to twenty purpose-built effects are required.");
  }
  return Object.freeze(value.map((effect) => {
    if (!isRecord(effect)) throw new Error("Each effect must be an object.");
    exactKeys(effect, ["effectKind", "payload"]);
    const effectKind = enumText(effect.effectKind, EFFECT_KINDS);
    if (!isRecord(effect.payload)) throw new Error("Effect payload must be an object.");
    validateEffectPayload(effectKind, effect.payload);
    return Object.freeze({ effectKind, payload: Object.freeze({ ...effect.payload }) });
  }));
}

function validateEffectPayload(
  kind: typeof EFFECT_KINDS[number],
  payload: Record<string, unknown>,
): void {
  const contracts: Record<typeof EFFECT_KINDS[number], readonly string[]> = {
    publish_news: ["audience", "newsDefinitionId"],
    create_contract: ["contractDefinitionId", "targetLocationIds"],
    notify_players: ["audience", "notificationDefinitionId"],
    apply_market_shock: ["magnitudeBasisPoints", "marketShockDefinitionId"],
    set_store_scarcity: ["scarcityDefinitionId", "targetLocationIds"],
    set_route_state: ["reason", "routeDefinitionIds", "state"],
  };
  exactKeys(payload, contracts[kind]);
  for (const [key, item] of Object.entries(payload)) {
    if (key.endsWith("DefinitionId")) token(item, 160);
    if (key === "audience") enumText(item, ["all_players", "affected_players"]);
    if (key === "magnitudeBasisPoints") boundedNumber(item, -5000, 5000);
    if (key === "state") enumText(item, ["open", "restricted", "closed"]);
    if (key === "reason") enumText(item, [
      "normal",
      "shortage",
      "meridian_disruption",
      "war",
      "recovery",
    ]);
    if (key === "targetLocationIds") {
      publicIdArray(item, /^loc_[a-z0-9_]+$/u, 1, 50);
    }
    if (key === "routeDefinitionIds") {
      publicIdArray(item, ROUTE_ID, 1, 100);
    }
  }
}

async function strictBody(
  request: Request,
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  if (new URL(request.url).searchParams.size) {
    throw new Error("Mutation routes do not accept query parameters.");
  }
  const value = await request.clone().json().catch(() => null);
  if (!isRecord(value)) throw new Error("A JSON object is required.");
  exactKeys(value, keys);
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`Request fields must be exactly: ${required.join(", ")}.`);
  }
}

function rejectQuery(request: Request, allowed: readonly string[]): void {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      throw new Error(`Unsupported or repeated query parameter: ${key}.`);
    }
  }
}

function publicRecord(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) =>
      !["id", "game_session_id", "campaign_instance_id", "event_execution_id"]
        .includes(key)
    ),
  );
}

function rpcResult<T>(result: DatabaseResult<T[]>, label: string): OperationResult {
  if (result.error) return databaseError(result.error);
  const rows = result.data ?? [];
  return success({ outcome: rows.length === 1 ? rows[0] : rows, operation: label });
}

function databaseError(error: DatabaseError): OperationResult {
  const message = error.message.toUpperCase();
  if (error.code === "40001" || message.includes("REVISION_CONFLICT")) {
    return errorResult(409, "world_revision_conflict", "World state changed before this operation.", true);
  }
  if (message.includes("NOT_FOUND") || message.includes("UNKNOWN_ROUTE")) {
    return errorResult(404, "world_resource_not_found", "The requested World resource was not found.");
  }
  if (
    message.includes("NOT_MUTABLE") || message.includes("STATE_INVALID") ||
    message.includes("TRANSITION_INVALID") || message.includes("OUT_OF_BOUNDS")
  ) {
    return errorResult(409, "world_transition_invalid", "The World operation is not valid in the current state.");
  }
  if (
    error.code === "42P01" || error.code === "42703" || error.code === "42883" ||
    error.message.toLowerCase().includes("does not exist")
  ) {
    return errorResult(503, "world_schema_unavailable", "World administration is unavailable in this runtime.", true);
  }
  return errorResult(400, "world_admin_operation_failed", "The World administrator operation could not be completed.");
}

function methodOrRoute(input: Input): OperationResult {
  const known = [
    "/world/campaign",
    "/world/campaign/history",
    "/world/campaign/effects",
    "/world/campaign/control",
    "/world/campaign/manual-trigger",
    "/world/arrival-classes",
    "/world/geography",
    "/world/routes/state",
    "/world/travel",
    "/world/residency",
  ];
  return known.includes(input.suffix)
    ? errorResult(405, "method_not_allowed", "The HTTP method is not supported for this World route.")
    : invalid("World administrator route is malformed.");
}

function success(data: unknown): OperationResult {
  return { handled: true, status: 200, body: { data } };
}

function invalid(message: string): OperationResult {
  return errorResult(400, "invalid_world_admin_request", message);
}

function errorResult(
  status: number,
  code: string,
  message: string,
  retryable = false,
): OperationResult {
  return { handled: true, status, body: { code, message, retryable } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, min: number, max: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max) throw new Error("Text field is invalid.");
  return result;
}

function token(value: unknown, max: number): string {
  const result = text(value, 1, max);
  if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(result)) throw new Error("Definition token is invalid.");
  return result;
}

function idempotency(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!IDEMPOTENCY.test(result)) throw new Error("A reviewed requestId is required.");
  return result;
}

function uuid(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID.test(result)) throw new Error("Staff identity is invalid.");
  return result;
}

function publicId(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!pattern.test(result)) throw new Error(`${label} is invalid.`);
  return result;
}

function optionalPublicId(
  value: string | null,
  pattern: RegExp,
  label: string,
): string | null {
  return value === null || value === "" ? null : publicId(value, pattern, label);
}

function publicIdArray(
  value: unknown,
  pattern: RegExp,
  min: number,
  max: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error("Public identifier collection is invalid.");
  }
  const result = value.map((item) => publicId(item, pattern, "public identifier"));
  if (new Set(result).size !== result.length) throw new Error("Public identifiers must be unique.");
  return Object.freeze(result);
}

function enumText<T extends string>(value: unknown, allowed: readonly T[]): T {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!allowed.includes(result as T)) throw new Error("Enumerated field is invalid.");
  return result as T;
}

function nonnegativeInteger(value: unknown): number {
  return boundedNumber(value, 0, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null) return fallback;
  return boundedNumber(Number(value), min, max);
}

function boundedNumber(value: unknown, min: number, max: number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw new Error("Numeric field is invalid.");
  }
  return result;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Boolean field is invalid.");
  return value;
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Timestamp is invalid.");
  }
  return value;
}

function tokenArray(value: unknown, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error("Prerequisite collection is invalid.");
  }
  const result = value.map((item) => token(item, 128));
  if (new Set(result).size !== result.length) throw new Error("Prerequisites must be unique.");
  return Object.freeze(result);
}
