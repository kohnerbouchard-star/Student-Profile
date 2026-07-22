import { handlePlayerMessagingRequest } from "./playerMessagingHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const THREAD = `thr_${"a".repeat(32)}`;
const THREAD_TWO = `thr_${"c".repeat(32)}`;
const MESSAGE = `msg_${"b".repeat(32)}`;
const MESSAGE_TWO = `msg_${"d".repeat(32)}`;
const NOW = new Date("2026-07-20T04:00:00.000Z");

Deno.test("player messaging handler returns UUID-private inbox data", async () => {
  const response = await handlePlayerMessagingRequest(
    request("/players/me/messages?threadLimit=20&messageLimit=40"),
    { kind: "list" },
    dependencies({
      read_player_messages_v1: {
        unreadCount: 1,
        threads: [{
          id: THREAD,
          type: "player",
          title: "Trade coordination",
          contractKey: null,
          status: "active",
          allowPlayerReplies: true,
          participantCount: 2,
          unreadCount: 1,
          updatedAt: NOW.toISOString(),
          retentionUntil: "2027-07-20T04:00:00.000Z",
          messages: [{
            id: MESSAGE,
            senderType: "staff_user",
            senderName: "Administrator",
            senderReference: null,
            body: "Coordinate before the market closes.",
            moderated: false,
            self: false,
            createdAt: NOW.toISOString(),
          }],
        }],
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(body.data.unread, 1);
  assertEquals(body.data.threads[0].id, THREAD);
  assertEquals(body.data.threads[0].messages[0].id, MESSAGE);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("player messaging search filters private results and rejects unsafe or repeated queries", async () => {
  const response = await handlePlayerMessagingRequest(
    request("/players/me/messages/search?q=attendance&threadLimit=10&messageLimit=20"),
    { kind: "search" },
    dependencies({
      read_player_messages_v1: {
        unreadCount: 3,
        threads: [
          {
            id: THREAD,
            type: "player",
            title: "Trade coordination",
            contractKey: null,
            status: "active",
            allowPlayerReplies: true,
            participantCount: 2,
            unreadCount: 1,
            updatedAt: NOW.toISOString(),
            retentionUntil: "2027-07-20T04:00:00.000Z",
            messages: [{
              id: MESSAGE,
              senderType: "player",
              senderName: "Player Two",
              senderReference: "PLAYER-002",
              body: "Ready for the market.",
              moderated: false,
              self: false,
              createdAt: NOW.toISOString(),
            }],
          },
          {
            id: THREAD_TWO,
            type: "announcement",
            title: "Attendance notice",
            contractKey: null,
            status: "active",
            allowPlayerReplies: false,
            participantCount: 1,
            unreadCount: 2,
            updatedAt: NOW.toISOString(),
            retentionUntil: "2027-07-20T04:00:00.000Z",
            messages: [{
              id: MESSAGE_TWO,
              senderType: "staff_user",
              senderName: "Administrator",
              senderReference: null,
              body: "Attendance has been posted.",
              moderated: false,
              self: false,
              createdAt: NOW.toISOString(),
            }],
          },
        ],
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assertEquals(body.data.query, "attendance");
  assertEquals(body.data.unread, 2);
  assertEquals(body.data.threads.length, 1);
  assertEquals(body.data.threads[0].id, THREAD_TWO);
  assertNoUuid(JSON.stringify(body));

  for (const path of [
    "/players/me/messages/search?q=javascript%3Aalert(1)",
    "/players/me/messages/search?q=attendance&q=market",
  ]) {
    const invalid = await handlePlayerMessagingRequest(
      request(path),
      { kind: "search" },
      dependencies({}),
    );
    assertEquals(invalid.status, 400);
    assertEquals((await invalid.json()).error.code, "invalid_player_message_request");
  }
});

Deno.test("player messaging handler preserves applied and replayed send outcomes", async () => {
  const applied = await handlePlayerMessagingRequest(
    request(`/players/me/messages/threads/${THREAD}/messages`, {
      method: "POST",
      body: { body: "Ready.", idempotencyKey: "message-send:1" },
    }),
    { kind: "send", threadId: THREAD },
    dependencies({
      send_player_message_atomic_v1: [{
        send_outcome: "applied",
        thread_id: THREAD,
        message_id: MESSAGE,
        sender_name: "Player One",
        message_body: "Ready.",
        created_at: NOW.toISOString(),
      }],
    }),
  );
  assertEquals(applied.status, 201);
  assertEquals((await applied.json()).data.outcome, "applied");

  const replayed = await handlePlayerMessagingRequest(
    request(`/players/me/messages/threads/${THREAD}/messages`, {
      method: "POST",
      body: { body: "Ready.", idempotencyKey: "message-send:1" },
    }),
    { kind: "send", threadId: THREAD },
    dependencies({
      send_player_message_atomic_v1: [{
        send_outcome: "replayed",
        thread_id: THREAD,
        message_id: MESSAGE,
        sender_name: "Player One",
        message_body: "Ready.",
        created_at: NOW.toISOString(),
      }],
    }),
  );
  assertEquals(replayed.status, 200);
  assertEquals((await replayed.json()).data.outcome, "replayed");
});

Deno.test("player messaging handler marks a public thread read", async () => {
  const response = await handlePlayerMessagingRequest(
    request(`/players/me/messages/threads/${THREAD}/read`, { method: "POST", body: {} }),
    { kind: "markRead", threadId: THREAD },
    dependencies({
      mark_player_message_thread_read_v1: [{
        thread_id: THREAD,
        read_at: NOW.toISOString(),
        unread_count: 0,
      }],
    }),
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.data.threadId, THREAD);
  assertEquals(body.data.unreadCount, 0);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("player messaging handler rejects missing sessions, identity injection, attachments, and invalid bodies", async () => {
  const missing = await handlePlayerMessagingRequest(
    request("/players/me/messages", { token: null }),
    { kind: "list" },
    dependencies({}),
  );
  assertEquals(missing.status, 401);
  assertEquals((await missing.json()).error.code, "missing_player_session");

  const injected = await handlePlayerMessagingRequest(
    request("/players/me/messages", { header: ["x-player-uuid", PLAYER] }),
    { kind: "list" },
    dependencies({}),
  );
  assertEquals(injected.status, 400);
  assertEquals((await injected.json()).error.code, "invalid_player_request");

  for (const body of [
    { body: "", idempotencyKey: "message-send:2" },
    {
      body: "Attachments stay disabled.",
      idempotencyKey: "message-send:3",
      attachment: { name: "blocked.txt" },
    },
  ]) {
    const invalid = await handlePlayerMessagingRequest(
      request(`/players/me/messages/threads/${THREAD}/messages`, {
        method: "POST",
        body,
      }),
      { kind: "send", threadId: THREAD },
      dependencies({}),
    );
    assertEquals(invalid.status, 400);
    assertEquals((await invalid.json()).error.code, "invalid_player_message_request");
  }
});

function dependencies(responses: Record<string, unknown>) {
  return {
    createServiceClient: () => ({
      rpc: (name: string) => Promise.resolve({
        data: Object.hasOwn(responses, name) ? responses[name] : null,
        error: null,
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
      expires_at: "2026-07-21T00:00:00.000Z",
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
  readonly header?: readonly [string, string];
} = {}): Request {
  const headers = new Headers();
  if (options.token !== null) headers.set("x-player-session-token", options.token ?? "player-token");
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.header) headers.set(options.header[0], options.header[1]);
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
