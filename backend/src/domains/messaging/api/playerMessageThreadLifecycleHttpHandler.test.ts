import { handlePlayerMessageThreadLifecycleRequest } from "./playerMessageThreadLifecycleHttpHandler.ts";

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const THREAD = `thr_${"a".repeat(32)}`;
const MESSAGE = `msg_${"b".repeat(32)}`;
const NOW = new Date("2026-07-21T03:00:00.000Z");

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Player Messaging policy remains private and attachments disabled", async () => {
  const response = await handlePlayerMessageThreadLifecycleRequest(
    request("/players/me/messages/policy"),
    { kind: "policy" },
    dependencies({
      read_player_message_policy_v1: {
        playerThreadsEnabled: true,
        maxParticipants: 2,
        defaultRetentionDays: 365,
        attachmentsEnabled: false,
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(response.headers.get("pragma"), "no-cache");
  const body = await response.json();
  assertEquals(body.data.policy.attachmentsEnabled, false);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("Player thread creation preserves applied and replayed public results", async () => {
  for (const [outcome, expectedStatus] of [["applied", 201], ["replayed", 200]] as const) {
    const response = await handlePlayerMessageThreadLifecycleRequest(
      request("/players/me/messages/threads", {
        method: "POST",
        body: {
          recipientPlayerId: "PLAYER-002",
          title: "Trade coordination",
          body: "Can we coordinate after class?",
          idempotencyKey: "message-thread:1",
        },
      }),
      { kind: "createThread" },
      dependencies({
        create_player_message_thread_atomic_v1: [{
          create_outcome: outcome,
          thread_id: THREAD,
          message_id: MESSAGE,
          thread_title: "Trade coordination",
          recipient_reference: "PLAYER-002",
          created_at: NOW.toISOString(),
        }],
      }),
    );
    assertEquals(response.status, expectedStatus);
    const body = await response.json();
    assertEquals(body.data.outcome, outcome);
    assertEquals(body.data.threadId, THREAD);
    assertEquals(body.data.messageId, MESSAGE);
    assertNoUuid(JSON.stringify(body));
  }
});

Deno.test("Player thread creation rejects UUID ownership injection, attachments, and unsafe payloads", async () => {
  for (const body of [
    {
      recipientPlayerId: PLAYER,
      title: "Invalid",
      body: "No UUID recipients.",
      idempotencyKey: "message-thread:2",
    },
    {
      recipientPlayerId: "PLAYER-002",
      title: "Invalid",
      body: "Hello",
      attachment: { name: "unsafe.exe" },
      idempotencyKey: "message-thread:3",
    },
    {
      recipientPlayerId: "PLAYER-002",
      title: "Invalid",
      body: "javascript:alert(1)",
      idempotencyKey: "message-thread:4",
    },
  ]) {
    const response = await handlePlayerMessageThreadLifecycleRequest(
      request("/players/me/messages/threads", { method: "POST", body }),
      { kind: "createThread" },
      dependencies({}),
    );
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error.code, "invalid_player_message_request");
  }
});

Deno.test("Player thread creation preserves session expiry and hides cross-game recipient detail", async () => {
  const expired = await handlePlayerMessageThreadLifecycleRequest(
    request("/players/me/messages/policy", { token: null }),
    { kind: "policy" },
    dependencies({}),
  );
  assertEquals(expired.status, 401);
  assertEquals((await expired.json()).error.code, "missing_player_session");

  const denied = await handlePlayerMessageThreadLifecycleRequest(
    request("/players/me/messages/threads", {
      method: "POST",
      body: {
        recipientPlayerId: "OTHER-GAME-PLAYER",
        title: "Cross game",
        body: "This must fail closed.",
        idempotencyKey: "message-thread:5",
      },
    }),
    { kind: "createThread" },
    dependencies({}, {
      code: "P0001",
      message: "PLAYER_MESSAGE_RECIPIENT_NOT_FOUND",
    }),
  );
  assertEquals(denied.status, 404);
  const deniedBody = await denied.json();
  assertEquals(deniedBody.error.code, "player_message_recipient_not_found");
  assertEquals(JSON.stringify(deniedBody).includes("OTHER-GAME-PLAYER"), false);
});

function dependencies(
  responses: Record<string, unknown>,
  rpcError: { readonly code?: string; readonly message: string } | null = null,
) {
  return {
    createServiceClient: () => ({
      rpc: (name: string) => Promise.resolve({
        data: Object.hasOwn(responses, name) ? responses[name] : null,
        error: rpcError,
      }),
    }) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost:54321",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(activeResolution()),
    now: () => NOW,
  };
}

function activeResolution() {
  return {
    ok: true as const,
    session: {
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: "2026-07-22T00:00:00.000Z",
      revoked_at: null,
    },
    gameSession: {
      id: GAME,
      name: "Game",
      owner_staff_user_id: "00000000-0000-4000-8000-000000000031",
      status: "active",
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

function request(path: string, options: {
  readonly token?: string | null;
  readonly method?: string;
  readonly body?: unknown;
} = {}): Request {
  const headers = new Headers();
  if (options.token !== null) headers.set("x-player-session-token", options.token ?? "player-token");
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://example.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
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
