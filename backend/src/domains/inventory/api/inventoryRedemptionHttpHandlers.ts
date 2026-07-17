/// <reference lib="dom" />

import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import {
  readRequestedGameSessionId,
  rejectClientSuppliedPlayerIdentity,
  requireMatchingPlayerGameSession,
} from "../../players/api/playerRequestScope.ts";

interface PlayerInventoryRedemptionDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: typeof resolveActivePlayerSession;
  readonly now?: () => string;
}

export interface StaffInventoryRedemptionDependencies {
  readonly serviceClient: EdgeSupabaseClient;
  readonly staffUserId: string;
  readonly now?: () => string;
}

interface RedemptionRow {
  readonly request_outcome?: string;
  readonly review_outcome?: string;
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly inventory_holding_id: string;
  readonly store_item_id: string;
  readonly quantity: number | string;
  readonly status: string;
  readonly request_note: string | null;
  readonly resolution_note: string | null;
  readonly requested_at: string;
  readonly reviewed_at: string | null;
  readonly fulfilled_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface PlayerRow {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
}

interface StoreItemRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
}

const REDEMPTION_SELECT = [
  "id",
  "game_session_id",
  "player_id",
  "inventory_holding_id",
  "store_item_id",
  "quantity",
  "status",
  "request_note",
  "resolution_note",
  "requested_at",
  "reviewed_at",
  "fulfilled_at",
  "created_at",
  "updated_at",
].join(",");

export async function handlePlayerInventoryRedemptionRequest(
  request: Request,
  inventoryHoldingId: string,
  dependencies: PlayerInventoryRedemptionDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to request inventory redemption.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player inventory requests must not send a runner secret.",
      retryable: false,
    });
  }

  try {
    const body = await readRedemptionBody(request);
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    rejectClientSuppliedPlayerIdentity(request);
    rejectIdentityFields(body);
    const requestedGameSessionId = readRequestedGameSessionId(request);
    const sessionToken = readPlayerSessionTokenFromRequest(request);
    if (!sessionToken) return invalidPlayerSessionResponse();

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);
    if (sessionResult.ok === false) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    requireMatchingPlayerGameSession(
      requestedGameSessionId,
      sessionResult.session.game_session_id,
    );

    const requestHash = await sha256Hex(JSON.stringify({
      inventoryHoldingId,
      quantity: body.quantity,
      note: body.note,
    }));
    const rpcResponse = await serviceClient.rpc<readonly RedemptionRow[]>(
      "request_inventory_redemption",
      {
        p_game_session_id: sessionResult.session.game_session_id,
        p_player_id: sessionResult.session.player_id,
        p_inventory_holding_id: inventoryHoldingId,
        p_quantity: body.quantity,
        p_request_note: body.note || null,
        p_idempotency_key: body.idempotencyKey,
        p_request_hash: requestHash,
      },
    );

    if (rpcResponse.error) {
      return redemptionPersistenceError(rpcResponse.error.message);
    }

    const row = firstRow(rpcResponse.data);
    if (!row) {
      return jsonError(500, {
        code: "inventory_redemption_request_failed",
        message: "Inventory redemption could not be requested.",
        retryable: false,
      });
    }

    return jsonResponse(row.request_outcome === "created" ? 201 : 200, {
      ok: true,
      outcome: row.request_outcome ?? "created",
      generatedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
      redemption: toRedemptionDto(row),
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (error instanceof RequestValidationError) {
      return jsonError(400, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }
    return jsonError(500, {
      code: "inventory_redemption_request_failed",
      message: "Inventory redemption could not be requested.",
      retryable: false,
    });
  }
}

export async function handleStaffInventoryRedemptionRequest(
  request: Request,
  gameSessionId: string,
  requestId: string | null,
  dependencies: StaffInventoryRedemptionDependencies,
): Promise<Response> {
  if (request.method === "GET" && requestId === null) {
    return readStaffRedemptionQueue(request, gameSessionId, dependencies);
  }

  if (request.method === "PATCH" && requestId) {
    return reviewStaffRedemption(request, gameSessionId, requestId, dependencies);
  }

  return jsonError(405, {
    code: "method_not_allowed",
    message: requestId
      ? "Use PATCH to review an inventory redemption request."
      : "Use GET to load the inventory redemption queue.",
    retryable: false,
  });
}

async function readStaffRedemptionQueue(
  request: Request,
  gameSessionId: string,
  dependencies: StaffInventoryRedemptionDependencies,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const status = normalizeQueueStatus(url.searchParams.get("status"));
    let query = dependencies.serviceClient
      .from("inventory_redemption_requests")
      .select(REDEMPTION_SELECT)
      .eq("game_session_id", gameSessionId)
      .order("requested_at", { ascending: false })
      .limit(250);
    if (status) query = query.eq("status", status);

    const response = await query;
    if (response.error) {
      return jsonError(500, {
        code: "inventory_redemption_queue_failed",
        message: "Inventory redemption requests could not be loaded.",
        retryable: false,
      });
    }

    const rows = (response.data ?? []) as unknown as readonly RedemptionRow[];
    const playerIds = [...new Set(rows.map((row) => row.player_id))];
    const itemIds = [...new Set(rows.map((row) => row.store_item_id))];
    const [players, items] = await Promise.all([
      readPlayers(dependencies.serviceClient, gameSessionId, playerIds),
      readItems(dependencies.serviceClient, gameSessionId, itemIds),
    ]);
    const playerById = new Map(players.map((row) => [row.id, row]));
    const itemById = new Map(items.map((row) => [row.id, row]));

    const requests = rows.map((row) => ({
      ...toRedemptionDto(row),
      player: toPlayerDto(playerById.get(row.player_id)),
      item: toItemDto(itemById.get(row.store_item_id)),
    }));

    return jsonResponse(200, {
      ok: true,
      generatedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
      requests,
      summary: summarizeRequests(requests),
    });
  } catch {
    return jsonError(500, {
      code: "inventory_redemption_queue_failed",
      message: "Inventory redemption requests could not be loaded.",
      retryable: false,
    });
  }
}

