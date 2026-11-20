import { handleGameRead } from "./gameRoutes.ts";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import type { AdminPermission } from "./adminPermissions.ts";
import { loadSettings } from "./readModels.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UPDATED_AT = "2026-08-04T04:30:00.000Z";

Deno.test("Admin join-code GET executes the owner-scoped repository path", async () => {
  const service = fixtureClient(row());
  const response = await route(service);

  assertResponse(response);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    gameSession: gameSession(),
    joinCode: {
      gameJoinCode: "ECO-ALPHA-042",
      status: "active",
      updatedAt: UPDATED_AT,
    },
  });
  assertEquals(service.calls, [
    ["from", "game_sessions"],
    [
      "select",
      "id,owner_staff_user_id,game_join_code,game_join_code_status,updated_at",
    ],
    ["eq", "id", GAME_ID],
    ["eq", "owner_staff_user_id", STAFF_ID],
    ["maybeSingle"],
  ]);
});

Deno.test("Admin join-code GET preserves legacy and persistence error contracts", async () => {
  for (
    const [service, expectedCode, expectedStatus] of [
      [fixtureClient(null), "join_code_not_available", 409],
      [
        fixtureClient(null, { message: "database secret" }),
        "join_code_read_failed",
        500,
      ],
    ] as const
  ) {
    const response = await route(service);
    assertResponse(response);
    const body = await response.json();

    assertEquals(response.status, expectedStatus);
    assertEquals(body.error.code, expectedCode);
    assertEquals(JSON.stringify(body).includes("database secret"), false);
  }
});

Deno.test("Admin settings reads use the reviewed context and preserve defaults and privacy", async () => {
  const service = settingsFixtureClient({
    attendance_window: { timezone: "Asia/Seoul" },
    business_market_window: null,
    stock_market_window: null,
    news_schedule: null,
    updated_at: null,
  });
  const applicationContext = adminContext("settings.manage");
  const response = await settingsRoute(
    service,
    "/settings",
    applicationContext,
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    data: {
      settings: {
        difficultyBasePreset: "moderate",
        backendDifficultyPreset: "moderate",
        difficultyPreset: "moderate",
        difficulty: "moderate",
        priceMultiplier: 1,
        incomeMultiplier: 1,
        shockFrequency: 1,
        shockSeverity: 1,
        shockBias: 0,
        bankruptcyProtection: 1,
        recoverySupport: 1,
        tradeMultiplier: 1,
        attendanceWindow: { timezone: "Asia/Seoul" },
        businessMarketWindow: {},
        stockMarketWindow: {},
        newsSchedule: {},
        configSaveState: "saved",
        configLastSaved: null,
        validationMode: "server",
      },
    },
  });
  assertEquals(
    service.calls.filter((call) =>
      JSON.stringify(call) ===
        JSON.stringify(["eq", "game_session_id", GAME_ID])
    ).length,
    2,
  );
  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(STAFF_ID), false);
  assertEquals(serialized.includes(applicationContext.requestId), false);
  assertEquals(serialized.includes("applicationContext"), false);
});

Deno.test("Admin settings read model preserves the exact application context", async () => {
  const applicationContext = adminContext("settings.manage");
  let receivedContext: unknown;
  await loadSettings({
    readAdminGameSettingsView(input) {
      receivedContext = input.applicationContext;
      return Promise.resolve({ settings: null, difficultyPolicy: null });
    },
  }, applicationContext);

  assertSame(receivedContext, applicationContext);
});

Deno.test("Admin settings read model preserves repository failures", async () => {
  const persistenceFailure = new Error(
    "sanitized settings persistence failure",
  );
  let received: unknown;
  try {
    await loadSettings({
      readAdminGameSettingsView() {
        return Promise.reject(persistenceFailure);
      },
    }, adminContext("settings.manage"));
  } catch (error) {
    received = error;
  }

  assertSame(received, persistenceFailure);
});

