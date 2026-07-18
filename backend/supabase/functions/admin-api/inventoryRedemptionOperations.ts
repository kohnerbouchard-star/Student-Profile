type RedemptionStatus = "pending" | "approved" | "rejected" | "fulfilled";
type ReviewAction = "approve" | "reject" | "fulfill";

interface RpcError {
  readonly code?: string;
  readonly message: string;
}

interface RpcResponse<T> {
  readonly data: T | null;
  readonly error: RpcError | null;
}

interface AdminService {
  rpc<T>(name: string, args: unknown): PromiseLike<RpcResponse<T>>;
}

interface RedemptionRow {
  readonly review_outcome?: unknown;
  readonly request_id: unknown;
  readonly item_id: unknown;
  readonly quantity: unknown;
  readonly status: unknown;
  readonly request_note: unknown;
  readonly resolution_note: unknown;
  readonly requested_at: unknown;
  readonly reviewed_at: unknown;
  readonly fulfilled_at: unknown;
  readonly updated_at: unknown;
  readonly player_reference: unknown;
  readonly player_display_name: unknown;
  readonly player_roster_label: unknown;
  readonly item_name: unknown;
  readonly item_category: unknown;
}

export interface InventoryRedemptionOperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

const REQUEST_ID_PATTERN = /^red_[0-9a-f]{32}$/;
const ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const STATUSES = new Set<RedemptionStatus>([
  "pending",
  "approved",
  "rejected",
  "fulfilled",
]);

export async function handleInventoryRedemptionOperation(
  service: AdminService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly suffix: string;
  },
): Promise<InventoryRedemptionOperationResult> {
  if (input.suffix === "/inventory/redemptions") {
    if (input.request.method !== "GET") {
      return methodNotAllowed("Use GET to load the redemption queue.");
    }
    return await readQueue(service, input);
  }

  const actionMatch = input.suffix.match(
    /^\/inventory\/redemptions\/(red_[0-9a-f]{32})\/(approve|reject|fulfill)$/,
  );
  if (!actionMatch) {
    return input.suffix.startsWith("/inventory/redemptions")
      ? invalid("Inventory redemption route is malformed.")
      : { handled: false };
  }
  if (input.request.method !== "POST") {
    return methodNotAllowed("Use POST to review an inventory redemption.");
  }
  return await review(
    service,
    input,
    actionMatch[1],
    actionMatch[2] as ReviewAction,
  );
}

async function readQueue(
  service: AdminService,
  input: Parameters<typeof handleInventoryRedemptionOperation>[1],
): Promise<InventoryRedemptionOperationResult> {
  try {
    const url = new URL(input.request.url);
    const keys: string[] = [];
    url.searchParams.forEach((_value, key) => keys.push(key));
    for (const key of keys) {
      if (
        !["status", "limit", "offset"].includes(key) ||
        url.searchParams.getAll(key).length !== 1
      ) {
        return invalid(`Unsupported or repeated query parameter: ${key}.`);
      }
    }

    const statusText = url.searchParams.get("status")?.trim().toLowerCase() ??
      "pending";
    const status = statusText === "all" || statusText === "history"
      ? null
      : STATUSES.has(statusText as RedemptionStatus)
      ? statusText as RedemptionStatus
      : undefined;
    if (status === undefined) {
      return invalid("Redemption status filter is invalid.");
    }
    const limit = boundedInteger(url.searchParams.get("limit"), 25, 1, 50);
    const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10000);
    if (limit === null || offset === null) {
      return invalid("Redemption pagination is invalid.");
    }

    const response = await service.rpc<readonly RedemptionRow[]>(
      "read_admin_inventory_redemptions_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_status: status,
        p_limit: limit + 1,
        p_offset: offset,
      },
    );
    if (response.error) return rpcError(response.error);
    const rows = response.data ?? [];
    if (rows.length > limit + 1) return failed();
    const hasMore = rows.length > limit;
    const redemptions = rows.slice(0, limit).map(toDto);
    const summary = summarize(redemptions);
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          redemptions,
          requests: redemptions,
          summary,
          pagination: {
            limit,
            offset,
            returned: redemptions.length,
            hasMore,
          },
          filters: { status: status ?? "all" },
        },
      },
    };
  } catch {
    return failed();
  }
}

async function review(
  service: AdminService,
  input: Parameters<typeof handleInventoryRedemptionOperation>[1],
  requestId: string,
  action: ReviewAction,
): Promise<InventoryRedemptionOperationResult> {
  try {
    const url = new URL(input.request.url);
    if (url.searchParams.size) {
      return invalid("Redemption review does not accept query parameters.");
    }
    const value = await input.request.clone().json().catch(() => null);
    if (!isRecord(value)) {
      return invalid("Provide a valid redemption review JSON object.");
    }
    const keys = Object.keys(value);
    if (
      keys.some((key) => !["idempotencyKey", "note", "reason"].includes(key))
    ) {
      return invalid("Only idempotencyKey, note, and reason are accepted.");
    }
    const bodyKey = typeof value.idempotencyKey === "string"
      ? value.idempotencyKey.trim()
      : "";
    const headerKey = input.request.headers.get("x-idempotency-key")?.trim() ??
      input.request.headers.get("x-request-id")?.trim() ?? "";
    if (bodyKey && headerKey && bodyKey !== headerKey) {
      return invalid("Request and header idempotency keys must match.");
    }
    const idempotencyKey = bodyKey || headerKey;
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      return invalid("A safe idempotency key is required.");
    }
    const noteValue = value.reason ?? value.note ?? null;
    if (noteValue !== null && typeof noteValue !== "string") {
      return invalid("Review note must be a string.");
    }
    if (
      typeof value.reason === "string" && typeof value.note === "string" &&
      value.reason.trim() !== value.note.trim()
    ) return invalid("Conflicting review reason and note were provided.");
    const note = typeof noteValue === "string" ? noteValue.trim() : "";
    if (note.length > 1000 || (action === "reject" && !note)) {
      return invalid(
        action === "reject"
          ? "A rejection reason is required."
          : "Review note must not exceed 1000 characters.",
      );
    }

    const response = await service.rpc<readonly RedemptionRow[]>(
      "review_inventory_redemption_atomic_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_request_public_id: requestId,
        p_action: action,
        p_resolution_note: note || null,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (response.error) return rpcError(response.error);
    const row = response.data?.[0];
    if (!row) return failed();
    const outcome = requiredText(row.review_outcome);
    if (outcome !== "applied" && outcome !== "replayed") return failed();
    const redemption = toDto(row);
    if (redemption.id !== requestId) return failed();
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          outcome,
          action,
          redemption,
          effectApplication: "not_automated",
        },
      },
    };
  } catch {
    return failed();
  }
}

