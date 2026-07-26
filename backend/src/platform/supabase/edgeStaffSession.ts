import type { EdgeErrorBody } from "./edgeResponse.ts";
import { extractBearerToken } from "./edgeAuth.ts";
import {
  enforceStaffRequestRateLimit,
  normalizedStaffAction,
} from "../../security/staffRequestRateLimit.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

export interface SupabaseEnv {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceRoleKey: string;
}

interface EdgeSupabaseQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface EdgeSupabaseQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: EdgeSupabaseQueryError | null;
  readonly count?: number | null;
  readonly status?: number;
  readonly statusText?: string;
}

export interface EdgeSupabaseAuthUser {
  readonly id: string;
  readonly email?: string | null;
  readonly app_metadata?: Record<string, unknown>;
  readonly user_metadata?: Record<string, unknown>;
}

interface EdgeSupabaseAuthResponse {
  readonly data: {
    readonly user: EdgeSupabaseAuthUser | null;
  };
  readonly error: EdgeSupabaseQueryError | null;
}

interface EdgeSupabaseAuthAdminResponse {
  readonly data: {
    readonly user: EdgeSupabaseAuthUser | null;
  };
  readonly error: EdgeSupabaseQueryError | null;
}

interface EdgeSupabaseAuthAdminClient {
  createUser(input: {
    readonly email: string;
    readonly password: string;
    readonly email_confirm: boolean;
    readonly app_metadata?: Record<string, unknown>;
    readonly user_metadata?: Record<string, unknown>;
  }): PromiseLike<EdgeSupabaseAuthAdminResponse>;
  deleteUser(userId: string): PromiseLike<{
    readonly data: unknown;
    readonly error: EdgeSupabaseQueryError | null;
  }>;
  updateUserById(
    userId: string,
    input: {
      readonly ban_duration?: string;
      readonly app_metadata?: Record<string, unknown>;
      readonly user_metadata?: Record<string, unknown>;
    },
  ): PromiseLike<EdgeSupabaseAuthAdminResponse>;
}

interface EdgeSupabaseAuthClient {
  readonly admin: EdgeSupabaseAuthAdminClient;
  getUser(accessToken: string): PromiseLike<EdgeSupabaseAuthResponse>;
}

type EdgeSupabaseRow = Record<string, string>;

interface EdgeSupabaseSelectBuilder<Row = EdgeSupabaseRow> {
  maybeSingle(): PromiseLike<EdgeSupabaseQueryResponse<Row | null>>;
  single(): PromiseLike<EdgeSupabaseQueryResponse<Row>>;
}

interface EdgeSupabaseFilterBuilder<Row = EdgeSupabaseRow>
  extends
    EdgeSupabaseSelectBuilder<Row>,
    PromiseLike<EdgeSupabaseQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): EdgeSupabaseFilterBuilder<Row>;
  in(
    column: string,
    values: readonly unknown[],
  ): EdgeSupabaseFilterBuilder<Row>;
  limit(count: number): EdgeSupabaseFilterBuilder<Row>;
  order(
    column: string,
    options?: { readonly ascending?: boolean; readonly nullsFirst?: boolean },
  ): EdgeSupabaseFilterBuilder<Row>;
}

interface EdgeSupabaseInsertBuilder<Row = EdgeSupabaseRow> {
  select(columns: string): EdgeSupabaseSelectBuilder<Row>;
}

interface EdgeSupabaseUpdateBuilder<Row = EdgeSupabaseRow>
  extends PromiseLike<EdgeSupabaseQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): EdgeSupabaseUpdateBuilder<Row>;
  is(column: string, value: unknown): EdgeSupabaseUpdateBuilder<Row>;
  select(columns: string): EdgeSupabaseSelectBuilder<Row>;
}

interface EdgeSupabaseUpsertBuilder<Row = EdgeSupabaseRow> {
  select(columns: string): EdgeSupabaseSelectBuilder<Row>;
}

interface EdgeSupabaseDeleteBuilder<Row = EdgeSupabaseRow>
  extends PromiseLike<EdgeSupabaseQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): EdgeSupabaseDeleteBuilder<Row>;
}

interface EdgeSupabaseQueryBuilder<Row = EdgeSupabaseRow> {
  select(columns: string): EdgeSupabaseFilterBuilder<Row>;
  insert(values: unknown): EdgeSupabaseInsertBuilder<Row>;
  update(values: unknown): EdgeSupabaseUpdateBuilder<Row>;
  upsert(
    values: unknown,
    options?: { readonly onConflict?: string },
  ): EdgeSupabaseUpsertBuilder<Row>;
  delete(): EdgeSupabaseDeleteBuilder<Row>;
}

export interface EdgeSupabaseClient {
  readonly auth: EdgeSupabaseAuthClient;
  from(tableName: string): EdgeSupabaseQueryBuilder;
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<EdgeSupabaseQueryResponse<Data>>;
}

