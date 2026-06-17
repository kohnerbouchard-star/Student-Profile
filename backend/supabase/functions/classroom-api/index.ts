import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface EdgeErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

interface EdgeHealthBody {
  readonly ok: true;
  readonly service: "classroom-api";
  readonly status: "ready";
}

interface ActivationSuccessBody {
  readonly ok: true;
  readonly activation: {
    readonly gameSessionId: string;
    readonly entitlementId: string;
    readonly purchaseCodeId: string;
    readonly purchaseCodeStatus: string;
    readonly redeemedCount: number;
    readonly maxRedemptions: number;
    readonly activatedAt: string;
  };
}

interface StaffBootstrapBody {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly supabaseAuthUserId: string;
    readonly email: string;
    readonly displayName: string;
  };
  readonly activeGameSessions: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
}

interface ActivationRequestBody {
  readonly purchaseCode: string;
  readonly gameName: string;
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: Record<string, unknown> | null;
  readonly businessMarketWindow?: Record<string, unknown> | null;
  readonly stockMarketWindow?: Record<string, unknown> | null;
  readonly newsSchedule?: Record<string, unknown> | null;
}

interface ActivationRpcRow {
  readonly game_session_id: string;
  readonly entitlement_id: string;
  readonly purchase_code_id: string;
  readonly purchase_code_status: string;
  readonly redeemed_count: number;
  readonly max_redemptions: number;
  readonly activated_at: string;
}

interface SupabaseEnv {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceRoleKey: string;
}

interface ParsedRequestBodyResult {
  readonly body: ActivationRequestBody;
}

class EdgeActivationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    status: number,
    retryable = false,
  ) {
    super(message);
    this.name = "EdgeActivationError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return jsonResponse(204, null);
  }

  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "classroom-api",
      status: "ready",
    });
  }

  if (url.pathname.endsWith("/staff/bootstrap")) {
    return handleStaffBootstrapRequest(request);
  }

  if (url.pathname.endsWith("/licensing/activate")) {
    return handleLicensingActivationRequest(request);
  }

  return jsonError(404, {
    code: "route_not_found",
    message: "Classroom API route was not found.",
    retryable: false,
  });
});

async function handleStaffBootstrapRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load staff bootstrap data.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = extractBearerToken(authHeader);

    if (!accessToken) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to load staff data.",
        retryable: false,
      });
    }

    const authClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseAnonKey,
    );

    const authUserResult = await authClient.auth.getUser(accessToken);
    const authUser = authUserResult.data.user;

    if (authUserResult.error || !authUser?.id) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to load staff data.",
        retryable: false,
      });
    }

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const staffResponse = await serviceClient
      .from("staff_users")
      .select("id,supabase_auth_user_id,email,display_name")
      .eq("supabase_auth_user_id", authUser.id)
      .maybeSingle();

    if (staffResponse.error) {
      return jsonError(500, {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
        retryable: false,
      });
    }

    const staff = staffResponse.data;

    if (!staff?.id) {
      return jsonError(403, {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      });
    }

    const sessionsResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,created_at,updated_at")
      .eq("owner_staff_user_id", staff.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (sessionsResponse.error) {
      return jsonError(500, {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
        retryable: false,
      });
    }

    return jsonResponse<StaffBootstrapBody>(200, {
      ok: true,
      staff: {
        id: staff.id,
        supabaseAuthUserId: staff.supabase_auth_user_id,
        email: staff.email,
        displayName: staff.display_name,
      },
      activeGameSessions: (sessionsResponse.data ?? []).map((session) => ({
        id: session.id,
        name: session.name,
        status: session.status,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      })),
    });
  } catch {
    return jsonError(500, {
      code: "staff_bootstrap_failed",
      message: "Staff bootstrap failed.",
      retryable: false,
    });
  }
}

async function handleLicensingActivationRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to activate licensing.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = extractBearerToken(authHeader);

    if (!accessToken) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to activate licensing.",
        retryable: false,
      });
    }

    const authClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseAnonKey,
    );

    const authUserResult = await authClient.auth.getUser(accessToken);
    const authUser = authUserResult.data.user;

    if (authUserResult.error || !authUser?.id) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to activate licensing.",
        retryable: false,
      });
    }

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const parsedBody = await readActivationRequestBody(request);
    const normalizedPurchaseCode = normalizePurchaseCode(parsedBody.body.purchaseCode);
    const purchaseCodeHash = await sha256Hex(normalizedPurchaseCode);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const staffResponse = await serviceClient
      .from("staff_users")
      .select("id,supabase_auth_user_id,email,display_name")
      .eq("supabase_auth_user_id", authUser.id)
      .maybeSingle();

    if (staffResponse.error) {
      return jsonError(500, {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        retryable: false,
      });
    }

    if (!staffResponse.data?.id) {
      return jsonError(403, {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      });
    }

    const activationResponse = await serviceClient.rpc(
      "redeem_purchase_code_for_game",
      {
        p_staff_user_id: staffResponse.data.id,
        p_purchase_code_hash: purchaseCodeHash,
        p_game_name: parsedBody.body.gameName,
        p_game_settings: buildGameSettings(parsedBody.body),
        p_request_metadata: {
          requestId,
          source: "classroom_api_edge_licensing_activation",
          supabaseAuthUserId: authUser.id,
        },
      },
    );

    if (activationResponse.error) {
      const safeError = mapActivationRpcError(activationResponse.error.message);

      return jsonError(safeError.status, {
        code: safeError.code,
        message: safeError.message,
        retryable: safeError.retryable,
      });
    }

    const activationRow = readActivationRpcRow(activationResponse.data);

    if (!activationRow) {
      return jsonError(500, {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        retryable: false,
      });
    }

    return jsonResponse<ActivationSuccessBody>(200, {
      ok: true,
      activation: {
        gameSessionId: activationRow.game_session_id,
        entitlementId: activationRow.entitlement_id,
        purchaseCodeId: activationRow.purchase_code_id,
        purchaseCodeStatus: activationRow.purchase_code_status,
        redeemedCount: activationRow.redeemed_count,
        maxRedemptions: activationRow.max_redemptions,
        activatedAt: activationRow.activated_at,
      },
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "licensing_activation_failed",
      message: "Purchase-code activation failed.",
      retryable: false,
    });
  }
}

