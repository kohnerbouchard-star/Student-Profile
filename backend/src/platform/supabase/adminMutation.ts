/// <reference lib="dom" />

export interface AdminMutationRpcClient {
  rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    readonly data: T | null;
    readonly error: {
      readonly message?: string;
      readonly code?: string;
    } | null;
  }>;
}

export interface AdminMutationIdentity {
  readonly idempotencyKey: string;
  readonly requestId: string;
}

export interface AdminMutationResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly replayed: boolean;
}

interface AdminMutationRpcRow {
  readonly response_status?: unknown;
  readonly response_body?: unknown;
  readonly was_replayed?: unknown;
}

interface AdminMutationReplayRpcRow {
  readonly has_replay?: unknown;
  readonly response_status?: unknown;
  readonly response_body?: unknown;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;

export class AdminMutationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AdminMutationError";
  }
}

export function readAdminMutationIdentity(
  request: Request,
  body: unknown,
): AdminMutationIdentity {
  const canonicalHeader = request.headers.get("idempotency-key")?.trim() ?? "";
  const compatibilityHeader =
    request.headers.get("x-idempotency-key")?.trim() ?? "";

  if (
    canonicalHeader && compatibilityHeader &&
    canonicalHeader !== compatibilityHeader
  ) {
    throw invalidIdentity(
      "idempotency_key_header_mismatch",
      "Idempotency-Key headers must identify the same request.",
    );
  }

  const idempotencyKey = canonicalHeader || compatibilityHeader;
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw invalidIdentity(
      "idempotency_key_required",
      "A stable Idempotency-Key of 8 to 160 safe characters is required.",
    );
  }

  const suppliedBodyKeys = readBodyIdempotencyKeys(body);
  if (suppliedBodyKeys.some((value) => value !== idempotencyKey)) {
    throw invalidIdentity(
      "idempotency_key_body_mismatch",
      "The request body and Idempotency-Key header must match.",
    );
  }

  const suppliedRequestId = request.headers.get("x-request-id")?.trim() ?? "";
  if (suppliedRequestId && !REQUEST_ID_PATTERN.test(suppliedRequestId)) {
    throw invalidIdentity(
      "request_id_invalid",
      "X-Request-Id contains unsupported characters.",
    );
  }

  return {
    idempotencyKey,
    requestId: suppliedRequestId || idempotencyKey,
  };
}

export async function executeAdminMutationRpc(
  client: AdminMutationRpcClient,
  rpcName: string,
  args: Record<string, unknown>,
  fallback: { readonly code: string; readonly message: string },
): Promise<AdminMutationResult> {
  const response = await client.rpc<
    readonly AdminMutationRpcRow[] | AdminMutationRpcRow
  >(rpcName, args);

  if (response.error) {
    throw mapAdminMutationRpcError(
      response.error.message ?? response.error.code ?? "",
      fallback,
    );
  }

  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!isAdminMutationRpcRow(row)) {
    throw new AdminMutationError(fallback.code, fallback.message, 500);
  }

  return {
    status: row.response_status,
    body: row.response_body,
    replayed: row.was_replayed,
  };
}

export async function readAdminMutationReplay(
  client: AdminMutationRpcClient,
  input: {
    readonly gameSessionId: string;
    readonly staffUserId: string;
    readonly operation: string;
    readonly requestPayload: Record<string, unknown>;
    readonly identity: AdminMutationIdentity;
  },
  fallback: { readonly code: string; readonly message: string },
): Promise<AdminMutationResult | null> {
  const response = await client.rpc<
    readonly AdminMutationReplayRpcRow[] | AdminMutationReplayRpcRow
  >("admin_read_mutation_replay_v1", {
    p_game_session_id: input.gameSessionId,
    p_staff_user_id: input.staffUserId,
    p_operation: input.operation,
    p_idempotency_key: input.identity.idempotencyKey,
    p_request_payload: input.requestPayload,
  });
  if (response.error) {
    throw mapAdminMutationRpcError(
      response.error.message ?? response.error.code ?? "",
      fallback,
    );
  }

  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!row || typeof row.has_replay !== "boolean") {
    throw new AdminMutationError(fallback.code, fallback.message, 500);
  }
  if (row.has_replay === false) return null;
  if (
    !Number.isSafeInteger(row.response_status) ||
    Number(row.response_status) < 200 ||
    Number(row.response_status) > 299 ||
    !isRecord(row.response_body)
  ) {
    throw new AdminMutationError(fallback.code, fallback.message, 500);
  }
  return {
    status: Number(row.response_status),
    body: row.response_body,
    replayed: true,
  };
}

export function adminMutationErrorBody(error: AdminMutationError): {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
} {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
  };
}

