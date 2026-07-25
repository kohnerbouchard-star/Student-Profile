import { handleStaffLoginRequest } from "./staffLoginHttpHandler.ts";
import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const THROTTLE_BUCKETS = [
  { dimension: "account" as const, keyHash: "a".repeat(64) },
  { dimension: "device" as const, keyHash: "b".repeat(64) },
  { dimension: "ip" as const, keyHash: "c".repeat(64) },
];

Deno.test("mediated staff login returns controlled role and AAL state", async () => {
  const dependencies = createDependencies({ aal: "aal2" });
  const response = await handleStaffLoginRequest(loginRequest(), dependencies);
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.session.assuranceLevel, "aal2");
  assertEquals(body.session.mfaRequired, true);
  assertEquals(body.user.role, "game_admin");
  assertEquals(body.user.permissionVersion, 1);
  assertEquals(body.user.securityVersion, 1);
  assertEquals(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

Deno.test("rejects unknown login fields before authentication", async () => {
  const dependencies = createDependencies({ aal: "aal1" });
  const response = await handleStaffLoginRequest(
    loginRequest({ role: "security_operator" }),
    dependencies,
  );
  const body = await response.json();

  assertEquals(response.status, 400);
  assertEquals(body.error.code, "unknown_request_field");
  assertEquals(dependencies.calls.authAttempts, 0);
});

Deno.test("returns progressive Retry-After after a failed password attempt", async () => {
  const dependencies = createDependencies({
    aal: "aal1",
    authFailure: true,
    failureRetryAfterSeconds: 30,
  });
  const response = await handleStaffLoginRequest(loginRequest(), dependencies);
  const body = await response.json();

  assertEquals(response.status, 429);
  assertEquals(body.error.code, "authentication_temporarily_locked");
  assertEquals(response.headers.get("retry-after"), "30");
  assertEquals(dependencies.calls.failures, 1);
});

Deno.test("rejects a valid password when controlled Auth claims are stale", async () => {
  const dependencies = createDependencies({
    aal: "aal2",
    metadataSecurityVersion: 2,
  });
  const response = await handleStaffLoginRequest(loginRequest(), dependencies);
  const body = await response.json();

  assertEquals(response.status, 403);
  assertEquals(body.error.code, "staff_authorization_outdated");
  assertEquals(dependencies.calls.failures, 1);
  assertEquals(dependencies.calls.successes, 0);
});

function createDependencies(options: {
  readonly aal: "aal1" | "aal2";
  readonly authFailure?: boolean;
  readonly failureRetryAfterSeconds?: number;
  readonly metadataSecurityVersion?: number;
}) {
  const calls = {
    authAttempts: 0,
    failures: 0,
    successes: 0,
  };
  const accessToken = jwt(options.aal);
  const authClient = {
    auth: {
      signInWithPassword: async () => {
        calls.authAttempts += 1;
        if (options.authFailure) {
          return {
            data: { session: null, user: null },
            error: { message: "invalid credentials" },
          };
        }
        return {
          data: {
            session: {
              access_token: accessToken,
              refresh_token: "refresh-token",
              expires_at: 1_785_062_400,
            },
            user: {
              id: "auth-user",
              email: "teacher@example.com",
              app_metadata: {
                econovaria_role: "game_admin",
                permission_version: 1,
                security_version: options.metadataSecurityVersion ?? 1,
              },
            },
          },
          error: null,
        };
      },
    },
  } as unknown as EdgeSupabaseClient;

  const serviceClient = {
    auth: {},
    from(table: string) {
      if (table !== "staff_users") throw new Error(`Unexpected table: ${table}`);
      const response = {
        data: {
          id: "staff-user",
          email: "teacher@example.com",
          display_name: "Teacher",
          status: "active",
          role: "game_admin",
          permission_version: 1,
          security_version: 1,
          mfa_required: true,
        },
        error: null,
      };
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => response,
      };
      return query;
    },
    rpc: async () => ({ data: null, error: null }),
  } as unknown as EdgeSupabaseClient;

  return {
    calls,
    createAuthClient: (_env: SupabaseEnv) => authClient,
    createServiceClient: (_env: SupabaseEnv) => serviceClient,
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "sb_publishable_test",
        supabaseServiceRoleKey: "sb_secret_test",
      },
    }),
    enforceVolumetric: async () => ({
      allowed: true,
      retryAfterSeconds: 0,
      limitingDimension: null,
      limit: 20,
      remaining: 19,
      resetAt: "2026-07-26T12:05:00.000Z",
    }),
    buildThrottleBuckets: async () => THROTTLE_BUCKETS,
    checkThrottle: async () => ({
      allowed: true,
      retryAfterSeconds: 0,
      limitingDimension: null,
      failureCount: 0,
      lockedUntil: null,
    }),
    recordFailure: async () => {
      calls.failures += 1;
      return {
        allowed: false,
        retryAfterSeconds: options.failureRetryAfterSeconds ?? 0,
        limitingDimension: options.failureRetryAfterSeconds ? "account" as const : null,
        failureCount: 3,
        lockedUntil: options.failureRetryAfterSeconds
          ? "2026-07-26T12:00:30.000Z"
          : null,
      };
    },
    recordSuccess: async () => {
      calls.successes += 1;
    },
  };
}

function loginRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://example.test/functions/v1/bootstrap-api/staff/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "teacher@example.com",
      password: "SecurePassword123!",
      ...overrides,
    }),
  });
}

function jwt(aal: "aal1" | "aal2"): string {
  return [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({ aal }),
    "signature",
  ].join(".");
}

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
