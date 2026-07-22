interface OperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

interface QueryError {
  readonly message?: string;
  readonly code?: string;
}

interface RpcResponse {
  readonly data: unknown;
  readonly error: QueryError | null;
}

interface CraftingAdminClient {
  rpc(functionName: string, args?: unknown): PromiseLike<RpcResponse>;
}

const JOB_KEY = /^cft_[0-9a-f]{32}$/;
const ITEM_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const COUNTRY_CODE = /^[A-Z]{3}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATUSES = new Set(["in_progress", "completed", "claimed", "cancelled", "failed"]);

export async function handleCraftingOperation(
  service: CraftingAdminClient,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly suffix: string;
  },
): Promise<OperationResult> {
  if (input.suffix === "/crafting/oversight" && input.request.method === "GET") {
    const url = new URL(input.request.url);
    const queryKeys: string[] = [];
    url.searchParams.forEach((_value, key) => queryKeys.push(key));
    if (queryKeys.some((key) => !["status", "limit"].includes(key))) {
      return invalid("Unsupported crafting oversight query parameter.");
    }
    const status = url.searchParams.get("status")?.trim().toLowerCase() || null;
    if (status && !STATUSES.has(status)) return invalid("Crafting job status is invalid.");
    const limit = Number(url.searchParams.get("limit") || 100);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250) {
      return invalid("Crafting oversight limit must be from 1 through 250.");
    }
    return rpc(service, "read_admin_crafting_oversight_v1", {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_status: status,
      p_limit: limit,
    });
  }

  const recovery = input.suffix.match(/^\/crafting\/jobs\/([^/]+)\/recover$/);
  if (recovery && input.request.method === "POST") {
    const jobKey = decodeURIComponent(recovery[1]);
    if (!JOB_KEY.test(jobKey)) return invalid("Crafting job identifier is invalid.");
    const body = await readObject(input.request);
    if (body.ok === false) return body.result;
    if (!onlyKeys(body.value, ["outcome", "reason", "idempotencyKey"])) {
      return invalid("Only outcome, reason, and idempotencyKey are accepted.");
    }
    const outcome = readText(body.value.outcome).toLowerCase();
    const reason = readText(body.value.reason);
    const idempotencyKey = readText(body.value.idempotencyKey);
    if (!["release_and_fail", "requeue"].includes(outcome) || reason.length < 3 ||
        reason.length > 1000 || !IDEMPOTENCY.test(idempotencyKey)) {
      return invalid("Crafting recovery request is invalid.");
    }
    return rpc(service, "recover_admin_crafting_job_v1", {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_job_public_id: jobKey,
      p_outcome: outcome,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
  }

  const supply = input.suffix.match(/^\/crafting\/supply\/([^/]+)$/);
  if (supply && input.request.method === "POST") {
    const itemKey = decodeURIComponent(supply[1]).toLowerCase();
    if (!ITEM_KEY.test(itemKey)) return invalid("Supply item key is invalid.");
    const body = await readObject(input.request);
    if (body.ok === false) return body.result;
    const accepted = [
      "countryCode", "scarcityBand", "availableQuantity", "eventMultiplier",
      "routeMultiplier", "sourceEventKey", "expiresAt", "idempotencyKey",
    ];
    if (!onlyKeys(body.value, accepted)) return invalid("Supply request contains unsupported fields.");
    const idempotencyKey = readText(body.value.idempotencyKey);
    const scarcityBand = readText(body.value.scarcityBand).toLowerCase();
    const countryCode = body.value.countryCode === null || body.value.countryCode === undefined
      ? null
      : readText(body.value.countryCode).toUpperCase();
    const sourceEventKey = body.value.sourceEventKey === null || body.value.sourceEventKey === undefined
      ? null
      : readText(body.value.sourceEventKey);
    const availableQuantity = body.value.availableQuantity === null
      ? null
      : Number(body.value.availableQuantity);
    const eventMultiplier = body.value.eventMultiplier === undefined ? 1 : Number(body.value.eventMultiplier);
    const routeMultiplier = body.value.routeMultiplier === undefined ? 1 : Number(body.value.routeMultiplier);
    if (
      !IDEMPOTENCY.test(idempotencyKey) ||
      !["abundant", "available", "constrained", "scarce", "unavailable"].includes(scarcityBand) ||
      (countryCode !== null && !COUNTRY_CODE.test(countryCode)) ||
      (sourceEventKey !== null && !SAFE_REFERENCE.test(sourceEventKey)) ||
      (availableQuantity !== null && (!Number.isSafeInteger(availableQuantity) || availableQuantity < 0)) ||
      !Number.isFinite(eventMultiplier) || eventMultiplier < 0.5 || eventMultiplier > 4 ||
      !Number.isFinite(routeMultiplier) || routeMultiplier < 0.5 || routeMultiplier > 4
    ) return invalid("Supply request is invalid.");

    const expiresAt = body.value.expiresAt === null || body.value.expiresAt === undefined
      ? null
      : readText(body.value.expiresAt);
    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return invalid("expiresAt is invalid.");
    return rpc(service, "apply_admin_physical_economy_supply_v1", {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_item_key: itemKey,
      p_country_code: countryCode,
      p_scarcity_band: scarcityBand,
      p_available_quantity: availableQuantity,
      p_event_multiplier: eventMultiplier,
      p_route_multiplier: routeMultiplier,
      p_source_event_key: sourceEventKey,
      p_expires_at: expiresAt,
      p_idempotency_key: idempotencyKey,
    });
  }

  return { handled: false };
}

async function rpc(
  service: CraftingAdminClient,
  functionName: string,
  args: unknown,
): Promise<OperationResult> {
  const response = await service.rpc(functionName, args);
  if (response.error) return mapError(response.error);
  return {
    handled: true,
    status: 200,
    body: { data: response.data },
  };
}

async function readObject(request: Request): Promise<
  { readonly ok: true; readonly value: Record<string, unknown> } |
  { readonly ok: false; readonly result: OperationResult }
> {
  const text = await request.text();
  if (!text.trim() || new TextEncoder().encode(text).byteLength > 32_768) {
    return { ok: false, result: invalid("Provide a valid JSON object.") };
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return { ok: true, value };
  } catch {
    return { ok: false, result: invalid("Provide a valid JSON object.") };
  }
}

function onlyKeys(value: Record<string, unknown>, accepted: readonly string[]): boolean {
  return Object.keys(value).every((key) => accepted.includes(key));
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function invalid(message: string): OperationResult {
  return {
    handled: true,
    status: 400,
    body: { code: "invalid_crafting_admin_request", message },
  };
}

function mapError(error: QueryError): OperationResult {
  const message = String(error.message || "").toUpperCase();
  if (message.includes("SCOPE_INVALID") || message.includes("NOT_FOUND")) {
    return {
      handled: true,
      status: 404,
      body: { code: "crafting_admin_resource_not_found", message: "Crafting resource was not found." },
    };
  }
  if (message.includes("UNSAFE") || message.includes("IDEMPOTENCY")) {
    return {
      handled: true,
      status: 409,
      body: { code: "crafting_admin_conflict", message: "Crafting state conflicts with the requested operation." },
    };
  }
  if (message.includes("INVALID")) return invalid("Crafting administrator request is invalid.");
  return {
    handled: true,
    status: 500,
    body: { code: "crafting_admin_failed", message: "Crafting administrator operation failed." },
  };
}