async function reviewStaffRedemption(
  request: Request,
  gameSessionId: string,
  requestId: string,
  dependencies: StaffInventoryRedemptionDependencies,
): Promise<Response> {
  try {
    const body = await readReviewBody(request);
    const rpcResponse = await dependencies.serviceClient.rpc<readonly RedemptionRow[]>(
      "review_inventory_redemption",
      {
        p_game_session_id: gameSessionId,
        p_request_id: requestId,
        p_staff_user_id: dependencies.staffUserId,
        p_action: body.action,
        p_resolution_note: body.note || null,
      },
    );

    if (rpcResponse.error) {
      return redemptionPersistenceError(rpcResponse.error.message, true);
    }

    const row = firstRow(rpcResponse.data);
    if (!row) {
      return jsonError(404, {
        code: "inventory_redemption_not_found",
        message: "Inventory redemption request was not found.",
        retryable: false,
      });
    }

    return jsonResponse(200, {
      ok: true,
      outcome: row.review_outcome ?? "updated",
      generatedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
      redemption: toRedemptionDto(row),
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return jsonError(400, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }
    return jsonError(500, {
      code: "inventory_redemption_review_failed",
      message: "Inventory redemption request could not be reviewed.",
      retryable: false,
    });
  }
}

async function readPlayers(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerIds: readonly string[],
): Promise<readonly PlayerRow[]> {
  if (playerIds.length === 0) return [];
  const response = await serviceClient
    .from("players")
    .select("id,display_name,roster_label")
    .eq("game_session_id", gameSessionId)
    .in("id", playerIds);
  if (response.error) throw new Error("inventory redemption player lookup failed");
  return (response.data ?? []) as unknown as readonly PlayerRow[];
}

async function readItems(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  itemIds: readonly string[],
): Promise<readonly StoreItemRow[]> {
  if (itemIds.length === 0) return [];
  const response = await serviceClient
    .from("store_items")
    .select("id,name,category")
    .eq("game_session_id", gameSessionId)
    .in("id", itemIds);
  if (response.error) throw new Error("inventory redemption item lookup failed");
  return (response.data ?? []) as unknown as readonly StoreItemRow[];
}

function firstRow(data: readonly RedemptionRow[] | RedemptionRow | null): RedemptionRow | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function toRedemptionDto(row: RedemptionRow) {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    playerId: row.player_id,
    inventoryHoldingId: row.inventory_holding_id,
    storeItemId: row.store_item_id,
    quantity: Number(row.quantity),
    status: row.status.toLowerCase(),
    requestNote: row.request_note,
    resolutionNote: row.resolution_note,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    fulfilledAt: row.fulfilled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPlayerDto(row: PlayerRow | undefined) {
  return row
    ? { id: row.id, displayName: row.display_name, rosterLabel: row.roster_label }
    : null;
}

function toItemDto(row: StoreItemRow | undefined) {
  return row ? { id: row.id, name: row.name, category: row.category } : null;
}

function summarizeRequests(requests: readonly { status: string }[]) {
  return {
    total: requests.length,
    pending: requests.filter((request) => request.status === "pending").length,
    approved: requests.filter((request) => request.status === "approved").length,
    fulfilled: requests.filter((request) => request.status === "fulfilled").length,
    rejected: requests.filter((request) => request.status === "rejected").length,
  };
}

function normalizeQueueStatus(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized || normalized === "all") return null;
  if (["pending", "approved", "fulfilled", "rejected"].includes(normalized)) {
    return normalized.toUpperCase();
  }
  throw new RequestValidationError(
    "inventory_redemption_status_invalid",
    "Inventory redemption status is invalid.",
  );
}

async function readRedemptionBody(request: Request): Promise<{
  readonly quantity: number;
  readonly note: string;
  readonly idempotencyKey: string;
  readonly [key: string]: unknown;
}> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new RequestValidationError(
      "invalid_request_body",
      "Provide a valid inventory redemption request.",
    );
  }
  const quantity = Number((body as Record<string, unknown>).quantity ?? 1);
  const note = String((body as Record<string, unknown>).note ?? "").trim();
  const idempotencyKey = String(
    (body as Record<string, unknown>).idempotencyKey ?? "",
  ).trim();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new RequestValidationError(
      "inventory_redemption_quantity_invalid",
      "Redemption quantity must be an integer between 1 and 100.",
    );
  }
  if (!idempotencyKey || idempotencyKey.length > 160) {
    throw new RequestValidationError(
      "inventory_redemption_idempotency_key_invalid",
      "A valid idempotency key is required.",
    );
  }
  if (note.length > 1000) {
    throw new RequestValidationError(
      "inventory_redemption_note_too_long",
      "Redemption notes may contain at most 1,000 characters.",
    );
  }
  return { ...(body as Record<string, unknown>), quantity, note, idempotencyKey };
}

