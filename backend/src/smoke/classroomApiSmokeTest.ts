import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  resolveStaffSessionForRequest,
} from "../platform/supabase/edgeStaffSession.ts";
import { handleStaffBootstrapRequest } from "../domains/auth/api/staffBootstrapHttpHandler.ts";
import { handleLicensingActivationRequest } from "../domains/licensing/api/licensingActivationHttpHandler.ts";

type StaffRow = Record<string, string> & {
  readonly id: string;
  readonly supabase_auth_user_id: string;
  readonly email: string;
  readonly display_name: string;
};

interface AuthUser {
  readonly id: string;
  readonly email?: string | null;
}

interface QueryError {
  readonly message: string;
}

interface MockOptions {
  readonly authUser?: AuthUser | null;
  readonly authError?: QueryError | null;
  readonly staffRow?: StaffRow | null;
  readonly staffError?: QueryError | null;
  readonly gameSessionRows?: readonly unknown[];
  readonly gameSessionError?: QueryError | null;
}

interface MockCalls {
  authTokens: string[];
  serviceCreated: number;
  authCreated: number;
  rpcNames: string[];
}

interface MockDependencies {
  readonly dependencies: {
    readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
    readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  };
  readonly serviceClient: EdgeSupabaseClient;
  readonly calls: MockCalls;
}

const ENV: SupabaseEnv = {
  supabaseUrl: "http://localhost:54321",
  supabaseAnonKey: "smoke-anon-key",
  supabaseServiceRoleKey: "smoke-service-role-key",
};

const STAFF: StaffRow = {
  id: "staff-smoke-1",
  supabase_auth_user_id: "auth-smoke-1",
  email: "staff-smoke@example.test",
  display_name: "Staff Smoke",
};

const AUTH_USER: AuthUser = {
  id: STAFF.supabase_auth_user_id,
  email: STAFF.email,
};

const tests: readonly [string, () => Promise<void>][] = [
  ["shared helper rejects missing authorization", testSharedMissingAuthorization],
  ["shared helper rejects invalid auth user", testSharedInvalidAuthUser],
  ["shared helper returns configured lookup failure", testSharedLookupError],
  ["shared helper returns staff_not_found", testSharedMissingStaff],
  ["shared helper returns staff auth user and service client", testSharedSuccess],
  ["staff bootstrap missing auth returns missing_staff_auth_user", testBootstrapMissingAuth],
  ["staff bootstrap lookup failure preserves staff_bootstrap_failed", testBootstrapLookupError],
  ["licensing missing auth happens before body parsing", testLicensingMissingAuthBeforeBodyParse],
  ["licensing invalid JSON happens before staff lookup", testLicensingInvalidJsonBeforeStaffLookup],
  ["licensing lookup failure preserves activation failure body", testLicensingLookupError],
];

for (const [name, run] of tests) {
  await run();
  console.log(`ok - ${name}`);
}

async function testSharedMissingAuthorization(): Promise<void> {
  const mock = createMockDependencies();
  const result = await resolveStaffSessionForRequest(
    request("GET", "/staff/bootstrap"),
    ENV,
    mock.dependencies,
    { missingMessage: "Missing staff smoke auth." },
  );

  assert(!result.ok, "Expected missing authorization to fail.");
  assertEqual(result.status, 401, "Expected missing authorization status.");
  assertEqual(result.error.code, "missing_staff_auth_user", "Expected missing auth code.");
  assertEqual(result.error.message, "Missing staff smoke auth.", "Expected custom missing auth message.");
  assertEqual(mock.calls.authCreated, 0, "Auth client should not be created.");
  assertEqual(mock.calls.serviceCreated, 0, "Service client should not be created.");
}

async function testSharedInvalidAuthUser(): Promise<void> {
  const mock = createMockDependencies({
    authUser: null,
    authError: { message: "invalid jwt" },
  });
  const result = await resolveStaffSessionForRequest(
    authorizedRequest("GET", "/staff/bootstrap"),
    ENV,
    mock.dependencies,
    { missingMessage: "Invalid staff smoke auth." },
  );

  assert(!result.ok, "Expected invalid auth user to fail.");
  assertEqual(result.status, 401, "Expected invalid auth status.");
  assertEqual(result.error.code, "missing_staff_auth_user", "Expected invalid auth code.");
  assertEqual(result.error.message, "Invalid staff smoke auth.", "Expected invalid auth message.");
  assertEqual(mock.calls.authTokens[0], "smoke-token", "Expected bearer token lookup.");
  assertEqual(mock.calls.serviceCreated, 0, "Service client should not be created.");
}

