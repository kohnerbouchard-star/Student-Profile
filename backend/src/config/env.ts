export type AppEnv = "development" | "test" | "staging" | "production";

export interface BackendEnv {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceRoleKey: string;
  readonly appEnv: AppEnv;
}

export type BackendEnvSource = Record<string, string | undefined>;

const VALID_APP_ENVS: ReadonlySet<AppEnv> = new Set([
  "development",
  "test",
  "staging",
  "production",
]);

export function readBackendEnv(source: BackendEnvSource): BackendEnv {
  return {
    supabaseUrl: readRequiredEnv(source, "SUPABASE_URL"),
    supabaseAnonKey: readRequiredEnv(source, "SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: readRequiredEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    appEnv: readAppEnv(source.APP_ENV),
  };
}

export function readBackendEnvFromProcess(): BackendEnv {
  const runtime = globalThis as {
    process?: { env?: BackendEnvSource };
  };

  return readBackendEnv(runtime.process?.env ?? {});
}

export function readRequiredEnv(
  source: BackendEnvSource,
  key: keyof BackendEnvSource,
): string {
  const value = source[key]?.trim();

  if (!value) {
    throw new Error(`Missing required backend environment variable: ${String(key)}`);
  }

  return value;
}

export function readAppEnv(value: string | undefined): AppEnv {
  const appEnv = value?.trim() || "development";

  if (!VALID_APP_ENVS.has(appEnv as AppEnv)) {
    throw new Error(`Unsupported APP_ENV value: ${appEnv}`);
  }

  return appEnv as AppEnv;
}

export function isProductionEnv(env: BackendEnv): boolean {
  return env.appEnv === "production";
}
