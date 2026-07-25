export type AppEnv = "development" | "test" | "staging" | "production";

export interface BackendEnv {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly supabaseSecretKey: string;
  /** Transitional alias for code not yet renamed. Never expose this value to a browser. */
  readonly supabaseAnonKey: string;
  /** Transitional alias for code not yet renamed. Never expose this value to a browser. */
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
  const appEnv = readAppEnv(source.APP_ENV);
  const supabasePublishableKey = readFirstRequiredEnv(source, [
    "SUPABASE_PUBLISHABLE_KEY",
    "PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ]);
  const supabaseSecretKey = readFirstRequiredEnv(source, [
    "SUPABASE_SECRET_KEY",
    "SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  if (
    (appEnv === "staging" || appEnv === "production") &&
    !supabasePublishableKey.startsWith("sb_publishable_")
  ) {
    throw new Error(
      "Staging and production require an sb_publishable_ Supabase application key.",
    );
  }
  if (
    (appEnv === "staging" || appEnv === "production") &&
    !supabaseSecretKey.startsWith("sb_secret_")
  ) {
    throw new Error(
      "Staging and production require an sb_secret_ Supabase backend key.",
    );
  }

  return {
    supabaseUrl: readRequiredEnv(source, "SUPABASE_URL"),
    supabasePublishableKey,
    supabaseSecretKey,
    supabaseAnonKey: supabasePublishableKey,
    supabaseServiceRoleKey: supabaseSecretKey,
    appEnv,
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

function readFirstRequiredEnv(
  source: BackendEnvSource,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = source[key]?.trim();
    if (value) return value;
  }
  throw new Error(
    `Missing required backend environment variable; expected one of: ${keys.join(", ")}`,
  );
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