async function testSharedLookupError(): Promise<void> {
  const mock = createMockDependencies({}, {
    staffError: { message: "lookup failed" },
  });
  const result = await resolveStaffSessionForRequest(
    authorizedRequest("GET", "/staff/bootstrap"),
    ENV,
    mock.dependencies,
    {
      missingMessage: "Staff auth is required.",
      lookupFailureError: {
        code: "configured_lookup_failed",
        message: "Configured lookup failed.",
        retryable: true,
      },
    },
  );

  assert(!result.ok, "Expected staff lookup error to fail.");
  assertEqual(result.status, 500, "Expected staff lookup error status.");
  assertEqual(result.error.code, "configured_lookup_failed", "Expected configured lookup code.");
  assertEqual(result.error.message, "Configured lookup failed.", "Expected configured lookup message.");
  assertEqual(result.error.retryable, true, "Expected configured retryable flag.");
}

async function testSharedMissingStaff(): Promise<void> {
  const mock = createMockDependencies({}, {
    staffRow: null,
  });
  const result = await resolveStaffSessionForRequest(
    authorizedRequest("GET", "/staff/bootstrap"),
    ENV,
    mock.dependencies,
    { missingMessage: "Staff auth is required." },
  );

  assert(!result.ok, "Expected missing staff row to fail.");
  assertEqual(result.status, 403, "Expected missing staff status.");
  assertEqual(result.error.code, "staff_not_found", "Expected missing staff code.");
  assertEqual(
    result.error.message,
    "No staff user is linked to the Supabase Auth user.",
    "Expected missing staff message.",
  );
}

async function testSharedSuccess(): Promise<void> {
  const mock = createMockDependencies();
  const result = await resolveStaffSessionForRequest(
    authorizedRequest("GET", "/staff/bootstrap"),
    ENV,
    mock.dependencies,
    { missingMessage: "Staff auth is required." },
  );

  assert(result.ok, "Expected staff resolution success.");
  assertEqual(result.authUser.id, AUTH_USER.id, "Expected auth user id.");
  assertEqual(result.authUser.email, AUTH_USER.email, "Expected auth user email.");
  assertEqual(result.staff.id, STAFF.id, "Expected staff id.");
  assertSame(result.serviceClient, mock.serviceClient, "Expected returned service client.");
}

async function testBootstrapMissingAuth(): Promise<void> {
  const mock = createMockDependencies();
  const response = await handleStaffBootstrapRequest(
    request("GET", "/staff/bootstrap"),
    mock.dependencies,
  );

  await assertErrorResponse(response, 401, "missing_staff_auth_user");
  assertEqual(mock.calls.authCreated, 0, "Auth client should not be created.");
  assertEqual(mock.calls.serviceCreated, 0, "Service client should not be created.");
}

async function testBootstrapLookupError(): Promise<void> {
  const mock = createMockDependencies({}, {
    staffError: { message: "lookup failed" },
  });
  const response = await handleStaffBootstrapRequest(
    authorizedRequest("GET", "/staff/bootstrap"),
    mock.dependencies,
  );

  await assertErrorResponse(response, 500, "staff_bootstrap_failed", "Staff bootstrap failed.");
}

async function testLicensingMissingAuthBeforeBodyParse(): Promise<void> {
  const mock = createMockDependencies();
  const response = await handleLicensingActivationRequest(
    request("POST", "/licensing/activate", "{not-json"),
    mock.dependencies,
  );

  await assertErrorResponse(response, 401, "missing_staff_auth_user");
  assertEqual(mock.calls.authCreated, 0, "Auth client should not be created.");
  assertEqual(mock.calls.serviceCreated, 0, "Service client should not be created.");
}

async function testLicensingInvalidJsonBeforeStaffLookup(): Promise<void> {
  const mock = createMockDependencies();
  const response = await handleLicensingActivationRequest(
    authorizedRequest("POST", "/licensing/activate", "{not-json"),
    mock.dependencies,
  );

  await assertErrorResponse(response, 400, "invalid_request_body");
  assertEqual(mock.calls.serviceCreated, 0, "Service client should not be created before valid JSON.");
}

