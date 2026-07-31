import { handleStaffSignupRequest } from "./staffSignupHttpHandler.ts";
import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const SIGNUP_REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const SECURE_PASSWORD = "SecurePassword123!";
const THROTTLE_BUCKETS = [
  { dimension: "account" as const, keyHash: "a".repeat(64) },
  { dimension: "device" as const, keyHash: "b".repeat(64) },
  { dimension: "ip" as const, keyHash: "c".repeat(64) },
];

interface Calls {
  readonly generatedLinks: unknown[];
  readonly sentEmails: unknown[];
  readonly authDeletes: string[];
  readonly authDisables: string[];
  readonly rpcCalls: Array<{ readonly name: string; readonly args: unknown }>;
  successes: number;
  failures: number;
}

interface MockOptions {
  readonly decision?: "create_new" | "resume_pending" | "existing_verified_identity" | "security_hold";
  readonly generateError?: boolean;
  readonly attachError?: boolean;
}

Deno.test("staff signup validates identity fields before generating Auth links", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(
    signupRequest({ password: "short" }),
    mock.dependencies,
  );

  await assertError(response, 400, "password_too_short");
  assertEquals(mock.calls.generatedLinks.length, 0);
  assertEquals(mock.calls.rpcCalls.length, 0);
});

Deno.test("public signup rejects license and game fields", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(
    signupRequest({
      purchaseCode: "LICENSE-CODE",
      gameName: "Fall 2026",
      difficultyPreset: "moderate",
      stockMarketWindow: { timezone: "Asia/Seoul" },
    }),
    mock.dependencies,
  );

  await assertError(response, 400, "unknown_request_field");
  assertEquals(mock.calls.generatedLinks.length, 0);
  assertEquals(mock.calls.rpcCalls.length, 0);
});

Deno.test("new signup claims identity before generating one Supabase signup link", async () => {
  const mock = createMock();
  const response = await handleStaffSignupRequest(signupRequest(), mock.dependencies);
  const body = await response.json();

  assertEquals(response.status, 202);
  assertEquals(body.ok, true);
  assertEquals(body.signupStatus, "check_email_or_sign_in");
  assertMatches(body.verification.continuationHandle, /^[A-Za-z0-9_-]{43}$/u);
  assertEquals(body.verification.maskedEmail, "t••••••@example.com");
  assertEquals(mock.calls.rpcCalls[0].name, "claim_staff_signup_identity_v1");
  assertEquals(mock.calls.generatedLinks.length, 1);
  assertEquals(mock.calls.rpcCalls[1].name, "attach_staff_signup_auth_user_v1");
  assertEquals(mock.calls.sentEmails.length, 1);
  assertEquals(mock.calls.successes, 1);

  assertEquals(mock.calls.generatedLinks[0], {
    email: "teacher@example.com",
    password: SECURE_PASSWORD,
    displayName: "Teacher Name",
  });
  assertEquals(mock.calls.sentEmails[0], {
    email: "teacher@example.com",
    displayName: "Teacher Name",
    tokenHash: "a".repeat(64),
    verificationType: "signup",
    signupRequestId: SIGNUP_REQUEST_ID,
    deliveryVersion: 1,
    expiresAt: "2026-08-01T00:00:00.000Z",
  });
  assertEquals(JSON.stringify(mock.calls.rpcCalls).includes("redeem_purchase_code_for_game"), false);
});

Deno.test("existing verified identity generates no Auth link and sends no email", async () => {
  const mock = createMock({ decision: "existing_verified_identity" });
  const response = await handleStaffSignupRequest(signupRequest(), mock.dependencies);
  const body = await response.json();

  assertEquals(response.status, 202);
  assertEquals(body.ok, true);
  assertMatches(body.verification.continuationHandle, /^[A-Za-z0-9_-]{43}$/u);
  assertEquals(mock.calls.generatedLinks.length, 0);
  assertEquals(mock.calls.sentEmails.length, 0);
  assertEquals(mock.calls.rpcCalls.length, 1);
});