export interface EdgeStaffSessionStaff {
  readonly id: string;
  readonly supabase_auth_user_id: string;
  readonly email: string;
  readonly display_name: string;
  readonly status: string;
  readonly role: "game_admin" | "security_operator";
  readonly permission_version: number;
  readonly security_version: number;
  readonly mfa_required: boolean;
}

interface EdgeStaffSessionDependencies {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

export type EdgeStaffSessionFailure = {
  readonly ok: false;
  readonly status: number;
  readonly error: EdgeErrorBody["error"];
  readonly retryAfterSeconds?: number;
  readonly resetAt?: string;
};

export type EdgeStaffSessionResolution =
  | {
    readonly ok: true;
    readonly authUser: EdgeSupabaseAuthUser;
    readonly staff: EdgeStaffSessionStaff;
    readonly serviceClient: EdgeSupabaseClient;
    readonly assuranceLevel: "aal1" | "aal2" | "unknown";
  }
  | EdgeStaffSessionFailure;

interface ResolveStaffSessionOptions {
  readonly missingMessage: string;
  readonly lookupFailureError?: EdgeErrorBody["error"];
  readonly beforeStaffLookup?: () =>
    | { readonly ok: true }
    | EdgeStaffSessionFailure
    | Promise<{ readonly ok: true } | EdgeStaffSessionFailure>;
  readonly requiredRole?: "game_admin" | "security_operator";
  readonly requiredAssuranceLevel?: "aal1" | "aal2";
  readonly allowLegacyMetadata?: boolean;
  readonly skipUniversalRateLimit?: boolean;
}

const DEFAULT_STAFF_LOOKUP_ERROR: EdgeErrorBody["error"] = {
  code: "staff_lookup_failed",
  message: "Staff lookup failed.",
  retryable: false,
};

export async function resolveStaffSessionForRequest(
  request: Request,
  env: SupabaseEnv,
  dependencies: EdgeStaffSessionDependencies,
  options: ResolveStaffSessionOptions,
): Promise<EdgeStaffSessionResolution> {
  const authHeader = request.headers.get("authorization");
  const accessToken = extractBearerToken(authHeader);

  if (!accessToken || /^sb_publishable_/i.test(accessToken)) {
    return missingStaffAuthUser(options.missingMessage);
  }

  const authClient = dependencies.createAuthClient(env);
  const authUserResult = await authClient.auth.getUser(accessToken);
  const authUser = authUserResult.data.user;
  if (authUserResult.error || !authUser?.id) {
    return missingStaffAuthUser(options.missingMessage);
  }

  if (options.beforeStaffLookup) {
    const prerequisiteResult = await options.beforeStaffLookup();
    if (!prerequisiteResult.ok) return prerequisiteResult;
  }

  const serviceClient = dependencies.createServiceClient(env);
  const staffResponse = await serviceClient
    .from("staff_users")
    .select(
      "id,supabase_auth_user_id,email,display_name,status,role,permission_version,security_version,mfa_required",
    )
    .eq("supabase_auth_user_id", authUser.id)
    .maybeSingle();

  if (staffResponse.error) {
    return {
      ok: false,
      status: 500,
      error: options.lookupFailureError ?? DEFAULT_STAFF_LOOKUP_ERROR,
    };
  }

  const row = staffResponse.data as {
    readonly id?: string;
    readonly supabase_auth_user_id?: string;
    readonly email?: string;
    readonly display_name?: string;
    readonly status?: string;
    readonly role?: string;
    readonly permission_version?: number | string;
    readonly security_version?: number | string;
    readonly mfa_required?: boolean;
  } | null;
  if (!row?.id) {
    return authorizationFailure(
      403,
      "staff_not_found",
      "No active staff account is linked to this user.",
    );
  }

  const permissionVersion = Number(row.permission_version);
  const securityVersion = Number(row.security_version);
  const role = row.role === "security_operator"
    ? "security_operator"
    : row.role === "game_admin"
    ? "game_admin"
    : null;
  if (
    row.status !== "active" ||
    !role ||
    !Number.isSafeInteger(permissionVersion) ||
    permissionVersion < 1 ||
    !Number.isSafeInteger(securityVersion) ||
    securityVersion < 1
  ) {
    return authorizationFailure(
      403,
      "staff_account_inactive",
      "The staff account is not active.",
    );
  }

  const requiredRole = options.requiredRole ?? "game_admin";
  if (role !== requiredRole) {
    return authorizationFailure(
      403,
      "staff_role_denied",
      "The staff account is not authorized for this surface.",
    );
  }

  const metadata = authUser.app_metadata ?? {};
  const metadataMatches =
    metadata.econovaria_role === role &&
    Number(metadata.permission_version) === permissionVersion &&
    Number(metadata.security_version) === securityVersion;
  if (!metadataMatches && options.allowLegacyMetadata !== true) {
    return authorizationFailure(
      403,
      "staff_claims_outdated",
      "The staff authorization claims must be refreshed by an administrator.",
    );
  }

  const assuranceLevel = readJwtAssuranceLevel(accessToken);
  const isMutation = !["GET", "HEAD"].includes(request.method.toUpperCase());
  const requiredAssuranceLevel = options.requiredAssuranceLevel ??
    (isMutation && row.mfa_required !== false ? "aal2" : "aal1");
  if (requiredAssuranceLevel === "aal2" && assuranceLevel !== "aal2") {
    return authorizationFailure(
      403,
      "staff_mfa_required",
      "Multi-factor authentication is required for this operation.",
    );
  }

  if (options.skipUniversalRateLimit !== true) {
    const path = safeRequestPath(request);
    try {
      const decision = await enforceStaffRequestRateLimit({
        request,
        action: normalizedStaffAction(request.method, path),
        profile: ["GET", "HEAD"].includes(request.method.toUpperCase())
          ? "read"
          : "sensitive",
        gameId: readGameScope(path) || row.id,
        staffUserId: row.id,
      }, serviceClient);

      if (!decision.allowed) {
        return {
          ok: false,
          status: 429,
          error: {
            code: "staff_rate_limit_exceeded",
            message: "Too many staff requests. Try again later.",
            retryable: true,
          },
          retryAfterSeconds: Math.max(1, decision.retryAfterSeconds),
          resetAt: decision.resetAt,
        };
      }
    } catch {
      return authorizationFailure(
        503,
        "staff_rate_limit_unavailable",
        "Staff request protection is unavailable.",
        true,
      );
    }
  }

  return {
    ok: true,
    authUser,
    staff: {
      id: row.id,
      supabase_auth_user_id: String(row.supabase_auth_user_id || authUser.id),
      email: String(row.email || authUser.email || ""),
      display_name: String(row.display_name || "Staff"),
      status: "active",
      role,
      permission_version: permissionVersion,
      security_version: securityVersion,
      mfa_required: row.mfa_required !== false,
    },
    serviceClient,
    assuranceLevel,
  };
}

function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function dictionaryValues(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.values(parsed)
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function firstConfigured(values: readonly string[]): string {
  return values.find((value) => Boolean(value)) || "";
}

export function readSupabaseEnv():
  | { readonly ok: true; readonly value: SupabaseEnv }
  | { readonly ok: false } {
  const supabaseUrl = environmentValue("SUPABASE_URL");
  const supabaseAnonKey = firstConfigured([
    environmentValue("SUPABASE_PUBLISHABLE_KEY"),
    environmentValue("PUBLISHABLE_KEY"),
    ...dictionaryValues(environmentValue("SUPABASE_PUBLISHABLE_KEYS")),
    environmentValue("SUPABASE_ANON_KEY"),
  ]);
  const supabaseServiceRoleKey = firstConfigured([
    environmentValue("SUPABASE_SECRET_KEY"),
    environmentValue("SECRET_KEY"),
    ...dictionaryValues(environmentValue("SUPABASE_SECRET_KEYS")),
    environmentValue("SUPABASE_SERVICE_ROLE_KEY"),
  ]);

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return { ok: false };
  }

  return {
    ok: true,
    value: { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey },
  };
}

export async function readOwnedGameSession(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  staffUserId: string,
): Promise<
  | {
    readonly ok: true;
    readonly gameSession: {
      readonly id: string;
      readonly name: string;
      readonly status: string;
    };
  }
  | {
    readonly ok: false;
    readonly status: number;
    readonly error: EdgeErrorBody["error"];
  }
> {
  const gameResponse = await serviceClient
    .from("game_sessions")
    .select("id,name,status,owner_staff_user_id")
    .eq("id", gameSessionId)
    .eq("owner_staff_user_id", staffUserId)
    .maybeSingle();

  if (gameResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "game_session_lookup_failed",
        message: "Game session lookup failed.",
        retryable: false,
      },
    };
  }

  const gameSession = gameResponse.data;
  if (!gameSession?.id) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "game_session_not_found",
        message: "Game session was not found for this staff user.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    gameSession: {
      id: gameSession.id,
      name: gameSession.name,
      status: gameSession.status,
    },
  };
}

function safeRequestPath(request: Request): string {
  try {
    return new URL(request.url).pathname.slice(0, 2_048) || "/";
  } catch {
    return "/invalid-request-path";
  }
}

function readGameScope(path: string): string {
  const match = path.match(/\/games\/([0-9a-f-]{36})(?:\/|$)/iu);
  return match?.[1] || "";
}

function readJwtAssuranceLevel(token: string): "aal1" | "aal2" | "unknown" {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "unknown";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    return claims?.aal === "aal2"
      ? "aal2"
      : claims?.aal === "aal1"
      ? "aal1"
      : "unknown";
  } catch {
    return "unknown";
  }
}

function missingStaffAuthUser(message: string): EdgeStaffSessionFailure {
  return {
    ok: false,
    status: 401,
    error: {
      code: "missing_staff_auth_user",
      message,
      retryable: false,
    },
  };
}

function authorizationFailure(
  status: number,
  code: string,
  message: string,
  retryable = false,
): EdgeStaffSessionFailure {
  return {
    ok: false,
    status,
    error: { code, message, retryable },
  };
}
