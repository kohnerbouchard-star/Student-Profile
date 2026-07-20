import {
  guardGameScopedMutation,
  handleGameLifecycleOperation,
} from "./gameLifecycleOperations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000901";
const STAFF_ID = "00000000-0000-4000-8000-000000000902";
const NOW = "2026-07-19T06:00:00.000Z";

Deno.test("Admin lifecycle read returns a bounded public state model", async () => {
  const service = fixtureService([readRow()]);
  const result = await handleGameLifecycleOperation(service, input(
    request("GET", "/games/x/lifecycle"),
    "/lifecycle",
  ));
  assertEquals(result.status, 200);
  assertEquals(service.calls[0], {
    name: "read_admin_game_lifecycle_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
    },
  });
  const lifecycle = (result.body as any).data.lifecycle;
  assertEquals(lifecycle, {
    state: "active",
    operationalStatus: "active",
    version: 4,
    joinCodeStatus: "active",
    allowedActions: ["pause", "end", "revoke_sessions"],
    activePlayerSessions: 3,
    startedAt: NOW,
    pausedAt: null,
    resumedAt: null,
    endedAt: null,
    archivedAt: null,
    updatedAt: NOW,
  });
});

Deno.test("Admin lifecycle start activates a draft game", async () => {
  const service = fixtureService([transitionRow({
    transition_action: "start",
    previous_state: "draft",
    lifecycle_state: "active",
    operational_status: "active",
    lifecycle_version: 2,
    join_code_status: "pending",
    allowed_actions: ["pause", "end", "revoke_sessions"],
  })]);
  const result = await handleGameLifecycleOperation(service, input(
    request("POST", "/games/x/lifecycle/start", {
      idempotencyKey: "life.start.1",
      expectedVersion: 1,
    }),
    "/lifecycle/start",
  ));
  assertEquals(result.status, 200);
  assertEquals(service.calls[0], {
    name: "transition_game_lifecycle_atomic_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_action: "start",
      p_idempotency_key: "life.start.1",
      p_expected_version: 1,
    },
  });
  assertEquals((result.body as any).data.lifecycle.state, "active");
});

Deno.test("Admin lifecycle pause sends only server-owned scope and optimistic version", async () => {
  const service = fixtureService([transitionRow({
    transition_action: "pause",
    previous_state: "active",
    lifecycle_state: "paused",
    operational_status: "disabled",
    lifecycle_version: 5,
    allowed_actions: ["resume", "end", "revoke_sessions"],
    paused_at: NOW,
  })]);
  const result = await handleGameLifecycleOperation(service, input(
    request("POST", "/games/x/lifecycle/pause", {
      idempotencyKey: "life.pause.1",
      expectedVersion: 4,
    }, { "x-idempotency-key": "life.pause.1" }),
    "/lifecycle/pause",
  ));
  assertEquals(result.status, 200);
  assertEquals(service.calls[0], {
    name: "transition_game_lifecycle_atomic_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_action: "pause",
      p_idempotency_key: "life.pause.1",
      p_expected_version: 4,
    },
  });
  assertEquals((result.body as any).data.lifecycle.state, "paused");
  assertEquals((result.body as any).data.lifecycle.operationalStatus, "disabled");
});

Deno.test("Admin lifecycle exposes explicit Player session revocation", async () => {
  const service = fixtureService([transitionRow({
    transition_action: "revoke_sessions",
    sessions_revoked: 7,
  })]);
  const result = await handleGameLifecycleOperation(service, input(
    request("POST", "/games/x/sessions/revoke", {
      idempotencyKey: "life.sessions.1",
      expectedVersion: 4,
    }),
    "/sessions/revoke",
  ));
  assertEquals(result.status, 200);
  assertEquals((result.body as any).data.action, "revoke_sessions");
  assertEquals((result.body as any).data.lifecycle.sessionsRevoked, 7);
});

