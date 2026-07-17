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
    if (!sessionResult.ok) {
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
      summary: {
        total: requests.length,
        pending: requests.filter((entry) => entry.status === "pending").length,
        approved: requests.filter((entry) => entry.status === "approved").length,
        fulfilled: requests.filter((entry) => entry.status === "fulfilled").length,
        rejected: requests.filter((entry) => entry.status === "rejected").length,
      },
      requests,
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
        p_resolution_note: body.resolutionNote || null,
      },
    );
    if (rpcResponse.error) {
      return redemptionPersistenceError(rpcResponse.error.message);
    }
    const row = firstRow(rpcResponse.data);
    if (!row) {
      return jsonError(500, {
        code: "inventory_redemption_review_failed",
        message: "Inventory redemption could not be reviewed.",
        retryable: false,
      });
    }
    return jsonResponse(200, {
      ok: true,
      outcome: row.review_outcome ?? body.action,
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
      message: "Inventory redemption could not be reviewed.",
      retryable: false,
    });
  }
}

async function readPlayers(
  client: EdgeSupabaseClient,
  gameSessionId: string,
  playerIds: readonly string[],
): Promise<readonly PlayerRow[]> {
  if (!playerIds.length) return [];
  const response = await client.from("players")
    .select("id,display_name,roster_label")
    .eq("game_session_id", gameSessionId)
    .in("id", playerIds);
  if (response.error) throw new Error("players_read_failed");
  return (response.data ?? []) as unknown as readonly PlayerRow[];
}

async function readItems(
  client: EdgeSupabaseClient,
  gameSessionId: string,
  itemIds: readonly string[],
): Promise<readonly StoreItemRow[]> {
  if (!itemIds.length) return [];
  const response = await client.from("store_items")
    .select("id,name,category")
    .eq("game_session_id", gameSessionId)
    .in("id", itemIds);
  if (response.error) throw new Error("items_read_failed");
  return (response.data ?? []) as unknown as readonly StoreItemRow[];
}

function firstRow(data: readonly RedemptionRow[] | null): RedemptionRow | null {
  return Array.isArray(data) && data.length ? data[0] : null;
}

function toRedemptionDto(row: RedemptionRow) {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    playerId: row.player_id,
    inventoryHoldingId: row.inventory_holding_id,
    storeItemId: row.store_item_id,
    quantity: Number(row.quantity),
    status: row.status,
    requestNote: row.request_note ?? null,
    resolutionNote: row.resolution_note ?? null,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at ?? null,
    fulfilledAt: row.fulfilled_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPlayerDto(row: PlayerRow | undefined) {
  return row
    ? { id: row.id, displayName: row.display_name, rosterLabel: row.roster_label ?? null }
    : { id: null, displayName: "Unknown player", rosterLabel: null };
}

function toItemDto(row: StoreItemRow | undefined) {
  return row
    ? { id: row.id, name: row.name, category: row.category }
    : { id: null, name: "Unknown item", category: "unknown" };
}

function redemptionPersistenceError(message: string): Response {
  const normalized = String(message || "").toUpperCase();
  const cases: readonly [string, number, string, string][] = [
    ["INVENTORY_REDEMPTION_HOLDING_NOT_FOUND", 404, "inventory_holding_not_found", "Inventory holding was not found."],
    ["INVENTORY_REDEMPTION_REQUEST_NOT_FOUND", 404, "inventory_redemption_not_found", "Inventory redemption request was not found."],
    ["INVENTORY_REDEMPTION_QUANTITY_UNAVAILABLE", 409, "inventory_quantity_unavailable", "The requested inventory quantity is not available."],
    ["INVENTORY_REDEMPTION_IDEMPOTENCY_CONFLICT", 409, "inventory_redemption_idempotency_conflict", "The idempotency key was already used for a different request."],
    ["INVENTORY_REDEMPTION_INVALID_TRANSITION", 409, "inventory_redemption_invalid_transition", "That redemption status transition is not allowed."],
    ["INVENTORY_REDEMPTION_REVIEW_FORBIDDEN", 403, "inventory_redemption_review_forbidden", "This administrator cannot review requests for that game."],
    ["INVENTORY_REDEMPTION_RESERVATION_CORRUPT", 500, "inventory_redemption_reservation_invalid", "Inventory reservation state is inconsistent."],
  ];
  const match = cases.find(([token]) => normalized.includes(token));
  if (match) {
    return jsonError(match[1], {
      code: match[2],
      message: match[3],
      retryable: false,
    });
  }
  return jsonError(500, {
    code: "inventory_redemption_persistence_failed",
    message: "Inventory redemption could not be completed.",
    retryable: false,
  });
}

async function readRedemptionBody(request: Request): Promise<{
  quantity: number;
  note: string;
  idempotencyKey: string;
  [key: string]: unknown;
}> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw new RequestValidationError(
      "invalid_request_body",
      "Request body must be valid JSON.",
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
    );
  }
  const quantity = Number(body.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new RequestValidationError(
      "inventory_redemption_quantity_invalid",
      "Quantity must be an integer between 1 and 100.",
    );
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 1000) {
    throw new RequestValidationError(
      "inventory_redemption_note_too_long",
      "Redemption note must be 1,000 characters or fewer.",
    );
  }
  const idempotencyKey = typeof body.idempotencyKey === "string"
    ? body.idempotencyKey.trim()
    : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new RequestValidationError(
      "inventory_redemption_idempotency_key_invalid",
      "A valid idempotency key is required.",
    );
  }
  return { ...body, quantity, note, idempotencyKey };
}

async function readReviewBody(request: Request): Promise<{
  action: "approve" | "reject" | "fulfill";
  resolutionNote: string;
}> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw new RequestValidationError(
      "invalid_request_body",
      "Request body must be valid JSON.",
    );
  }
  const action = typeof body?.action === "string"
    ? body.action.trim().toLowerCase()
    : "";
  if (!(["approve", "reject", "fulfill"] as const).includes(action as never)) {
    throw new RequestValidationError(
      "inventory_redemption_action_invalid",
      "Action must be approve, reject, or fulfill.",
    );
  }
  const resolutionNote = typeof body.resolutionNote === "string"
    ? body.resolutionNote.trim()
    : "";
  if (resolutionNote.length > 1000) {
    throw new RequestValidationError(
      "inventory_redemption_note_too_long",
      "Resolution note must be 1,000 characters or fewer.",
    );
  }
  return {
    action: action as "approve" | "reject" | "fulfill",
    resolutionNote,
  };
}

function normalizeQueueStatus(value: string | null): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "all") return null;
  if (["pending", "approved", "rejected", "fulfilled", "cancelled"].includes(normalized)) {
    return normalized;
  }
  throw new RequestValidationError(
    "inventory_redemption_status_invalid",
    "Status filter is invalid.",
  );
}

function rejectIdentityFields(body: Record<string, unknown>): void {
  for (const key of ["playerId", "player_id", "studentId", "student_id"]) {
    if (Object.hasOwn(body, key)) {
      throw new RequestValidationError(
        "player_identity_not_allowed",
        "Player identity is derived from the authenticated session.",
      );
    }
  }
}

class RequestValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RequestValidationError";
    this.code = code;
  }
}
