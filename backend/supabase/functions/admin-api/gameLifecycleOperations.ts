type LifecycleState = "draft" | "active" | "paused" | "ended" | "archived";
type LifecycleAction = "start" | "pause" | "resume" | "end" | "archive" | "revoke_sessions";

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

interface LifecycleRow {
  readonly transition_outcome?: unknown;
  readonly transition_action?: unknown;
  readonly previous_state?: unknown;
  readonly lifecycle_state: unknown;
  readonly operational_status: unknown;
  readonly lifecycle_version: unknown;
  readonly sessions_revoked?: unknown;
  readonly join_code_status: unknown;
  readonly active_player_sessions?: unknown;
  readonly allowed_actions: unknown;
  readonly started_at: unknown;
  readonly paused_at: unknown;
  readonly resumed_at: unknown;
  readonly ended_at: unknown;
  readonly archived_at: unknown;
  readonly updated_at: unknown;
}

export interface GameLifecycleOperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

const ACTIONS = new Set<LifecycleAction>([
  "start",
  "pause",
  "resume",
  "end",
  "archive",
  "revoke_sessions",
]);
const STATES = new Set<LifecycleState>([
  "draft",
  "active",
  "paused",
  "ended",
  "archived",
]);
const OPERATIONAL_STATUSES = new Set(["active", "disabled", "archived"]);
const JOIN_CODE_STATUSES = new Set(["pending", "active", "revoked"]);
const OUTCOMES = new Set(["applied", "already_current", "replayed"]);
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export async function handleGameLifecycleOperation(
  service: AdminService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly suffix: string;
  },
): Promise<GameLifecycleOperationResult> {
  if (input.suffix === "/lifecycle") {
    if (input.request.method !== "GET") {
      return methodNotAllowed("Use GET to load the game lifecycle.");
    }
    if (new URL(input.request.url).searchParams.size) {
      return invalid("Game lifecycle reads do not accept query parameters.");
    }
    return await readLifecycle(service, input);
  }

  const transitionMatch = input.suffix.match(
    /^\/lifecycle\/(start|pause|resume|end|archive)$/,
  );
  const revokeSessions = input.suffix === "/sessions/revoke";
  if (!transitionMatch && !revokeSessions) {
    return input.suffix.startsWith("/lifecycle") ||
        input.suffix.startsWith("/sessions/revoke")
      ? invalid("Game lifecycle route is malformed.")
      : { handled: false };
  }
  if (input.request.method !== "POST") {
    return methodNotAllowed("Use POST to change the game lifecycle.");
  }
  const action = revokeSessions
    ? "revoke_sessions"
    : transitionMatch?.[1] as LifecycleAction;
  return await transitionLifecycle(service, input, action);
}

export function guardGameScopedMutation(input: {
  readonly method: string;
  readonly operationalStatus: unknown;
  readonly suffix: string;
}): GameLifecycleOperationResult {
  if (["GET", "HEAD", "OPTIONS"].includes(input.method)) {
    return { handled: false };
  }
  if (
    input.suffix === "/sessions/revoke" ||
    input.suffix.startsWith("/lifecycle/")
  ) {
    return { handled: false };
  }
  const status = typeof input.operationalStatus === "string"
    ? input.operationalStatus.trim().toLowerCase()
    : "";
  if (status === "active") return { handled: false };
  if (status === "disabled" && input.suffix === "/join-code/reset") {
    return { handled: false };
  }
  if (status === "disabled") {
    return errorResult(
      423,
      "game_mutations_paused",
      "Game mutations are paused or the game has not started. Resume or start the game before changing game data.",
      true,
    );
  }
  if (status === "archived") {
    return errorResult(
      409,
      "game_lifecycle_terminal",
      "This game has ended or been archived. Game data can no longer be changed.",
      false,
    );
  }
  return errorResult(
    409,
    "game_lifecycle_unknown",
    "The game lifecycle state is unavailable. Mutations are blocked until it is reconciled.",
    true,
  );
}

async function readLifecycle(
  service: AdminService,
  input: Parameters<typeof handleGameLifecycleOperation>[1],
): Promise<GameLifecycleOperationResult> {
  try {
    const response = await service.rpc<readonly LifecycleRow[]>(
      "read_admin_game_lifecycle_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
      },
    );
    if (response.error) return rpcError(response.error);
    const row = response.data?.[0];
    if (!row) return failed();
    return {
      handled: true,
      status: 200,
      body: { data: { lifecycle: toLifecycleDto(row) } },
    };
  } catch {
    return failed();
  }
}

async function transitionLifecycle(
  service: AdminService,
  input: Parameters<typeof handleGameLifecycleOperation>[1],
  action: LifecycleAction,
): Promise<GameLifecycleOperationResult> {
  try {
    const url = new URL(input.request.url);
    if (url.searchParams.size) {
      return invalid("Game lifecycle writes do not accept query parameters.");
    }
    const value = await input.request.clone().json().catch(() => null);
    if (!isRecord(value)) {
      return invalid("Provide a valid game lifecycle JSON object.");
    }
    if (Object.keys(value).some((key) => !["idempotencyKey", "expectedVersion"].includes(key))) {
      return invalid("Only idempotencyKey and expectedVersion are accepted.");
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
    const expectedVersion = value.expectedVersion === undefined
      ? null
      : safePositiveInteger(value.expectedVersion);
    if (value.expectedVersion !== undefined && expectedVersion === null) {
      return invalid("expectedVersion must be a positive integer.");
    }

    const response = await service.rpc<readonly LifecycleRow[]>(
      "transition_game_lifecycle_atomic_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_action: action,
        p_idempotency_key: idempotencyKey,
        p_expected_version: expectedVersion,
      },
    );
    if (response.error) return rpcError(response.error);
    const row = response.data?.[0];
    if (!row) return failed();
    const returnedAction = requiredText(row.transition_action).toLowerCase();
    const outcome = requiredText(row.transition_outcome).toLowerCase();
    if (returnedAction !== action || !ACTIONS.has(returnedAction as LifecycleAction) || !OUTCOMES.has(outcome)) {
      return failed();
    }
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          action,
          outcome,
          previousState: optionalLifecycleState(row.previous_state),
          lifecycle: toLifecycleDto(row),
        },
      },
    };
  } catch {
    return failed();
  }
}