function toDto(row: RedemptionRow) {
  const id = requiredText(row.request_id);
  const itemId = requiredText(row.item_id);
  const status = requiredText(row.status);
  const quantity = typeof row.quantity === "number"
    ? row.quantity
    : Number(row.quantity);
  if (
    !REQUEST_ID_PATTERN.test(id) || !ITEM_ID_PATTERN.test(itemId) ||
    !STATUSES.has(status as RedemptionStatus) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 || quantity > 100
  ) throw new Error("invalid redemption row");
  return {
    id,
    itemId,
    quantity,
    status: status as RedemptionStatus,
    requestNote: safeOptionalText(row.request_note),
    resolutionNote: safeOptionalText(row.resolution_note),
    requestedAt: timestamp(row.requested_at),
    reviewedAt: optionalTimestamp(row.reviewed_at),
    fulfilledAt: optionalTimestamp(row.fulfilled_at),
    updatedAt: timestamp(row.updated_at),
    player: {
      reference: safeOptionalText(row.player_reference),
      displayName: safeRequiredText(row.player_display_name, "Player"),
      rosterLabel: safeOptionalText(row.player_roster_label),
    },
    item: {
      id: itemId,
      name: safeRequiredText(row.item_name, "Item"),
      category: safeRequiredText(row.item_category, "general"),
    },
  };
}

function summarize(rows: readonly { readonly status: RedemptionStatus }[]) {
  return {
    returned: rows.length,
    pending: rows.filter((row) => row.status === "pending").length,
    approved: rows.filter((row) => row.status === "approved").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    fulfilled: rows.filter((row) => row.status === "fulfilled").length,
  };
}

function rpcError(error: RpcError): InventoryRedemptionOperationResult {
  const message = error.message.toUpperCase();
  const lower = error.message.toLowerCase();
  if (
    error.code === "42P01" || error.code === "42703" ||
    error.code === "42883" ||
    lower.includes("does not exist") || lower.includes("schema cache")
  ) {
    return errorResult(
      503,
      "inventory_redemption_schema_not_applied",
      "Inventory redemption is unavailable in this runtime.",
      true,
    );
  }
  if (message.includes("INVENTORY_REDEMPTION_ADMIN_SCOPE_FORBIDDEN")) {
    return errorResult(
      404,
      "inventory_redemption_not_found",
      "Inventory redemption queue was not found.",
    );
  }
  if (message.includes("INVENTORY_REDEMPTION_REVIEW_NOT_FOUND")) {
    return errorResult(
      404,
      "inventory_redemption_not_found",
      "Inventory redemption request was not found.",
    );
  }
  if (message.includes("INVENTORY_REDEMPTION_REVIEW_IDEMPOTENCY_CONFLICT")) {
    return errorResult(
      409,
      "inventory_redemption_idempotency_conflict",
      "This idempotency key was already used for another review.",
    );
  }
  if (
    message.includes("INVENTORY_REDEMPTION_REVIEW_TRANSITION_INVALID") ||
    message.includes("INVENTORY_REDEMPTION_REVIEW_RESERVATION_INVALID")
  ) {
    return errorResult(
      409,
      "inventory_redemption_transition_invalid",
      "Inventory redemption can no longer perform this action.",
    );
  }
  if (
    message.includes("INVENTORY_REDEMPTION_REVIEW_INVALID") ||
    message.includes("INVENTORY_REDEMPTION_ADMIN_READ_INVALID")
  ) {
    return invalid("Inventory redemption request is invalid.");
  }
  return failed();
}

function methodNotAllowed(message: string): InventoryRedemptionOperationResult {
  return errorResult(405, "method_not_allowed", message);
}

function invalid(message: string): InventoryRedemptionOperationResult {
  return errorResult(400, "invalid_inventory_redemption_request", message);
}

function failed(): InventoryRedemptionOperationResult {
  return errorResult(
    500,
    "inventory_redemption_failed",
    "Inventory redemption could not be completed.",
  );
}

function errorResult(
  status: number,
  code: string,
  message: string,
  retryable = false,
): InventoryRedemptionOperationResult {
  return { handled: true, status, body: { code, message, retryable } };
}

function boundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error("text required");
}

function safeRequiredText(value: unknown, fallback: string): string {
  const text = requiredText(value).replaceAll(UUID_PATTERN, "[redacted]");
  return text || fallback;
}

function safeOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return safeRequiredText(value, "") || null;
}

function timestamp(value: unknown): string {
  const text = requiredText(value);
  if (Number.isNaN(Date.parse(text))) throw new Error("timestamp required");
  return text;
}

function optionalTimestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : timestamp(value);
}
