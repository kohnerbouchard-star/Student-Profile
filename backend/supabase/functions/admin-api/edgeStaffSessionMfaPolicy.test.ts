import {
  type EdgeSupabaseClient,
  resolveStaffSessionForRequest,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";

const ENV: SupabaseEnv = {
  supabaseUrl: "http://localhost:54321",
  supabaseAnonKey: "smoke-publishable-key",
  supabaseServiceRoleKey: "smoke-secret-key",
};
const AUTH_USER_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000102";

Deno.test("AAL1 mutation is denied when the controlled Staff row requires MFA", async () => {
  const result = await resolveStaffSessionForRequest(
    request("POST", "aal1"),
    ENV,
    dependencies(true),
    {
      missingMessage: "Staff authentication is required.",
      skipUniversalRateLimit: true,
    },
  );

  if (result.ok !== false) {
    throw new Error("Expected MFA-required Staff mutation to fail.");
  }
  assertEquals(result.status, 403);
  assertEquals(result.error.code, "staff_mfa_required");
});

Deno.test("AAL1 mutation is allowed only when the controlled Staff row disables MFA", async () => {
  const result = await resolveStaffSessionForRequest(
    request("POST", "aal1"),
    ENV,
    dependencies(false),
    {
      missingMessage: "Staff authentication is required.",
      skipUniversalRateLimit: true,
    },
  );

  if (result.ok !== true) {
    throw new Error(`Expected controlled exemption to pass: ${result.error.code}`);
  }
  assertEquals(result.assuranceLevel, "aal1");
  assertEquals(result.staff.mfa_required, false);
});

Deno.test("explicit AAL2 requirements cannot be weakened by a Staff exemption", async () => {
  const result = await resolveStaffSessionForRequest(
    request("POST", "aal1"),
    ENV,
    dependencies(false),
    {
      missingMessage: "Staff authentication is required.",
      requiredAssuranceLevel: "aal2",
      skipUniversalRateLimit: true,
    },
  );

  if (result.ok !== false) {
    throw new Error("Expected explicit AAL2 requirement to fail.");
  }
  assertEquals(result.status, 403);
  assertEquals(result.error.code, "staff_mfa_required");
});

function request(method: string, assuranceLevel: "aal1" | "aal2"): Request {
  return new Request("https://classroom-api.test/games/00000000-0000-4000-8000-000000000001/players", {
    method,
    headers: {
      authorization: `Bearer ${jwt(assuranceLevel)}`,
    },
  });
}

function jwt(assuranceLevel: "aal1" | "aal2"): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aal: assuranceLevel })}.signature`;
}

function dependencies(mfaRequired: boolean): {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
} {
  const authUser = {
    id: AUTH_USER_ID,
    email: "teacher@example.test",
    app_metadata: {
      econovaria_role: "game_admin",
      permission_version: 1,
      security_version: 1,
    },
  };
  const staffRow = {
    id: STAFF_ID,
    supabase_auth_user_id: AUTH_USER_ID,
    email: "teacher@example.test",
    display_name: "Teacher",
    status: "active",
    role: "game_admin",
    permission_version: 1,
    security_version: 1,
    mfa_required: mfaRequired,
  };

  return {
    createAuthClient: () => ({
      auth: {
        getUser: async () => ({
          data: { user: authUser },
          error: null,
        }),
      },
    } as unknown as EdgeSupabaseClient),
    createServiceClient: () => ({
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: staffRow, error: null }),
        };
        return query;
      },
    } as unknown as EdgeSupabaseClient),
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
