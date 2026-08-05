import {
  AdminMutationError,
  type AdminMutationIdentity,
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
} from "../../../platform/supabase/adminMutation.ts";

export interface RotateGameJoinCodeInput {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly requestBody: unknown;
  readonly mutation: AdminMutationIdentity;
}

export interface RotateGameJoinCodeResult {
  readonly status: number;
  readonly replayed: boolean;
  readonly joinCode: {
    readonly gameJoinCode: string;
    readonly status: "active";
    readonly updatedAt: string;
  };
}

export async function rotateGameJoinCode(
  client: AdminMutationRpcClient,
  input: RotateGameJoinCodeInput,
): Promise<RotateGameJoinCodeResult> {
  const requestPayload = normalizeGameJoinCodeRotationPayload(
    input.requestBody,
  );
  const result = await executeAdminMutationRpc(
    client,
    "admin_rotate_game_join_code_v1",
    {
      p_game_session_id: input.gameSessionId,
      p_staff_user_id: input.staffUserId,
      p_request_payload: requestPayload,
      p_idempotency_key: input.mutation.idempotencyKey,
      p_request_id: input.mutation.requestId,
    },
    {
      code: "join_code_reset_failed",
      message: "Game join code could not be reset.",
    },
  );

  const row = isRecord(result.body.joinCode) ? result.body.joinCode : null;
  const gameJoinCode = text(row?.game_join_code);
  const status = text(row?.game_join_code_status);
  const updatedAt = text(row?.updated_at);
  if (!gameJoinCode || status !== "active" || !updatedAt) {
    throw new AdminMutationError(
      "join_code_reset_failed",
      "Game join code could not be reset.",
      500,
    );
  }

  return {
    status: result.status,
    replayed: result.replayed,
    joinCode: { gameJoinCode, status: "active", updatedAt },
  };
}

export function normalizeGameJoinCodeRotationPayload(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new AdminMutationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  const allowed = new Set(["idempotencyKey", "requestId", "meta", "source"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AdminMutationError(
      "invalid_request_body",
      "Join-code rotation does not accept mutable browser fields.",
      400,
    );
  }
  if (value.meta != null && !isRecord(value.meta)) {
    throw new AdminMutationError(
      "invalid_request_body",
      "Request metadata must be a JSON object.",
      400,
    );
  }

  if (
    isRecord(value.meta) &&
    Object.keys(value.meta).some((key) =>
      !["idempotencyKey", "duplicateClickGuard"].includes(key)
    )
  ) {
    throw new AdminMutationError(
      "invalid_request_body",
      "Join-code request metadata contains unsupported fields.",
      400,
    );
  }

  if (
    isRecord(value.meta) &&
    value.meta.duplicateClickGuard != null &&
    value.meta.duplicateClickGuard !== "action-record-lock"
  ) {
    throw new AdminMutationError(
      "invalid_request_body",
      "Join-code duplicate-click metadata is invalid.",
      400,
    );
  }

  const source = value.source == null ? "" : text(value.source);
  if (
    value.source != null &&
    (typeof value.source !== "string" || !source || source.length > 80 ||
      !/^[a-z][a-z0-9._-]*$/u.test(source))
  ) {
    throw new AdminMutationError(
      "invalid_request_body",
      "Join-code rotation source is invalid.",
      400,
    );
  }

  return source ? { source } : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