async function testLicensingLookupError(): Promise<void> {
  const mock = createMockDependencies({}, {
    staffError: { message: "lookup failed" },
  });
  const response = await handleLicensingActivationRequest(
    authorizedJsonRequest("POST", "/licensing/activate", {
      purchaseCode: "smoke-code",
      gameName: "Smoke Game",
    }),
    mock.dependencies,
  );

  await assertErrorResponse(
    response,
    500,
    "licensing_activation_failed",
    "Purchase-code activation failed.",
  );
  assertEqual(mock.calls.rpcNames.length, 0, "Activation RPC should not be called.");
}

function createMockDependencies(
  authOptions: MockOptions = {},
  serviceOptions: MockOptions = {},
): MockDependencies {
  const calls: MockCalls = {
    authTokens: [],
    serviceCreated: 0,
    authCreated: 0,
    rpcNames: [],
  };
  const authClient = createMockClient(
    {
      authUser: AUTH_USER,
      ...authOptions,
    },
    calls,
  );
  const serviceClient = createMockClient(
    {
      staffRow: STAFF,
      gameSessionRows: [],
      ...serviceOptions,
    },
    calls,
  );

  return {
    dependencies: {
      createAuthClient: () => {
        calls.authCreated += 1;
        return authClient;
      },
      createServiceClient: () => {
        calls.serviceCreated += 1;
        return serviceClient;
      },
    },
    serviceClient,
    calls,
  };
}

function createMockClient(options: MockOptions, calls: MockCalls): EdgeSupabaseClient {
  return {
    auth: {
      getUser: async (accessToken: string) => {
        calls.authTokens.push(accessToken);

        return {
          data: { user: options.authUser ?? null },
          error: options.authError ?? null,
        };
      },
    },
    from: (tableName: string) => createQuery(tableName, options),
    rpc: async (functionName: string) => {
      calls.rpcNames.push(functionName);

      return { data: null, error: null };
    },
  } as unknown as EdgeSupabaseClient;
}

function createQuery(tableName: string, options: MockOptions) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    limit: () => query,
    order: () => query,
    maybeSingle: async () => maybeSingleResponse(tableName, options),
    single: async () => maybeSingleResponse(tableName, options),
    then: (
      onfulfilled: ((value: { readonly data: unknown[]; readonly error: QueryError | null }) => unknown) | null,
      onrejected: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(listResponse(tableName, options)).then(onfulfilled, onrejected),
  };

  return query;
}

function maybeSingleResponse(tableName: string, options: MockOptions) {
  if (tableName === "staff_users") {
    return {
      data: options.staffRow ?? null,
      error: options.staffError ?? null,
    };
  }

  return { data: null, error: null };
}

function listResponse(tableName: string, options: MockOptions) {
  if (tableName === "game_sessions") {
    return {
      data: [...(options.gameSessionRows ?? [])],
      error: options.gameSessionError ?? null,
    };
  }

  return { data: [], error: null };
}

function request(method: string, path: string, body?: string): Request {
  return new Request(`https://classroom-api.smoke.test${path}`, { method, body });
}

function authorizedRequest(method: string, path: string, body?: string): Request {
  return new Request(`https://classroom-api.smoke.test${path}`, {
    method,
    headers: { authorization: "Bearer smoke-token" },
    body,
  });
}

function authorizedJsonRequest(method: string, path: string, body: unknown): Request {
  return new Request(`https://classroom-api.smoke.test${path}`, {
    method,
    headers: {
      authorization: "Bearer smoke-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function assertErrorResponse(
  response: Response,
  status: number,
  code: string,
  message?: string,
): Promise<void> {
  const body = await response.json();

  assertEqual(response.status, status, `Expected ${code} response status.`);
  assert(isObject(body), "Expected response body object.");
  assert(isObject(body.error), "Expected response error object.");
  assertEqual(body.error.code, code, `Expected ${code} error code.`);

  if (message !== undefined) {
    assertEqual(body.error.message, message, `Expected ${code} error message.`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${format(expected)}, received ${format(actual)}.`);
  }
}

function assertSame(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function format(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : JSON.stringify(value);
}