function toLifecycleDto(row: LifecycleRow) {
  const state = requiredText(row.lifecycle_state).toLowerCase();
  const operationalStatus = requiredText(row.operational_status).toLowerCase();
  const version = safePositiveInteger(row.lifecycle_version);
  const joinCodeStatus = requiredText(row.join_code_status).toLowerCase();
  const allowedActions = Array.isArray(row.allowed_actions)
    ? row.allowed_actions.map((value) => requiredText(value).toLowerCase())
    : [];
  const activePlayerSessions = row.active_player_sessions === undefined
    ? undefined
    : safeNonNegativeInteger(row.active_player_sessions);
  const sessionsRevoked = row.sessions_revoked === undefined
    ? undefined
    : safeNonNegativeInteger(row.sessions_revoked);
  if (
    !STATES.has(state as LifecycleState) ||
    !OPERATIONAL_STATUSES.has(operationalStatus) ||
    version === null ||
    !JOIN_CODE_STATUSES.has(joinCodeStatus) ||
    allowedActions.some((action) => !ACTIONS.has(action as LifecycleAction)) ||
    activePlayerSessions === null ||
    sessionsRevoked === null
  ) {
    throw new Error("invalid lifecycle row");
  }
  return {
    state: state as LifecycleState,
    operationalStatus,
    version,
    joinCodeStatus,
    allowedActions,
    ...(activePlayerSessions === undefined ? {} : { activePlayerSessions }),
    ...(sessionsRevoked === undefined ? {} : { sessionsRevoked }),
    startedAt: optionalTimestamp(row.started_at),
    pausedAt: optionalTimestamp(row.paused_at),
    resumedAt: optionalTimestamp(row.resumed_at),
    endedAt: optionalTimestamp(row.ended_at),
    archivedAt: optionalTimestamp(row.archived_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function rpcError(error: RpcError): GameLifecycleOperationResult {
  const message = error.message.toUpperCase();
  const lower = error.message.toLowerCase();
  if (
    error.code === "42P01" || error.code === "42703" ||
    error.code === "42883" || lower.includes("does not exist") ||
    lower.includes("schema cache")
  ) {
    return errorResult(
      503,
      "game_lifecycle_schema_not_applied",
      "Game lifecycle controls are unavailable in this runtime.",
      true,
    );
  }
  if (message.includes("GAME_LIFECYCLE_SCOPE_FORBIDDEN")) {
    return errorResult(404, "game_not_found", "Game lifecycle was not found.");
  }
  if (message.includes("GAME_LIFECYCLE_IDEMPOTENCY_CONFLICT")) {
    return errorResult(
      409,
      "game_lifecycle_idempotency_conflict",
      "This idempotency key was already used for another lifecycle action.",
    );
  }
  if (message.includes("GAME_LIFECYCLE_VERSION_CONFLICT")) {
    return errorResult(
      409,
      "game_lifecycle_version_conflict",
      "The game lifecycle changed before this action completed. Reload and retry.",
      true,
    );
  }
  if (message.includes("GAME_LIFECYCLE_TRANSITION_INVALID")) {
    return errorResult(
      409,
      "game_lifecycle_transition_invalid",
      "This lifecycle action is not valid from the current game state.",
    );
  }
  if (
    message.includes("GAME_LIFECYCLE_ACTION_INVALID") ||
    message.includes("GAME_LIFECYCLE_IDEMPOTENCY_INVALID") ||
    message.includes("GAME_LIFECYCLE_VERSION_INVALID") ||
    message.includes("GAME_LIFECYCLE_READ_INVALID")
  ) {
    return invalid("Game lifecycle request is invalid.");
  }
  return failed();
}

function methodNotAllowed(message: string): GameLifecycleOperationResult {
  return errorResult(405, "method_not_allowed", message);
}

function invalid(message: string): GameLifecycleOperationResult {
  return errorResult(400, "invalid_game_lifecycle_request", message);
}

function failed(): GameLifecycleOperationResult {
  return errorResult(
    500,
    "game_lifecycle_failed",
    "Game lifecycle controls could not be completed.",
    true,
  );
}

function errorResult(
  status: number,
  code: string,
  message: string,
  retryable = false,
): GameLifecycleOperationResult {
  return {
    handled: true,
    status,
    body: { error: { code, message, retryable } },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredText(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("text required");
  return text;
}

function optionalLifecycleState(value: unknown): LifecycleState | null {
  if (value === null || value === undefined || value === "") return null;
  const state = requiredText(value).toLowerCase();
  if (!STATES.has(state as LifecycleState)) throw new Error("invalid state");
  return state as LifecycleState;
}

function safePositiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeNonNegativeInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function timestamp(value: unknown): string {
  const text = requiredText(value);
  if (!Number.isFinite(Date.parse(text))) throw new Error("invalid timestamp");
  return new Date(text).toISOString();
}

function optionalTimestamp(value: unknown): string | null {
  return value === null || value === undefined || value === ""
    ? null
    : timestamp(value);
}
