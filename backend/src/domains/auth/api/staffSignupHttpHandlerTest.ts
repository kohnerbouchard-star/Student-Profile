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

interface MockCalls {
  authCreates: number;
  authDeletes: string[];
  authDisables: string[];
  staffDeletes: string[];
  rpcNames: string[];
}

interface MockOptions {
  readonly rpcError?: { readonly message: string } | null;
}

Deno.test("staff signup validates before creating an Auth user", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(
    signupRequest({ password: "short" }),
    mock.dependencies,
  );

  await assertError(response, 400, "password_too_short");
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
});

Deno.test("staff signup creates the linked account and first game", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(
    signupRequest(),
    mock.dependencies,
  );
  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.ok, true);
  assertEquals(body.staff.id, STAFF_USER_ID);
  assertEquals(body.activation.gameSessionId, GAME_SESSION_ID);
  assertEquals(mock.calls.authCreates, 1);
  assertEquals(mock.calls.authDeletes.length, 0);
  assertEquals(mock.calls.rpcNames[0], "redeem_purchase_code_for_game");
});

Deno.test("staff signup compensates after license redemption fails", async () => {
  const mock = createMock({
    rpcError: { message: "PURCHASE_CODE_EXHAUSTED" },
  });
  const response = await handleStaffSignupRequest(
    signupRequest(),
    mock.dependencies,
  );

  await assertError(response, 409, "purchase_code_exhausted");
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
    authDeletes: [],
    authDisables: [],
    staffDeletes: [],
    rpcNames: [],
  };
  const client = {
    auth: {
      admin: {
        createUser: async () => {
          calls.authCreates += 1;
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
      return {
        data: options.rpcError ? null : [{
          game_session_id: GAME_SESSION_ID,
          entitlement_id: "44444444-4444-4444-8444-444444444444",
          purchase_code_id: "55555555-5555-4555-8555-555555555555",
          purchase_code_status: "exhausted",
          redeemed_count: 1,
          max_redemptions: 1,
          activated_at: "2026-06-22T00:00:00.000Z",
        }],
        error: options.rpcError ?? null,
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
  return new Request("https://classroom-api.test/staff/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "teacher@example.com",
      password: "secure-password",
      displayName: "Teacher Name",
      purchaseCode: "LICENSE-CODE",
      gameName: "Fall 2026",
      difficultyPreset: "moderate",
      stockMarketWindow: { timezone: "Asia/Seoul" },
      ...overrides,
    }),
  });
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
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}