async function readReviewBody(request: Request): Promise<{
  readonly action: "approve" | "reject" | "fulfill";
  readonly note: string;
}> {
  const body = await request.json().catch(() => null);
  const action = String((body as Record<string, unknown> | null)?.action ?? "")
    .trim()
    .toLowerCase();
  const note = String((body as Record<string, unknown> | null)?.note ?? "").trim();
  if (!["approve", "reject", "fulfill"].includes(action)) {
    throw new RequestValidationError(
      "inventory_redemption_action_invalid",
      "Action must be approve, reject, or fulfill.",
    );
  }
  if (note.length > 1000) {
    throw new RequestValidationError(
      "inventory_redemption_note_too_long",
      "Resolution notes may contain at most 1,000 characters.",
    );
  }
  return { action: action as "approve" | "reject" | "fulfill", note };
}

function rejectIdentityFields(body: Record<string, unknown>) {
  for (const key of ["playerId", "player_id", "playerSessionId", "player_session_id"]) {
    if (Object.hasOwn(body, key)) {
      throw new RequestValidationError(
        "invalid_player_request",
        "Player identity must come from the authenticated player session.",
      );
    }
  }
}

function redemptionPersistenceError(message: string, staff = false): Response {
  const normalized = message.toUpperCase();
  const mapping: readonly [string, number, string, string][] = [
    ["INVENTORY_REDEMPTION_IDEMPOTENCY_CONFLICT", 409, "inventory_redemption_idempotency_conflict", "That idempotency key was already used for a different redemption request."],
    ["INVENTORY_REDEMPTION_INSUFFICIENT_AVAILABLE", 409, "inventory_redemption_insufficient_available", "The requested quantity is no longer available."],
    ["INVENTORY_REDEMPTION_HOLDING_NOT_FOUND", 404, "inventory_redemption_holding_not_found", "Inventory item was not found."],
    ["INVENTORY_REDEMPTION_REQUEST_NOT_FOUND", 404, "inventory_redemption_not_found", "Inventory redemption request was not found."],
    ["INVENTORY_REDEMPTION_INVALID_TRANSITION", 409, "inventory_redemption_invalid_transition", "That redemption transition is not allowed."],
  ];
  const matched = mapping.find(([needle]) => normalized.includes(needle));
  if (matched) {
    return jsonError(matched[1], {
      code: matched[2],
      message: matched[3],
      retryable: false,
    });
  }
  return jsonError(500, {
    code: staff
      ? "inventory_redemption_review_failed"
      : "inventory_redemption_request_failed",
    message: staff
      ? "Inventory redemption request could not be reviewed."
      : "Inventory redemption could not be requested.",
    retryable: false,
  });
}

class RequestValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