Deno.test("Admin settings group reads preserve the existing group projection", async () => {
  const service = settingsFixtureClient({
    difficulty_preset: "hard",
    attendance_window: { timezone: "Asia/Seoul" },
    updated_at: UPDATED_AT,
  });
  const response = await settingsRoute(
    service,
    "/settings/attendanceWindow",
    adminContext("settings.manage"),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.data.group, "attendanceWindow");
  assertEquals(body.data.value, { timezone: "Asia/Seoul" });
  assertEquals(body.data.settings.difficultyPreset, "hard");
});

Deno.test("Admin GET router does not intercept the existing POST rotation route", async () => {
  const service = fixtureClient(row());
  const request = requestFor("POST");
  const applicationContext = adminContext("game.update");
  const response = await handleGameRead(
    request,
    { service, staff: { id: STAFF_ID } },
    new URL(request.url),
    gameSession(),
    GAME_ID,
    "/join-code/reset",
    applicationContext,
  );

  assertEquals(response, null);
  assertEquals(service.calls, []);
});

async function route(
  service: ReturnType<typeof fixtureClient>,
): Promise<Response> {
  const request = requestFor("GET");
  const applicationContext = adminContext("game.read");
  const response = await handleGameRead(
    request,
    { service, staff: { id: STAFF_ID } },
    new URL(request.url),
    gameSession(),
    GAME_ID,
    "/join-code/reset",
    applicationContext,
  );
  if (!response) {
    throw new Error("Expected the Admin GET router to handle the route.");
  }
  return response;
}

async function settingsRoute(
  service: ReturnType<typeof settingsFixtureClient>,
  suffix: string,
  applicationContext: ReturnType<typeof adminContext>,
): Promise<Response> {
  const request = requestFor("GET", suffix);
  const response = await handleGameRead(
    request,
    { service, staff: { id: STAFF_ID } },
    new URL(request.url),
    gameSession(),
    GAME_ID,
    suffix,
    applicationContext,
  );
  if (!response) throw new Error("Expected Admin settings route handling.");
  return response;
}

function fixtureClient(
  data: Record<string, unknown> | null,
  error: { readonly message: string } | null = null,
) {
  const calls: unknown[] = [];
  const builder = {
    select(columns: string) {
      calls.push(["select", columns]);
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return builder;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve({ data, error });
    },
  };
  return {
    calls,
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
  };
}

function settingsFixtureClient(
  settings: Record<string, unknown> | null,
  difficultyPolicy: Record<string, unknown> | null = null,
) {
  const calls: unknown[][] = [];
  return {
    calls,
    from(table: string) {
      calls.push(["from", table]);
      const data = table === "game_settings" ? settings : difficultyPolicy;
      const builder = {
        select(columns: string) {
          calls.push(["select", columns]);
          return builder;
        },
        eq(column: string, value: unknown) {
          calls.push(["eq", column, value]);
          return builder;
        },
        maybeSingle() {
          calls.push(["maybeSingle"]);
          return Promise.resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

function row(): Record<string, unknown> {
  return {
    id: GAME_ID,
    owner_staff_user_id: STAFF_ID,
    game_join_code: "ECO-ALPHA-042",
    game_join_code_status: "active",
    updated_at: UPDATED_AT,
  };
}

function gameSession() {
  return { id: GAME_ID, name: "Period 4 Economy", status: "active" };
}

function requestFor(method: string, suffix = "/join-code/reset"): Request {
  return new Request(
    `https://example.supabase.co/functions/v1/admin-api/games/${GAME_ID}${suffix}`,
    {
      method,
      headers: { origin: "https://econovaria.vercel.app" },
    },
  );
}

function adminContext(requiredPermission: AdminPermission) {
  return createAdminRequestApplicationContext({
    ownedGame: { id: GAME_ID },
    staffUserId: STAFF_ID,
    requestId: `server-admin-${requiredPermission.replace(".", "-")}-001`,
    security: {
      ok: true,
      assuranceLevel: "aal2",
      permissions: [requiredPermission],
      requiredPermission,
    },
  });
}

function assertResponse(response: Response): void {
  assertEquals(response.headers.get("cache-control"), "no-store");
  assertEquals(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
}

function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error("Expected the same object reference");
  }
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
