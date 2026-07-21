import { handleMessagingOperation } from "./messagingOperations.ts";
import {
  guardStaffMessagingRateLimit,
  readStaffMessagingRateLimitOperation,
} from "../../../src/security/staffMessagingRateLimitDispatch.ts";

const GAME = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";
const THREAD = `thr_${"a".repeat(32)}`;
const MESSAGE = `msg_${"b".repeat(32)}`;
const ACTION = `mda_${"c".repeat(32)}`;
const NOW = "2026-07-21T01:00:00.000Z";

Deno.test("Admin Messaging search remains public-ID only and bounded", async () => {
  const service = new FakeService({
    threads: [thread("Market coordination"), thread("Attendance notice")],
  });
  const result = await operation(service, {
    method: "GET",
    query: "q=market&limit=10&offset=0&status=all",
  });
  assertEquals(result.status, 200);
  assertEquals(service.calls[0].args.p_limit, 51);
  const data = (result.body as { data: { threads: unknown[]; filters: { query: string } } }).data;
  assertEquals(data.threads.length, 1);
  assertEquals(data.filters.query, "market");
  assertNoUuid(JSON.stringify(result.body));
});

Deno.test("Admin Messaging rejects participant overflow and unsafe URI schemes", async () => {
  const service = new FakeService(null);
  const overflow = await operation(service, {
    method: "POST",
    suffix: "/messages/threads",
    body: {
      type: "player",
      title: "Large thread",
      playerIds: Array.from({ length: 501 }, (_, index) => `PLAYER-${index}`),
      targetAllPlayers: false,
      allowPlayerReplies: true,
      idempotencyKey: "overflow:1",
    },
  });
  assertEquals(overflow.status, 400);

  const unsafe = await operation(service, {
    method: "POST",
    suffix: "/messages/threads",
    body: {
      type: "announcement",
      title: "Unsafe",
      playerIds: [],
      targetAllPlayers: true,
      allowPlayerReplies: false,
      body: "Open javascript:alert(1)",
      idempotencyKey: "unsafe:1",
    },
  });
  assertEquals(unsafe.status, 400);
  assertEquals(service.calls.length, 0);
});

Deno.test("Admin Messaging retains HTML-shaped text as inert content", async () => {
  const service = new FakeService([{
    create_outcome: "applied",
    thread_id: THREAD,
    created_thread_type: "announcement",
    thread_title: "Markup test",
    thread_status: "active",
    participant_count: 1,
    created_at: NOW,
  }]);
  const result = await operation(service, {
    method: "POST",
    suffix: "/messages/threads",
    body: {
      type: "announcement",
      title: "Markup test",
      playerIds: [],
      targetAllPlayers: true,
      allowPlayerReplies: false,
      body: "<script>alert('text only')</script>",
      idempotencyKey: "markup:1",
    },
  });
  assertEquals(result.status, 201);
  assertEquals(
    service.calls[0].args.p_initial_body,
    "<script>alert('text only')</script>",
  );
});

Deno.test("expired-thread deletion is typed, replay-safe, and UUID-private", async () => {
  const service = new FakeService([{
    deletion_outcome: "replayed",
    action_id: ACTION,
    thread_id: THREAD,
    deleted_message_count: 7,
    created_at: NOW,
  }]);
  const result = await operation(service, {
    method: "POST",
    suffix: `/messages/threads/${THREAD}/delete`,
    body: {
      reason: "Retention expired.",
      idempotencyKey: "retention:delete:1",
    },
  });
  assertEquals(result.status, 200);
  assertEquals(service.calls[0], {
    name: "delete_expired_admin_message_thread_atomic_v1",
    args: {
      p_game_session_id: GAME,
      p_staff_user_id: STAFF,
      p_thread_public_id: THREAD,
      p_reason: "Retention expired.",
      p_idempotency_key: "retention:delete:1",
    },
  });
  assertNoUuid(JSON.stringify(result.body));
});

Deno.test("staff Messaging rate limits use distinct central actions and fail closed", async () => {
  for (const [method, suffix, query, action] of [
    ["GET", "/messages", "", "staff.messages.read"],
    ["GET", "/messages", "q=market", "staff.messages.search"],
    ["POST", "/messages/threads", "", "staff.messages.create"],
    ["POST", `/messages/threads/${THREAD}/disable`, "", "staff.messages.moderate"],
    ["POST", `/messages/threads/${THREAD}/messages/${MESSAGE}/hide`, "", "staff.messages.moderate"],
    ["POST", `/messages/threads/${THREAD}/delete`, "", "staff.messages.retention.delete"],
  ] as const) {
    const request = new Request(`https://example.test/games/${GAME}${suffix}${query ? `?${query}` : ""}`, { method });
    assertEquals(
      readStaffMessagingRateLimitOperation({ request, suffix })?.action,
      action,
    );
  }

  const denied = await guardStaffMessagingRateLimit(
    {} as never,
    {
      request: new Request(`https://example.test/games/${GAME}/messages`, { method: "GET" }),
      gameId: GAME,
      staffUserId: STAFF,
      suffix: "/messages",
    },
    {
      enforce: () => Promise.resolve({
        allowed: false,
        retryAfterSeconds: 9,
        limitingDimension: "action",
        limit: 10,
        remaining: 0,
        resetAt: NOW,
      }),
    },
  );
  assertEquals(denied?.status, 429);
  assertEquals((denied?.body as { retryAfterSeconds: number }).retryAfterSeconds, 9);
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
}) {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return handleMessagingOperation(service, {
    request: new Request(
      `https://example.test/games/${GAME}${options.suffix ?? "/messages"}${options.query ? `?${options.query}` : ""}`,
      {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      },
    ),
    gameId: GAME,
    staffUserId: STAFF,
    suffix: options.suffix ?? "/messages",
  });
}

function thread(title: string) {
  return {
    id: THREAD,
    type: "player",
    title,
    contractKey: null,
    allowPlayerReplies: true,
    status: "active",
    moderationReason: null,
    retentionUntil: "2027-07-21T00:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
    participants: [{ reference: "PLAYER-001", displayName: "Student", rosterLabel: null, lastReadAt: null }],
    messages: [{ id: MESSAGE, senderType: "player", senderName: "Student", body: "Market ready.", hidden: false, hiddenReason: null, createdAt: NOW }],
  };
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
