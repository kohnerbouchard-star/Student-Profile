import { handleStaffSignupRequest } from "./staffSignupHttpHandler.ts";
import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_USER_ID = "22222222-2222-4222-8222-222222222222";
const GAME_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const SECURE_PASSWORD = "SecurePassword123!";

interface MockCalls {
  authCreates: number;
  authCreateInputs: unknown[];
  authDeletes: string[];
  authDisables: string[];
  staffDeletes: string[];
  rpcNames: string[];
}

interface MockOptions {
  readonly preflightError?: { readonly message: string } | null;
  readonly redemptionError?: { readonly message: string } | null;
}

Deno.test("staff signup validates before creating an Auth user", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(
    signupRequest({ password: "short" }),
    mock.dependencies,
  );

  await assertError(response, 400, "password_too_short");
  assertEquals(mock.calls.authCreates, 0);
  assertEquals(mock.calls.rpcNames.length, 0);
});

Deno.test("staff signup requires the complete mixed-character password policy", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(
    signupRequest({ password: "longlowercasepassword123!" }),
    mock.dependencies,
  );

  await assertError(response, 400, "password_missing_uppercase");
  assertEquals(mock.calls.authCreates, 0);
});

Deno.test("staff signup requires an explicit game timezone before creating Auth", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(
    signupRequest({ stockMarketWindow: undefined }),
    mock.dependencies,
  );

  await assertError(response, 400, "invalid_stock_market_timezone");
  assertEquals(mock.calls.authCreates, 0);
  assertEquals(mock.calls.rpcNames.length, 0);
});

Deno.test("staff signup fails before Auth creation when canonical provisioning is unavailable", async () => {
  const mock = createMock({
    preflightError: { message: "GAME_PROVISIONING_CANONICAL_SOURCE_NOT_FOUND" },
  });
  const response = await handleStaffSignupRequest(
    signupRequest(),
    mock.dependencies,
  );

  await assertError(response, 503, "game_provisioning_unavailable");
  assertEquals(domainRpcNames(mock.calls), ["game_provisioning_preflight_v1"]);
  assertEquals(mock.calls.authCreates, 0);
  assertEquals(mock.calls.authDeletes.length, 0);
});

Deno.test("staff signup creates controlled role metadata and the first game", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(
    signupRequest(),
    mock.dependencies,
  );
  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.ok, true);
  assertEquals(body.staff.email, "teacher@example.com");
  assertEquals(body.staff.role, "game_admin");
  assertEquals(body.activation.gameSessionId, GAME_SESSION_ID);
  assertEquals(body.activation.provisioningStatus, "ready");
  assertEquals(body.activation.packId, "econovaria.beta-seed-pack.v1");
  assertEquals(mock.calls.authCreates, 1);
  assertEquals(mock.calls.authDeletes.length, 0);
  assertEquals(domainRpcNames(mock.calls), [
    "game_provisioning_preflight_v1",
    "redeem_purchase_code_for_game",
  ]);
  const authInput = mock.calls.authCreateInputs[0] as Record<string, unknown>;
  assertEquals(authInput.email, "teacher@example.com");
  assertEquals(authInput.password, SECURE_PASSWORD);
  assertEquals(authInput.app_metadata, {
    econovaria_role: "game_admin",
    permission_version: 1,
    security_version: 1,
  });
});

Deno.test("staff signup compensates after license redemption fails", async () => {
  const mock = createMock({
    redemptionError: { message: "PURCHASE_CODE_EXHAUSTED" },
  });
  const response = await handleStaffSignupRequest(
    signupRequest(),
    mock.dependencies,
  );

  await assertError(response, 409, "purchase_code_exhausted");
  assertEquals(domainRpcNames(mock.calls), [
    "game_provisioning_preflight_v1",
    "redeem_purchase_code_for_game",
  ]);
  assertEquals(mock.calls.staffDeletes[0], AUTH_USER_ID);
  assertEquals(mock.calls.authDeletes[0], AUTH_USER_ID);
  assertEquals(mock.calls.authDisables.length, 0);
});