Deno.test("Admin lifecycle rejects browser scope injection and unsafe idempotency", async () => {
  const service = fixtureService([]);
  const cases = [
    input(request("POST", "/games/x/lifecycle/pause", {
      idempotencyKey: "safe-key",
      gameSessionId: GAME_ID,
    }), "/lifecycle/pause"),
    input(request("POST", "/games/x/lifecycle/pause", {
      idempotencyKey: "unsafe key",
    }), "/lifecycle/pause"),
    input(request("POST", "/games/x/lifecycle/pause", {
      idempotencyKey: "body-key",
    }, { "x-idempotency-key": "other-key" }), "/lifecycle/pause"),
    input(request("POST", "/games/x/lifecycle/pause?force=true", {
      idempotencyKey: "safe-key",
    }), "/lifecycle/pause"),
  ];
  for (const candidate of cases) {
    const result = await handleGameLifecycleOperation(service, candidate);
    assertEquals(result.status, 400);
  }
  assertEquals(service.calls.length, 0);
});

Deno.test("Lifecycle guard blocks paused and terminal game writes but preserves controls", () => {
  assertEquals(guardGameScopedMutation({
    method: "POST",
    operationalStatus: "active",
    suffix: "/store/items",
  }).handled, false);
  assertEquals(guardGameScopedMutation({
    method: "POST",
    operationalStatus: "disabled",
    suffix: "/store/items",
  }).status, 423);
  assertEquals(guardGameScopedMutation({
    method: "POST",
    operationalStatus: "archived",
    suffix: "/attendance/scans",
  }).status, 409);
  assertEquals(guardGameScopedMutation({
    method: "POST",
    operationalStatus: "disabled",
    suffix: "/join-code/reset",
  }).handled, false);
  assertEquals(guardGameScopedMutation({
    method: "POST",
    operationalStatus: "archived",
    suffix: "/sessions/revoke",
  }).handled, false);
  assertEquals(guardGameScopedMutation({
    method: "POST",
    operationalStatus: "archived",
    suffix: "/join-code/reset",
  }).status, 409);
  assertEquals(guardGameScopedMutation({
    method: "PATCH",
    operationalStatus: "unexpected",
    suffix: "/settings",
  }).status, 409);
});

Deno.test("Lifecycle persistence errors map to stable retry and conflict states", async () => {
  const schema = fixtureService([], { code: "42883", message: "function does not exist" });
  const schemaResult = await handleGameLifecycleOperation(schema, input(
    request("GET", "/games/x/lifecycle"),
    "/lifecycle",
  ));
  assertEquals(schemaResult.status, 503);
  assertEquals((schemaResult.body as any).error.code, "game_lifecycle_schema_not_applied");

  const conflict = fixtureService([], {
    code: "P0001",
    message: "GAME_LIFECYCLE_VERSION_CONFLICT",
  });
  const conflictResult = await handleGameLifecycleOperation(conflict, input(
    request("POST", "/games/x/lifecycle/end", {
      idempotencyKey: "life.end.1",
      expectedVersion: 2,
    }),
    "/lifecycle/end",
  ));
  assertEquals(conflictResult.status, 409);
  assertEquals((conflictResult.body as any).error.retryable, true);
});

function input(requestValue: Request, suffix: string) {
  return {
    request: requestValue,
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix,
  };
}

function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function readRow(overrides: Record<string, unknown> = {}) {
  return {
    lifecycle_state: "active",
    operational_status: "active",
    lifecycle_version: 4,
    join_code_status: "active",
    active_player_sessions: 3,
    allowed_actions: ["pause", "end", "revoke_sessions"],
    started_at: NOW,
    paused_at: null,
    resumed_at: null,
    ended_at: null,
    archived_at: null,
    updated_at: NOW,
    ...overrides,
  };
}

function transitionRow(overrides: Record<string, unknown> = {}) {
  return {
    transition_outcome: "applied",
    transition_action: "revoke_sessions",
    previous_state: "active",
    sessions_revoked: 0,
    ...readRow(),
    ...overrides,
  };
}

function fixtureService(
  data: readonly Record<string, unknown>[],
  error: { code?: string; message: string } | null = null,
) {
  const calls: Array<{ name: string; args: unknown }> = [];
  return {
    calls,
    rpc<T>(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve({ data: data as unknown as T, error });
    },
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`);
  }
}
