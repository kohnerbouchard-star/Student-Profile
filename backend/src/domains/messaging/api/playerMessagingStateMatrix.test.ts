import { handlePlayerMessageThreadLifecycleRequest } from "./playerMessageThreadLifecycleHttpHandler.ts";
import { handlePlayerMessagingRequest } from "./playerMessagingHttpHandler.ts";

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const THREAD = `thr_${"a".repeat(32)}`;
const NOW = new Date("2026-07-21T04:00:00.000Z");

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Messaging fails closed before RPC for expired sessions and paused or ended games", async () => {
  const cases = [
    {
      expectedCode: "player_session_expired",
      resolution: activeResolution({ expiresAt: "2026-07-21T03:59:59.000Z" }),
      invoke: (deps: ReturnType<typeof dependencies>) =>
        handlePlayerMessagingRequest(
          request("/players/me/messages"),
          { kind: "list" },
          deps as never,
        ),
    },
    {
      expectedCode: "invalid_player_session_scope",
      resolution: activeResolution({ gameStatus: "paused" }),
      invoke: (deps: ReturnType<typeof dependencies>) =>
        handlePlayerMessageThreadLifecycleRequest(
          request("/players/me/messages/policy"),
          { kind: "policy" },
          deps as never,
        ),
    },
    {
      expectedCode: "invalid_player_session_scope",
      resolution: activeResolution({ gameStatus: "ended" }),
      invoke: (deps: ReturnType<typeof dependencies>) =>
        handlePlayerMessageThreadLifecycleRequest(
          request("/players/me/messages/threads", {
            method: "POST",
            body: createThreadBody("ended-game:1"),
          }),
          { kind: "createThread" },
          deps as never,
        ),
    },
  ] as const;

  for (const testCase of cases) {
    const calls: string[] = [];
    const response = await testCase.invoke(dependencies({ resolution: testCase.resolution, calls }));
    assertEquals(response.status, 401);
    const body = await response.json();
    assertEquals(body.error.code, testCase.expectedCode);
    assertEquals(calls.length, 0);
    assertNoUuid(JSON.stringify(body));
  }
});

Deno.test("Messaging maps race-to-inactive and locked write states without leaking scope", async () => {
  const createInactive = await handlePlayerMessageThreadLifecycleRequest(
    request("/players/me/messages/threads", {
      method: "POST",
      body: createThreadBody("inactive-create:1"),
    }),
    { kind: "createThread" },
    dependencies({ rpcError: { code: "P0001", message: "PLAYER_MESSAGE_GAME_NOT_ACTIVE" } }) as never,
  );
  assertError(createInactive, 409, "game_not_active");

  const createDisabled = await handlePlayerMessageThreadLifecycleRequest(
    request("/players/me/messages/threads", {
      method: "POST",
      body: createThreadBody("threads-disabled:1"),
    }),
    { kind: "createThread" },
    dependencies({ rpcError: { code: "P0001", message: "PLAYER_MESSAGE_THREADS_DISABLED" } }) as never,
  );
  assertError(createDisabled, 423, "player_message_threads_disabled");

  for (const message of [
    "PLAYER_MESSAGE_GAME_NOT_ACTIVE",
    "PLAYER_MESSAGE_THREAD_DISABLED",
    "PLAYER_MESSAGE_REPLIES_DISABLED",
  ]) {
    const response = await handlePlayerMessagingRequest(
      request(`/players/me/messages/threads/${THREAD}/messages`, {
        method: "POST",
        body: { body: "State transition race.", idempotencyKey: `send:${message}` },
      }),
      { kind: "send", threadId: THREAD },
      dependencies({ rpcError: { code: "P0001", message } }) as never,
    );
    assertError(
      response,
      message === "PLAYER_MESSAGE_GAME_NOT_ACTIVE" ? 409 : 423,
      message === "PLAYER_MESSAGE_GAME_NOT_ACTIVE" ? "game_not_active" : "player_message_thread_locked",
    );
  }
});

