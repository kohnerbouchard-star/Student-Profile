import type { EdgeErrorBody } from "./edgeResponse.ts";
import { extractBearerToken } from "./edgeAuth.ts";

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

interface EdgeSupabaseAuthUser {
  readonly id: string;
  readonly email?: string | null;
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
  }): PromiseLike<EdgeSupabaseAuthAdminResponse>;
  deleteUser(userId: string): PromiseLike<{
    readonly data: unknown;
    readonly error: EdgeSupabaseQueryError | null;
  }>;
  updateUserById(
    userId: string,
    input: { readonly ban_duration: string },
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
  extends EdgeSupabaseSelectBuilder<Row>,
    PromiseLike<EdgeSupabaseQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): EdgeSupabaseFilterBuilder<Row>;
  in(column: string, values: readonly unknown[]): EdgeSupabaseFilterBuilder<Row>;
  limit(count: number): EdgeSupabaseFilterBuilder<Row>;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): EdgeSupabaseFilterBuilder<Row>;
}

interface EdgeSupabaseInsertBuilder<Row = EdgeSupabaseRow> {
  select(columns: string): EdgeSupabaseSelectBuilder<Row>;
}

interface EdgeSupabaseUpdateBuilder<Row = EdgeSupabaseRow>
  extends PromiseLike<EdgeSupabaseQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): EdgeSupabaseUpdateBuilder<Row>;
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

interface EdgeStaffSessionStaff {
  readonly id: string;
  readonly supabase_auth_user_id: string;
  readonly email: string;
  readonly display_name: string;
}

interface EdgeStaffSessionDependencies {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

type EdgeStaffSessionFailure = {
  readonly ok: false;
  readonly status: number;
  readonly error: EdgeErrorBody["error"];
};

type EdgeStaffSessionResolution =
  | {
      readonly ok: true;
      readonly authUser: EdgeSupabaseAuthUser;
      readonly staff: EdgeStaffSessionStaff;
      readonly serviceClient: EdgeSupabaseClient;
    }
  | EdgeStaffSessionFailure;

interface ResolveStaffSessionOptions {
  readonly missingMessage: string;
  readonly lookupFailureError?: EdgeErrorBody["error"];
  readonly beforeStaffLookup?: () =>
    | { readonly ok: true }
    | EdgeStaffSessionFailure
    | Promise<{ readonly ok: true } | EdgeStaffSessionFailure>;
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

  if (!accessToken) {
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

    if (!prerequisiteResult.ok) {
      return prerequisiteResult;
    }
  }

  const serviceClient = dependencies.createServiceClient(env);

  const staffResponse = await serviceClient
    .from("staff_users")
    .select("id,supabase_auth_user_id,email,display_name")
    .eq("supabase_auth_user_id", authUser.id)
    .maybeSingle();

  if (staffResponse.error) {
    return {
      ok: false,
      status: 500,
      error: options.lookupFailureError ?? DEFAULT_STAFF_LOOKUP_ERROR,
    };
  }

  const staff = staffResponse.data as EdgeStaffSessionStaff | null;

  if (!staff?.id) {
    return {
      ok: false,
      status: 403,
      error: {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    authUser,
    staff,
    serviceClient,
  };
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

export function readSupabaseEnv():
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
