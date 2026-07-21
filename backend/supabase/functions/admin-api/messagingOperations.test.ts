import { handleMessagingOperation } from "./messagingOperations.ts";

const GAME = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";
const THREAD = `thr_${"a".repeat(32)}`;
const MESSAGE = `msg_${"b".repeat(32)}`;
const ACTION = `mda_${"c".repeat(32)}`;
const NOW = "2026-07-20T04:00:00.000Z";

Deno.test("admin messaging reads UUID-private threads with bounded pagination", async () => {
  const service = new FakeService({
    threads: [thread()],
    returned: 1,
  });
  const result = await operation(service, { method: "GET" });
  assertEquals(result.status, 200);
  assertEquals(service.calls[0], {
    name: "read_admin_message_threads_v1",
    args: {
      p_game_session_id: GAME,
      p_staff_user_id: STAFF,
      p_status: null,
      p_limit: 26,
      p_offset: 0,
    },
  });
  assertNoUuid(JSON.stringify(result.body));
  const data = (result.body as { data: { threads: Array<{ id: string }> } }).data;
  assertEquals(data.threads[0].id, THREAD);
});

Deno.test("admin messaging creates typed threads with public Player IDs and replay-safe commands", async () => {
  const service = new FakeService([{
    create_outcome: "applied",
    thread_id: THREAD,
    created_thread_type: "contract",
    thread_title: "Contract review",
    thread_status: "active",
    participant_count: 2,
    created_at: NOW,
  }]);
  const result = await operation(service, {
    method: "POST",
    suffix: "/messages/threads",
    body: {
      type: "contract",
      title: "Contract review",
      contractKey: "arrival-orientation",
      allowPlayerReplies: true,
      playerIds: ["PLAYER-001", "PLAYER-002"],
      targetAllPlayers: false,
      body: "Submit your evidence here.",
      retentionUntil: "2027-07-20T00:00:00.000Z",
      idempotencyKey: "message-create:001",
    },
  });
  assertEquals(result.status, 201);
  assertEquals(service.calls[0], {
    name: "create_admin_message_thread_atomic_v1",
    args: {
      p_game_session_id: GAME,
      p_staff_user_id: STAFF,
      p_thread_type: "contract",
      p_title: "Contract review",
      p_contract_key: "arrival-orientation",
      p_allow_player_replies: true,
      p_player_identifiers: ["PLAYER-001", "PLAYER-002"],
      p_target_all_players: false,
      p_initial_body: "Submit your evidence here.",
      p_retention_until: "2027-07-20T00:00:00.000Z",
      p_idempotency_key: "message-create:001",
    },
  });
  assertNoUuid(JSON.stringify(result.body));
});

Deno.test("admin messaging moderates threads and messages through one atomic audited RPC", async () => {
  for (const scenario of [
    { suffix: `/messages/threads/${THREAD}/disable`, action: "disable_thread", messageId: null, reason: "Abuse report." },
    { suffix: `/messages/threads/${THREAD}/enable`, action: "enable_thread", messageId: null, reason: "" },
    { suffix: `/messages/threads/${THREAD}/close`, action: "close_thread", messageId: null, reason: "Conversation complete." },
    { suffix: `/messages/threads/${THREAD}/messages/${MESSAGE}/hide`, action: "hide_message", messageId: MESSAGE, reason: "Inappropriate content." },
    { suffix: `/messages/threads/${THREAD}/messages/${MESSAGE}/unhide`, action: "unhide_message", messageId: MESSAGE, reason: "" },
  ]) {
    const service = new FakeService([{
      moderation_outcome: "applied",
      action_id: ACTION,
      thread_id: THREAD,
      message_id: scenario.messageId,
      moderation_action: scenario.action,
      thread_status: scenario.action === "disable_thread" ? "disabled" : scenario.action === "close_thread" ? "closed" : "active",
      message_hidden: scenario.action === "hide_message",
      created_at: NOW,
    }]);
    const result = await operation(service, {
      method: "POST",
      suffix: scenario.suffix,
      body: {
        reason: scenario.reason,
        idempotencyKey: `${scenario.action}:001`,
      },
    });
    assertEquals(result.status, 200);
    assertEquals(service.calls[0].name, "moderate_admin_message_atomic_v1");
    assertEquals(service.calls[0].args.p_thread_public_id, THREAD);
    assertEquals(service.calls[0].args.p_message_public_id, scenario.messageId);
    assertEquals(service.calls[0].args.p_action, scenario.action);
    assertNoUuid(JSON.stringify(result.body));
  }
});

