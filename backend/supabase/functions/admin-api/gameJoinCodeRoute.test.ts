import { handleGameRead } from "./gameRoutes.ts";

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

Deno.test("Admin GET router does not intercept the existing POST rotation route", async () => {
  const service = fixtureClient(row());
  const request = requestFor("POST");
  const response = await handleGameRead(
    request,
    { service, staff: { id: STAFF_ID } },
    new URL(request.url),
    gameSession(),
    GAME_ID,
    "/join-code/reset",
  );

  assertEquals(response, null);
  assertEquals(service.calls, []);
});

async function route(
  service: ReturnType<typeof fixtureClient>,
): Promise<Response> {
  const request = requestFor("GET");
  const response = await handleGameRead(
    request,
    { service, staff: { id: STAFF_ID } },
    new URL(request.url),
    gameSession(),
    GAME_ID,
    "/join-code/reset",
  );
  if (!response) {
    throw new Error("Expected the Admin GET router to handle the route.");
  }
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

function requestFor(method: string): Request {
  return new Request(
    `https://example.supabase.co/functions/v1/admin-api/games/${GAME_ID}/join-code/reset`,
    {
      method,
      headers: { origin: "https://econovaria.vercel.app" },
    },
  );
}

function assertResponse(response: Response): void {
  assertEquals(response.headers.get("cache-control"), "no-store");
  assertEquals(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
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