function createMock(options: MockOptions = {}): {
  readonly dependencies: {
    readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  };
  readonly calls: MockCalls;
} {
  const calls: MockCalls = {
    authCreates: 0,
    authCreateInputs: [],
    authDeletes: [],
    authDisables: [],
    staffDeletes: [],
    rpcNames: [],
  };
  const client = {
    auth: {
      admin: {
        createUser: async (input: unknown) => {
          calls.authCreates += 1;
          calls.authCreateInputs.push(input);
          return {
            data: {
              user: {
                id: AUTH_USER_ID,
                email: "teacher@example.com",
              },
            },
            error: null,
          };
        },
        deleteUser: async (userId: string) => {
          calls.authDeletes.push(userId);
          return { data: null, error: null };
        },
        updateUserById: async (userId: string) => {
          calls.authDisables.push(userId);
          return { data: { user: null }, error: null };
        },
      },
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => createStaffQuery(calls),
    rpc: async (functionName: string) => {
      calls.rpcNames.push(functionName);
      if (functionName === "consume_pre_auth_request_rate_limits_v1") {
        return { data: [{
          allowed: true,
          retry_after_seconds: 0,
          limiting_dimension: null,
          limit_count: 90,
          remaining_count: 89,
          reset_at: "2026-07-26T00:05:00.000Z",
        }], error: null };
      }
      if (functionName === "check_authentication_throttle_v2") {
        return { data: [{
          allowed: true,
          retry_after_seconds: 0,
          limiting_dimension: null,
          failure_count: 0,
          locked_until: null,
        }], error: null };
      }
      if (functionName === "record_authentication_failure_v2") {
        return { data: [{
          allowed: false,
          retry_after_seconds: 0,
          limiting_dimension: null,
          failure_count: 1,
          locked_until: null,
        }], error: null };
      }
      if (functionName === "record_authentication_success_v2") {
        return { data: null, error: null };
      }
      if (functionName === "game_provisioning_preflight_v1") {
        return {
          data: options.preflightError
            ? null
            : {
              ready: true,
              packId: "econovaria.beta-seed-pack.v1",
              packVersion: "1.0.0-beta",
            },
          error: options.preflightError ?? null,
        };
      }
      return {
        data: options.redemptionError ? null : [{
          game_session_id: GAME_SESSION_ID,
          entitlement_id: "44444444-4444-4444-8444-444444444444",
          purchase_code_id: "55555555-5555-4555-8555-555555555555",
          purchase_code_status: "exhausted",
          redeemed_count: 1,
          max_redemptions: 1,
          activated_at: "2026-06-22T00:00:00.000Z",
        }],
        error: options.redemptionError ?? null,
      };
    },
  } as unknown as EdgeSupabaseClient;

  return {
    dependencies: { createServiceClient: () => client },
    calls,
  };
}

function createStaffQuery(calls: MockCalls) {
  let operation = "select";
  const query = {
    insert: () => {
      operation = "insert";
      return query;
    },
    select: () => query,
    delete: () => {
      operation = "delete";
      return query;
    },
    eq: (_column: string, value: unknown) => {
      if (operation === "delete") {
        calls.staffDeletes.push(String(value));
      }
      return query;
    },
    single: async () => ({
      data: {
        id: STAFF_USER_ID,
        supabase_auth_user_id: AUTH_USER_ID,
        email: "teacher@example.com",
        display_name: "Teacher Name",
        created_at: "2026-06-22T00:00:00.000Z",
        updated_at: "2026-06-22T00:00:00.000Z",
      },
      error: null,
    }),
    then: (
      onfulfilled:
        | ((value: { data: unknown[]; error: null }) => unknown)
        | null,
      onrejected: ((reason: unknown) => unknown) | null,
    ) =>
      Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected),
  };

  return query;
}

function signupRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://bootstrap-api.test/staff/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "203.0.113.10",
      "x-econovaria-device-id": "123e4567-e89b-42d3-a456-426614174000",
    },
    body: JSON.stringify({
      email: "teacher@example.com",
      password: SECURE_PASSWORD,
      displayName: "Teacher Name",
      purchaseCode: "LICENSE-CODE",
      gameName: "Fall 2026",
      difficultyPreset: "moderate",
      stockMarketWindow: { timezone: "Asia/Seoul" },
      ...overrides,
    }),
  });
}

function domainRpcNames(calls: MockCalls): string[] {
  return calls.rpcNames.filter((name) =>
    name === "game_provisioning_preflight_v1" ||
    name === "redeem_purchase_code_for_game"
  );
}

async function assertError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.ok, false);
  assertEquals(body.error.code, code);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