Deno.test("Messaging rejects wrong-participant receipts and inconsistent unread totals", async () => {
  const deniedReceipt = await handlePlayerMessagingRequest(
    request(`/players/me/messages/threads/${THREAD}/read`, { method: "POST", body: {} }),
    { kind: "markRead", threadId: THREAD },
    dependencies({ rpcError: { code: "P0001", message: "PLAYER_MESSAGE_THREAD_NOT_FOUND" } }) as never,
  );
  assertError(deniedReceipt, 404, "player_message_thread_not_found");

  const inconsistent = await handlePlayerMessagingRequest(
    request("/players/me/messages"),
    { kind: "list" },
    dependencies({
      responses: {
        read_player_messages_v1: {
          unreadCount: 2,
          threads: [{
            id: THREAD,
            type: "player",
            title: "Unread mismatch",
            contractKey: null,
            status: "active",
            allowPlayerReplies: true,
            participantCount: 2,
            unreadCount: 1,
            updatedAt: NOW.toISOString(),
            retentionUntil: "2027-07-21T04:00:00.000Z",
            messages: [],
          }],
        },
      },
    }) as never,
  );
  assertError(inconsistent, 500, "player_messaging_failed");
});

Deno.test("Messaging abuse bounds reject line and link floods before RPC", async () => {
  for (const body of [
    Array.from({ length: 51 }, () => "line").join("\n"),
    Array.from({ length: 11 }, (_, index) => `https://example.test/${index}`).join(" "),
  ]) {
    const calls: string[] = [];
    const response = await handlePlayerMessagingRequest(
      request(`/players/me/messages/threads/${THREAD}/messages`, {
        method: "POST",
        body: { body, idempotencyKey: "abuse-bound:1" },
      }),
      { kind: "send", threadId: THREAD },
      dependencies({ calls }) as never,
    );
    assertError(response, 400, "invalid_player_message_request");
    assertEquals(calls.length, 0);
  }
});

function dependencies(options: {
  readonly responses?: Record<string, unknown>;
  readonly rpcError?: { readonly code?: string; readonly message: string } | null;
  readonly resolution?: ReturnType<typeof activeResolution>;
  readonly calls?: string[];
} = {}) {
  const responses = options.responses ?? {};
  const calls = options.calls ?? [];
  return {
    createServiceClient: () => ({
      rpc: (name: string) => {
        calls.push(name);
        return Promise.resolve({
          data: Object.hasOwn(responses, name) ? responses[name] : null,
          error: options.rpcError ?? null,
        });
      },
    }),
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost:54321",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(options.resolution ?? activeResolution()),
    now: () => NOW,
  };
}

function activeResolution(overrides: {
  readonly expiresAt?: string;
  readonly gameStatus?: string;
} = {}) {
  return {
    ok: true as const,
    session: {
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: overrides.expiresAt ?? "2026-07-22T04:00:00.000Z",
      revoked_at: null,
    },
    gameSession: {
      id: GAME,
      name: "Game",
      owner_staff_user_id: "00000000-0000-4000-8000-000000000031",
      status: overrides.gameStatus ?? "active",
    },
    player: {
      id: PLAYER,
      game_session_id: GAME,
      display_name: "Player One",
      roster_label: null,
      player_identifier: "PLAYER-001",
      status: "active",
    },
  };
}

function createThreadBody(idempotencyKey: string) {
  return {
    recipientPlayerId: "PLAYER-002",
    title: "State matrix",
    body: "State transition coverage.",
    idempotencyKey,
  };
}

function request(path: string, options: {
  readonly method?: string;
  readonly body?: unknown;
} = {}): Request {
  const headers = new Headers({ "x-player-session-token": "player-token" });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://example.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function assertError(response: Response, status: number, code: string): Promise<void> {
  assertEquals(response.status, status);
  const body = await response.json();
  assertEquals(body.error.code, code);
  assertNoUuid(JSON.stringify(body));
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
