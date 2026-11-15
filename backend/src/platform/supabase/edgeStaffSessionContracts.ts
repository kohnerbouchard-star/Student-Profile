import type { EdgeErrorBody } from "./edgeResponse.ts";

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
  readonly email_confirmed_at?: string | null;
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
  readonly status: "active" | "onboarding";
  readonly role: "game_admin" | "security_operator";
  readonly permission_version: number;
  readonly security_version: number;
  readonly mfa_required: boolean;
}

export interface EdgeStaffSessionDependencies {
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