async function readActivationRequestBody(
  request: Request,
): Promise<ParsedRequestBodyResult> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    body: {
      purchaseCode: parseRequiredText(
        value.purchaseCode,
        "purchase_code_required",
        "purchaseCode is required.",
      ),
      gameName: parseRequiredText(
        value.gameName,
        "game_name_required",
        "gameName is required.",
      ),
      difficultyPreset: parseOptionalText(value.difficultyPreset),
      attendanceWindow: parseOptionalJsonObject(value.attendanceWindow),
      businessMarketWindow: parseOptionalJsonObject(value.businessMarketWindow),
      stockMarketWindow: parseOptionalJsonObject(value.stockMarketWindow),
      newsSchedule: parseOptionalJsonObject(value.newsSchedule),
    },
  };
}

function parseRequiredText(
  value: unknown,
  code: string,
  message: string,
): string {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    throw new EdgeActivationError(code, message, 400);
  }

  return normalizedValue;
}

function parseOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw invalidActivationSettingsError();
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

function parseOptionalJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw invalidActivationSettingsError();
  }

  return value;
}

function invalidActivationSettingsError(): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_activation_settings",
    "Activation settings must use valid JSON object values.",
    400,
  );
}

function normalizePurchaseCode(value: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!normalizedValue) {
    throw new EdgeActivationError(
      "purchase_code_required",
      "purchaseCode is required.",
      400,
    );
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "purchaseCode may only contain letters, numbers, and hyphens.",
      400,
    );
  }

  return normalizedValue;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildGameSettings(
  body: ActivationRequestBody,
): Record<string, unknown> {
  return {
    difficultyPreset: body.difficultyPreset ?? "standard",
    attendanceWindow: body.attendanceWindow ?? {},
    businessMarketWindow: body.businessMarketWindow ?? {},
    stockMarketWindow: body.stockMarketWindow ?? {},
    newsSchedule: body.newsSchedule ?? {},
  };
}

function readActivationRpcRow(value: unknown): ActivationRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.game_session_id !== "string" ||
    typeof row.entitlement_id !== "string" ||
    typeof row.purchase_code_id !== "string" ||
    typeof row.purchase_code_status !== "string" ||
    typeof row.redeemed_count !== "number" ||
    typeof row.max_redemptions !== "number" ||
    typeof row.activated_at !== "string"
  ) {
    return null;
  }

  return {
    game_session_id: row.game_session_id,
    entitlement_id: row.entitlement_id,
    purchase_code_id: row.purchase_code_id,
    purchase_code_status: row.purchase_code_status,
    redeemed_count: row.redeemed_count,
    max_redemptions: row.max_redemptions,
    activated_at: row.activated_at,
  };
}

function mapActivationRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "STAFF_USER_REQUIRED":
    case "PURCHASE_CODE_HASH_REQUIRED":
    case "GAME_NAME_REQUIRED":
      return {
        code: "invalid_redemption_input",
        message: "Activation request is missing required information.",
        status: 400,
        retryable: false,
      };

    case "PURCHASE_CODE_NOT_FOUND":
      return {
        code: "purchase_code_not_found",
        message: "Purchase code was not found.",
        status: 404,
        retryable: false,
      };

    case "PURCHASE_CODE_EXHAUSTED":
      return {
        code: "purchase_code_exhausted",
        message: "Purchase code has already been fully redeemed.",
        status: 409,
        retryable: false,
      };

    case "PURCHASE_CODE_EXPIRED":
      return {
        code: "purchase_code_expired",
        message: "Purchase code has expired.",
        status: 410,
        retryable: false,
      };

    case "PURCHASE_CODE_REVOKED":
      return {
        code: "purchase_code_revoked",
        message: "Purchase code has been revoked.",
        status: 403,
        retryable: false,
      };

    case "PURCHASE_CODE_NOT_ACTIVE":
      return {
        code: "purchase_code_not_active",
        message: "Purchase code is not active.",
        status: 409,
        retryable: false,
      };

    case "PURCHASE_CODE_REDEMPTION_CONFLICT":
      return {
        code: "purchase_code_redemption_conflict",
        message: "Purchase code redemption conflicted with another activation attempt.",
        status: 409,
        retryable: true,
      };

    default:
      return {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        status: 500,
        retryable: false,
      };
  }
}

function extractBearerToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

function readSupabaseEnv():
  | { readonly ok: true; readonly value: SupabaseEnv }
  | { readonly ok: false } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      supabaseUrl,
      supabaseAnonKey,
      supabaseServiceRoleKey,
    },
  };
}

function jsonError(
  status: number,
  error: EdgeErrorBody["error"],
): Response {
  return jsonResponse<EdgeErrorBody>(status, {
    ok: false,
    error,
  });
}

function jsonResponse<TBody>(
  status: number,
  body: TBody,
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