Deno.test("admin messaging rejects unsafe targeting, methods, paths, and idempotency before RPC", async () => {
  const service = new FakeService(null);
  for (const options of [
    { method: "POST", suffix: "/messages", body: {} },
    { method: "GET", suffix: "/messages/threads" },
    { method: "GET", query: "status=unknown" },
    { method: "GET", query: "limit=51" },
    { method: "GET", query: "status=all&status=active" },
    {
      method: "POST",
      suffix: "/messages/threads",
      body: { type: "announcement", title: "Notice", playerIds: [], targetAllPlayers: false, idempotencyKey: "create:001" },
    },
    {
      method: "POST",
      suffix: `/messages/threads/${THREAD}/disable`,
      body: { reason: "", idempotencyKey: "disable:001" },
    },
    {
      method: "POST",
      suffix: `/messages/threads/${THREAD}/enable`,
      headers: { "x-idempotency-key": "header:001" },
      body: { idempotencyKey: "body:001" },
    },
  ]) {
    const result = await operation(service, options as never);
    assert(result.handled === true);
    assert([400, 405].includes(result.status ?? 0));
  }
  assertEquals(service.calls.length, 0);
});

Deno.test("admin messaging leaves unrelated routes untouched and maps schema or scope failures", async () => {
  const unrelated = await operation(new FakeService(null), { method: "GET", suffix: "/players" });
  assertEquals(unrelated, { handled: false });

  for (const [message, status, code] of [
    ["ADMIN_MESSAGES_SCOPE_FORBIDDEN", 404, "message_thread_not_found"],
    ["ADMIN_MESSAGE_THREAD_NOT_FOUND", 404, "message_thread_not_found"],
    ["ADMIN_MESSAGE_IDEMPOTENCY_CONFLICT", 409, "message_idempotency_conflict"],
    ["function does not exist", 503, "messaging_schema_not_applied"],
  ] as const) {
    const service = new FakeService(null, { message });
    const result = await operation(service, {
      method: "POST",
      suffix: `/messages/threads/${THREAD}/enable`,
      body: { idempotencyKey: "enable:001" },
    });
    assertEquals(result.status, status);
    assertEquals((result.body as { code: string }).code, code);
  }
});

class FakeService {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  constructor(
    private readonly data: unknown,
    private readonly error: { readonly message: string; readonly code?: string } | null = null,
  ) {}
  rpc<T>(name: string, args: unknown): Promise<{ data: T | null; error: typeof this.error }> {
    this.calls.push({ name, args: args as Record<string, unknown> });
    return Promise.resolve({ data: this.data as T | null, error: this.error });
  }
}

function operation(service: FakeService, options: {
  readonly method?: string;
  readonly suffix?: string;
  readonly query?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}) {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return handleMessagingOperation(service, {
    request: new Request(`https://example.test/games/${GAME}${options.suffix ?? "/messages"}${options.query ? `?${options.query}` : ""}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    gameId: GAME,
    staffUserId: STAFF,
    suffix: options.suffix ?? "/messages",
  });
}

function thread() {
  return {
    id: THREAD,
    type: "player",
    title: "Trade coordination",
    contractKey: null,
    allowPlayerReplies: true,
    status: "active",
    moderationReason: null,
    retentionUntil: "2027-07-20T00:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
    participants: [{ reference: "PLAYER-001", displayName: "Student", rosterLabel: null, lastReadAt: null }],
    messages: [{ id: MESSAGE, senderType: "player", senderName: "Student", body: "Ready.", hidden: false, hiddenReason: null, createdAt: NOW }],
  };
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}
function assert(value: boolean): void {
  if (!value) throw new Error("Assertion failed");
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
