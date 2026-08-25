import type {
  EdgeStaffSessionFailure,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import type { StaffGameSessionBootstrapRepository } from "../application/staffGameSessionBootstrap.ts";
import {
  createStaffRequestApplicationContext,
  type CreateStaffRequestApplicationContextInput,
} from "../../../shared/staffRequestApplicationContextFactory.ts";
import { handleStaffBootstrapRequest } from "./staffBootstrapHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const REQUEST_ID = "50000000-0000-4000-8000-000000000005";
const ENV: SupabaseEnv = {
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "test-anon-key",
  supabaseServiceRoleKey: "test-service-role-key",
};

const RESOLVER_FAILURE_CASES = [
  {
    name: "resolver lookup failure",
    failure: {
      ok: false,
      status: 500,
      error: {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
        retryable: false,
      },
    },
  },
  {
    name: "missing or invalid Auth user",
    failure: {
      ok: false,
      status: 401,
      error: {
        code: "missing_staff_auth_user",
        message:
          "A verified Supabase Auth user is required to load staff data.",
        retryable: false,
      },
    },
  },
  {
    name: "outdated controlled claims",
    failure: {
      ok: false,
      status: 403,
      error: {
        code: "staff_claims_outdated",
        message:
          "The staff authorization claims must be refreshed by an administrator.",
        retryable: false,
      },
    },
  },
  {
    name: "universal rate-limit denial",
    failure: {
      ok: false,
      status: 429,
      error: {
        code: "staff_rate_limit_exceeded",
        message: "Too many staff requests. Try again later.",
        retryable: true,
      },
      retryAfterSeconds: 45,
      resetAt: "2026-08-18T10:02:00.000Z",
    },
  },
  {
    name: "rate protection failure",
    failure: {
      ok: false,
      status: 503,
      error: {
        code: "staff_rate_limit_unavailable",
        message: "Staff request protection is unavailable.",
        retryable: true,
      },
    },
  },
] as const satisfies readonly {
  readonly name: string;
  readonly failure: EdgeStaffSessionFailure;
}[];

Deno.test("Staff bootstrap stops before security or hydration when environment is missing", async () => {
  const calls = negativeBoundaryCalls();
  const dependencies = negativeBoundaryDependencies(
    calls,
    async () => RESOLVER_FAILURE_CASES[0].failure,
  );

  const response = await handleStaffBootstrapRequest(authorizedRequest(), {
    ...dependencies,
    readEnvironment: () => {
      calls.environment += 1;
      return { ok: false as const };
    },
  });

  await assertExactError(response, 500, {
    code: "missing_edge_runtime_config",
    message: "Classroom API runtime configuration is incomplete.",
    retryable: false,
  });
  assertNegativeBoundaryCalls(calls, 0);
});

for (const testCase of RESOLVER_FAILURE_CASES) {
  Deno.test(`Staff bootstrap performs no hydration work after ${testCase.name}`, async () => {
    const calls = negativeBoundaryCalls();
    const response = await handleStaffBootstrapRequest(
      authorizedRequest(),
      negativeBoundaryDependencies(
        calls,
        async () => testCase.failure,
      ),
    );

    await assertExactError(
      response,
      testCase.failure.status,
      testCase.failure.error,
    );
    assertNegativeBoundaryCalls(calls, 1);
  });
}

Deno.test("Staff bootstrap performs no hydration work when security resolution throws", async () => {
  const calls = negativeBoundaryCalls();
  const response = await handleStaffBootstrapRequest(
    authorizedRequest(),
    negativeBoundaryDependencies(calls, async () => {
      throw new Error("private resolver failure");
    }),
  );

  await assertExactError(response, 500, {
    code: "staff_bootstrap_failed",
    message: "Staff bootstrap failed.",
    retryable: false,
  });
  assertNegativeBoundaryCalls(calls, 1);
});

interface NegativeBoundaryCalls {
  environment: number;
  resolver: number;
  repositoryFactory: number;
  discovery: number;
  requestIds: number;
  contexts: number;
  hydration: number;
}

function negativeBoundaryCalls(): NegativeBoundaryCalls {
  return {
    environment: 0,
    resolver: 0,
    repositoryFactory: 0,
    discovery: 0,
    requestIds: 0,
    contexts: 0,
    hydration: 0,
  };
}

function negativeBoundaryDependencies(
  calls: NegativeBoundaryCalls,
  resolve: () => Promise<EdgeStaffSessionFailure>,
) {
  const repository: StaffGameSessionBootstrapRepository = {
    discoverOwnedGameSessionIds: async () => {
      calls.discovery += 1;
      return [];
    },
    readStaffBootstrapProfile: () =>
      fail("Staff profile is already security-reviewed"),
    hydrateOwnedGameSessions: async () => {
      calls.hydration += 1;
      return [];
    },
  };

  return {
    createAuthClient: () =>
      fail("auth client must be supplied by the resolver"),
    createServiceClient: () =>
      fail("service client must be supplied by the resolver"),
    readEnvironment: () => {
      calls.environment += 1;
      return { ok: true as const, value: ENV };
    },
    resolveStaffSession: async () => {
      calls.resolver += 1;
      return await resolve();
    },
    createBootstrapRepository: () => {
      calls.repositoryFactory += 1;
      return repository;
    },
    createRequestId: () => {
      calls.requestIds += 1;
      return REQUEST_ID;
    },
    createApplicationContext: (
      input: CreateStaffRequestApplicationContextInput,
    ) => {
      calls.contexts += 1;
      return createStaffRequestApplicationContext(input);
    },
  };
}

function assertNegativeBoundaryCalls(
  calls: NegativeBoundaryCalls,
  resolver: number,
): void {
  assertEquals(calls, {
    environment: 1,
    resolver,
    repositoryFactory: 0,
    discovery: 0,
    requestIds: 0,
    contexts: 0,
    hydration: 0,
  });
}

function authorizedRequest(): Request {
  return new Request("https://staff.example.test/staff/bootstrap", {
    headers: { authorization: "Bearer staff-token" },
  });
}

async function assertExactError(
  response: Response,
  status: number,
  error: EdgeStaffSessionFailure["error"],
): Promise<void> {
  assertEquals(response.status, status);
  assertEquals(await response.json(), { ok: false, error });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function fail(message: string): never {
  throw new Error(message);
}
