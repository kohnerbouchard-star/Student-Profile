import type { BackendEnv } from "../config/env";

export type CoreTableName =
  | "staff_users"
  | "purchase_codes"
  | "entitlements"
  | "game_sessions"
  | "game_settings"
  | "players"
  | "player_access_credentials"
  | "player_sessions"
  | "ledger_entries"
  | "account_balances"
  | "audit_log";

export interface ServerSupabaseClient {
  from(tableName: CoreTableName | string): unknown;
  auth?: unknown;
}

export interface ServerSupabaseClientOptions {
  readonly schema?: "public" | string;
}

export interface SupabaseClientFactoryOptions {
  readonly auth: {
    readonly persistSession: false;
    readonly autoRefreshToken: false;
  };
  readonly db: {
    readonly schema: string;
  };
}

export type SupabaseClientFactory<TClient extends ServerSupabaseClient> = (
  supabaseUrl: string,
  serviceRoleKey: string,
  options: SupabaseClientFactoryOptions,
) => TClient;

export interface ServerSupabaseCredentials {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
}

export function getServerSupabaseCredentials(env: BackendEnv): ServerSupabaseCredentials {
  return {
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.supabaseServiceRoleKey,
  };
}

export function createServerSupabaseClient<
  TClient extends ServerSupabaseClient = ServerSupabaseClient,
>(
  env: BackendEnv,
  createClient: SupabaseClientFactory<TClient>,
  options: ServerSupabaseClientOptions = {},
): TClient {
  const credentials = getServerSupabaseCredentials(env);

  return createClient(credentials.supabaseUrl, credentials.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: options.schema ?? "public",
    },
  });
}