Deno.test("duplicate pending signup never rotates or sends another link", async () => {
  const mock = createMock({ decision: "resume_pending" });
  const response = await handleStaffSignupRequest(signupRequest(), mock.dependencies);

  assertEquals(response.status, 202);
  assertEquals(mock.calls.generatedLinks.length, 0);
  assertEquals(mock.calls.sentEmails.length, 0);
  assertEquals(mock.calls.rpcCalls.length, 1);
});

Deno.test("Supabase link generation failure cancels the claimed request generically", async () => {
  const mock = createMock({ generateError: true });
  const response = await handleStaffSignupRequest(signupRequest(), mock.dependencies);
  const body = await response.json();

  assertEquals(response.status, 202);
  assertEquals(body.ok, true);
  assertEquals(mock.calls.rpcCalls.map((call) => call.name), [
    "claim_staff_signup_identity_v1",
    "cancel_staff_signup_v1",
  ]);
  assertEquals(mock.calls.failures, 1);
});

Deno.test("attach failure deletes the generated Auth user and fails closed", async () => {
  const mock = createMock({ attachError: true });
  const response = await handleStaffSignupRequest(signupRequest(), mock.dependencies);

  await assertError(response, 503, "staff_signup_unavailable");
  assertEquals(mock.calls.authDeletes, [AUTH_USER_ID]);
  assertEquals(mock.calls.sentEmails.length, 0);
});

function createMock(options: MockOptions = {}) {
  const calls: Calls = {
    generatedLinks: [],
    sentEmails: [],
    authDeletes: [],
    authDisables: [],
    rpcCalls: [],
    successes: 0,
    failures: 0,
  };
  const decision = options.decision ?? "create_new";
  const serviceClient = {
    auth: {
      admin: {
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
    from: () => createEmptyQuery(),
    rpc: async (name: string, args: unknown) => {
      calls.rpcCalls.push({ name, args });
      if (name === "claim_staff_signup_identity_v1") {
        return {
          data: [{
            decision,
            signup_request_id: decision === "create_new" ? SIGNUP_REQUEST_ID : null,
            verification_expires_at: "2026-08-01T00:00:00.000Z",
            send_verification: decision === "create_new",
          }],
          error: null,
        };
      }
      if (name === "attach_staff_signup_auth_user_v1") {
        return options.attachError
          ? { data: false, error: { message: "attach failed" } }
          : { data: true, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as EdgeSupabaseClient;

  return {
    dependencies: {
      createServiceClient: (_env: SupabaseEnv) => serviceClient,
      generateSignupLink: async (_service: EdgeSupabaseClient, input: unknown) => {
        calls.generatedLinks.push(input);
        return options.generateError
          ? null
          : {
            authUserId: AUTH_USER_ID,
            email: "teacher@example.com",
            tokenHash: "a".repeat(64),
            verificationType: "signup" as const,
          };
      },
      sendVerificationEmail: async (input: unknown) => {
        calls.sentEmails.push(input);
        return true;
      },
      enforceVolumetric: async () => ({
        allowed: true,
        retryAfterSeconds: 0,
        limitingDimension: null,
        limit: 90,
        remaining: 89,
        resetAt: "2026-07-26T00:05:00.000Z",
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
          retryAfterSeconds: 0,
          limitingDimension: null,
          failureCount: 1,
          lockedUntil: null,
        };
      },
      recordSuccess: async () => {
        calls.successes += 1;
      },
    },
    calls,
  };
}

function createEmptyQuery() {
  const query = {
    select: () => query,
    insert: () => query,
    update: () => query,
    upsert: () => query,
    delete: () => query,
    eq: () => query,
    in: () => query,
    limit: () => query,
    order: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (
      onfulfilled: ((value: { data: unknown[]; error: null }) => unknown) | null,
      onrejected: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected),
  };
  return query;
}

function signupRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://bootstrap-api.test/staff/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "teacher@example.com",
      password: SECURE_PASSWORD,
      displayName: "Teacher Name",
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

function assertMatches(value: unknown, pattern: RegExp): void {
  if (!pattern.test(String(value || ""))) {
    throw new Error(`Expected ${JSON.stringify(value)} to match ${pattern}.`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
