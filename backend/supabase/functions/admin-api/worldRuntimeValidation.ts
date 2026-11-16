import {
  isRecord,
  type WorldRuntimeAdminService,
  EFFECT_KINDS,
  ROUTE_ID,
  type DatabaseResult,
  type OperationResult,
  type DatabaseError,
  type Input,
  IDEMPOTENCY,
  UUID,
} from "./worldRuntimeContracts.ts";


export async function internalCampaignId(
  service: WorldRuntimeAdminService,
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


export function strictEffects(value: unknown): readonly {
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


export function validateEffectPayload(
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


export async function strictBody(
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


export function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`Request fields must be exactly: ${required.join(", ")}.`);
  }
}


export function rejectQuery(request: Request, allowed: readonly string[]): void {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      throw new Error(`Unsupported or repeated query parameter: ${key}.`);
    }
  }
}


export function publicRecord(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) =>
      !["id", "game_session_id", "campaign_instance_id", "event_execution_id"]
        .includes(key)
    ),
  );
}


export function rpcResult<T>(result: DatabaseResult<T[]>, label: string): OperationResult {
  if (result.error) return databaseError(result.error);
  const rows = result.data ?? [];
  return success({ outcome: rows.length === 1 ? rows[0] : rows, operation: label });
}


export function databaseError(error: DatabaseError): OperationResult {
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


export function methodOrRoute(input: Input): OperationResult {
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


export function success(data: unknown): OperationResult {
  return { handled: true, status: 200, body: { data } };
}


export function invalid(message: string): OperationResult {
  return errorResult(400, "invalid_world_admin_request", message);
}


export function errorResult(
  status: number,
  code: string,
  message: string,
  retryable = false,
): OperationResult {
  return { handled: true, status, body: { code, message, retryable } };
}





export function text(value: unknown, min: number, max: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max) throw new Error("Text field is invalid.");
  return result;
}


export function token(value: unknown, max: number): string {
  const result = text(value, 1, max);
  if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(result)) throw new Error("Definition token is invalid.");
  return result;
}


export function idempotency(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!IDEMPOTENCY.test(result)) throw new Error("A reviewed requestId is required.");
  return result;
}


export function uuid(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID.test(result)) throw new Error("Staff identity is invalid.");
  return result;
}


export function publicId(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!pattern.test(result)) throw new Error(`${label} is invalid.`);
  return result;
}


export function optionalPublicId(
  value: string | null,
  pattern: RegExp,
  label: string,
): string | null {
  return value === null || value === "" ? null : publicId(value, pattern, label);
}


export function publicIdArray(
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


export function enumText<T extends string>(value: unknown, allowed: readonly T[]): T {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!allowed.includes(result as T)) throw new Error("Enumerated field is invalid.");
  return result as T;
}


export function nonnegativeInteger(value: unknown): number {
  return boundedNumber(value, 0, Number.MAX_SAFE_INTEGER);
}


export function boundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null) return fallback;
  return boundedNumber(Number(value), min, max);
}


export function boundedNumber(value: unknown, min: number, max: number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw new Error("Numeric field is invalid.");
  }
  return result;
}


export function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Boolean field is invalid.");
  return value;
}


export function nullableTimestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Timestamp is invalid.");
  }
  return value;
}


export function tokenArray(value: unknown, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error("Prerequisite collection is invalid.");
  }
  const result = value.map((item) => token(item, 128));
  if (new Set(result).size !== result.length) throw new Error("Prerequisites must be unique.");
  return Object.freeze(result);
}

export { isRecord } from "./worldRuntimeContracts.ts";