function readBodyIdempotencyKeys(body: unknown): readonly string[] {
  if (!isRecord(body)) return [];
  const candidates = [body.idempotencyKey];
  if (isRecord(body.meta)) candidates.push(body.meta.idempotencyKey);
  return [
    ...new Set(
      candidates
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function isAdminMutationRpcRow(
  value: unknown,
): value is {
  readonly response_status: number;
  readonly response_body: Record<string, unknown>;
  readonly was_replayed: boolean;
} {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.response_status) &&
    Number(value.response_status) >= 200 &&
    Number(value.response_status) <= 299 &&
    isRecord(value.response_body) &&
    typeof value.was_replayed === "boolean";
}

function mapAdminMutationRpcError(
  message: string,
  fallback: { readonly code: string; readonly message: string },
): AdminMutationError {
  const normalized = message.toUpperCase();

  if (normalized.includes("ADMIN_MUTATION_IDEMPOTENCY_CONFLICT")) {
    return new AdminMutationError(
      "idempotency_key_conflict",
      "That Idempotency-Key was already used for a different request.",
      409,
    );
  }
  if (normalized.includes("ADMIN_MUTATION_IDEMPOTENCY_INVALID")) {
    return invalidIdentity(
      "idempotency_key_invalid",
      "Idempotency-Key is invalid.",
    );
  }
  if (normalized.includes("ADMIN_MUTATION_IDEMPOTENCY_IN_PROGRESS")) {
    return new AdminMutationError(
      "idempotency_request_in_progress",
      "That Idempotency-Key is already being processed.",
      409,
      true,
    );
  }
  if (normalized.includes("ADMIN_MUTATION_GAME_NOT_OWNED")) {
    return new AdminMutationError(
      "game_not_found",
      "That game is not available to this administrator.",
      404,
    );
  }
  if (normalized.includes("ADMIN_PLAYER_NOT_FOUND")) {
    return new AdminMutationError(
      "player_not_found",
      "Player was not found for this game.",
      404,
    );
  }
  if (normalized.includes("PLAYER_IDENTIFIER_CONFLICT")) {
    return new AdminMutationError(
      "player_identifier_conflict",
      "That Player ID is already assigned to an active player in this game.",
      409,
    );
  }
  if (normalized.includes("PLAYER_ACCESS_CODE_CONFLICT")) {
    return new AdminMutationError(
      "player_access_code_conflict",
      "That Access Code is already assigned to an active player in this game.",
      409,
    );
  }
  if (normalized.includes("ADMIN_STORE_ITEM_NOT_FOUND")) {
    return new AdminMutationError(
      "store_item_not_found",
      "Store item was not found.",
      404,
    );
  }
  if (normalized.includes("ADMIN_STORE_SEEDED_ITEM_PROTECTED")) {
    return new AdminMutationError(
      "seeded_store_item_protected",
      "Included Store items cannot be edited or archived. Create a custom item when you need a teacher-managed version.",
      409,
    );
  }
  if (
    normalized.includes("ADMIN_STORE_ITEM_CONFLICT") ||
    normalized.includes("STORE_ITEMS_GAME_SESSION_ID_ITEM_KEY")
  ) {
    return new AdminMutationError(
      "store_item_conflict",
      "That Store item key already exists in this game.",
      409,
    );
  }
  if (normalized.includes("ADMIN_CONTRACT_NOT_FOUND")) {
    return new AdminMutationError(
      "contract_not_found",
      "Contract was not found for this game session.",
      404,
    );
  }
  if (normalized.includes("ADMIN_CONTRACT_NOT_PUBLISHABLE")) {
    return new AdminMutationError(
      "contract_not_publishable",
      "Only draft or scheduled contracts can be published.",
      409,
    );
  }
  if (normalized.includes("ADMIN_CONTRACT_CONFLICT")) {
    return new AdminMutationError(
      "contract_conflict",
      "That contract conflicts with an existing contract in this game.",
      409,
    );
  }
  if (normalized.includes("ADMIN_ATTENDANCE_PERIOD_LOCKED")) {
    return new AdminMutationError(
      "attendance_period_locked",
      "Attendance for that date is locked.",
      423,
    );
  }
  if (
    normalized.includes("ADMIN_ATTENDANCE_PLAYER_NOT_FOUND") ||
    normalized.includes("PLAYER_NOT_FOUND")
  ) {
    return new AdminMutationError(
      "player_not_found",
      "Player was not found for this game.",
      404,
    );
  }
  if (normalized.includes("ADMIN_GAME_SETTINGS_NOT_FOUND")) {
    return new AdminMutationError(
      "game_settings_not_found",
      "Game settings were not found.",
      404,
    );
  }
  if (
    normalized.includes("ADMIN_DIFFICULTY_POLICY_PROFILE_NOT_FOUND") ||
    normalized.includes("ADMIN_DIFFICULTY_POLICY_SOURCE_INVALID") ||
    normalized.includes("ADMIN_GAME_SETTINGS_PATCH_INVALID")
  ) {
    return new AdminMutationError(
      "invalid_game_settings",
      "Game settings contain an unsupported difficulty policy.",
      400,
    );
  }
  if (normalized.includes("GAME_JOIN_CODE_GAME_UNAVAILABLE")) {
    return new AdminMutationError(
      "join_code_game_unavailable",
      "Game join code cannot be changed for this game.",
      409,
    );
  }
  if (normalized.includes("GAME_JOIN_CODE_GENERATION_CONFLICT")) {
    return new AdminMutationError(
      "join_code_generation_conflict",
      "A unique game join code could not be generated.",
      409,
      true,
    );
  }

  return new AdminMutationError(fallback.code, fallback.message, 500);
}

function invalidIdentity(code: string, message: string): AdminMutationError {
  return new AdminMutationError(code, message, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
