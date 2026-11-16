import { handlePlayerMessagingRequest } from "./playerMessagingHttpHandler.ts";
import type { PlayerMessagingHttpHandlerDependencies } from "./playerMessagingHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const OTHER = "00000000-0000-4000-8000-000000000099";
const THREAD = `thr_${"a".repeat(32)}`;
const NOW = new Date("2026-07-20T04:00:00.000Z");
const EMPTY = {
  unreadCount: 0,
  pageUnreadCount: 0,
  nextCursor: null,
  threads: [],
};
type Resolution = Awaited<
  ReturnType<
    NonNullable<PlayerMessagingHttpHandlerDependencies["resolvePlayerSession"]>
  >
>;

for (
  const [name, kind, suffix, args, query] of [
    ["list defaults", "list", "", [25, 50, null, null, null], null],
    [
      "list limits and timestamp cursor",
      "list",
      `?threadLimit=1&messageLimit=1&cursor=${
        encodeURIComponent(`2026-07-20T06:00:00+02:00|${THREAD}`)
      }`,
      [1, 1, null, NOW.toISOString(), THREAD],
      null,
    ],
    [
      "search trim and upper limits",
      "search",
      "?q=%20Market%20&threadLimit=50&messageLimit=100",
      [50, 100, "Market", null, null],
      "Market",
    ],
    [
      "search cursor",
      "search",
      `?q=market&threadLimit=10&messageLimit=20&cursor=${
        encodeURIComponent(`${NOW.toISOString()}|${THREAD}`)
      }`,
      [10, 20, "market", NOW.toISOString(), THREAD],
      "market",
    ],
    [
      "existing numeric input form",
      "list",
      "?threadLimit=0x10&messageLimit=1e1",
      [16, 10, null, null, null],
      null,
    ],
  ] as const
) {
  Deno.test(`Inbox read preserves ${name}, exact RPC scope and private projection`, async () => {
    const fixture = dependencies({ ...EMPTY, privateField: PLAYER });
    const response = await handlePlayerMessagingRequest(request(kind, suffix), {
      kind,
    }, fixture.value);
    equal(fixture.trace, [
      "env",
      "client",
      "now",
      "hash:player-token",
      "session:hashed-token",
      "rpc",
    ]);
    equal(fixture.calls, [{
      name: "read_player_messages_v2",
      args: {
        p_game_session_id: GAME,
        p_player_id: PLAYER,
        p_thread_limit: args[0],
        p_message_limit: args[1],
        p_query: args[2],
        p_before_updated_at: args[3],
        p_before_thread_public_id: args[4],
      },
    }]);
    equal(response.status, 200);
    equal(response.headers.get("cache-control"), "private, no-store");
    equal(response.headers.get("pragma"), "no-cache");
    equal(
      response.headers.get("vary"),
      "authorization, x-player-session-token",
    );
    const inbox = { unread: 0, pageUnread: 0, nextCursor: "", threads: [] };
    equal(await response.json(), {
      ok: true,
      data: query === null ? inbox : { query, ...inbox },
    });
  });
}

for (
  const [kind, suffix] of [
    ["list", "?q=not-allowed"],
    ["list", "?threadLimit=0"],
    ["list", "?threadLimit=51"],
    ["list", "?messageLimit=101"],
    ["list", "?messageLimit=1&messageLimit=2"],
    ["list", "?cursor=invalid"],
    ["search", ""],
    ["search", "?q=%20%20"],
    ["search", "?q=javascript%3Aalert(1)"],
    ["search", "?q=a&q=b"],
    ["search", `?q=${"a".repeat(101)}`],
  ] as const
) {
  Deno.test(`Inbox parser rejection ${kind}${suffix} runs no RPC after authentication`, async () => {
    const fixture = dependencies(EMPTY);
    const response = await handlePlayerMessagingRequest(request(kind, suffix), {
      kind,
    }, fixture.value);
    equal(response.status, 400);
    equal((await response.json()).error.code, "invalid_player_message_request");
    equal(fixture.trace, [
      "env",
      "client",
      "now",
      "hash:player-token",
      "session:hashed-token",
    ]);
    equal(fixture.calls, []);
  });
}

for (
  const [name, data] of [
    ["null", null],
    ["array", []],
    ["missing rows", { ...EMPTY, threads: null }],
    ["inconsistent unread", { ...EMPTY, pageUnreadCount: 1 }],
    ["bad cursor", { ...EMPTY, nextCursor: "invalid" }],
  ] as const
) {
  Deno.test(`Inbox read preserves fail-closed projection for ${name}`, async () => {
    const fixture = dependencies(data);
    const response = await handlePlayerMessagingRequest(request(), {
      kind: "list",
    }, fixture.value);
    equal(response.status, 500);
    equal((await response.json()).error.code, "player_messaging_failed");
    equal(fixture.calls.length, 1);
  });
}

for (
  const [error, status, code] of [
    [
      { code: "42P01", message: "private detail" },
      503,
      "player_messaging_schema_not_applied",
    ],
    [{ message: "schema cache" }, 503, "player_messaging_schema_not_applied"],
    [
      { message: "PLAYER_MESSAGES_SCOPE_FORBIDDEN" },
      404,
      "player_message_thread_not_found",
    ],
    [
      { message: "PLAYER_MESSAGE_IDEMPOTENCY_CONFLICT" },
      409,
      "player_message_idempotency_conflict",
    ],
    [{ message: "PLAYER_MESSAGE_GAME_NOT_ACTIVE" }, 409, "game_not_active"],
    [
      { message: "PLAYER_MESSAGE_THREAD_DISABLED" },
      423,
      "player_message_thread_locked",
    ],
    [{ message: "VALUE_INVALID" }, 400, "invalid_player_message_request"],
    [{ message: "private detail" }, 500, "player_messaging_failed"],
  ] as const
) {
  Deno.test(`Inbox read preserves safe RPC error ${code}/${status}/${error.message}`, async () => {
    const fixture = dependencies(null, error);
    const response = await handlePlayerMessagingRequest(request(), {
      kind: "list",
    }, fixture.value);
    equal(response.status, status);
    const body = await response.json();
    equal(body.error.code, code);
    equal(body.error.retryable, status === 503);
    equal(JSON.stringify(body).includes("private detail"), false);
    equal(fixture.calls.length, 1);
  });
}

for (
  const [name, options, status] of [
    ["method", { method: "POST" }, 405],
    ["runner secret", {
      headers: { "x-stock-market-runner-secret": "invalid" },
    }, 400],
    ["missing session", { token: null }, 401],
    ["player injection", { headers: { "x-player-id": OTHER } }, 400],
    ["wrong game", { headers: { "x-econovaria-game-id": OTHER } }, 401],
  ] as const
) {
  Deno.test(`Inbox read rejects ${name} without persistence`, async () => {
    const fixture = dependencies(EMPTY);
    const response = await handlePlayerMessagingRequest(
      request("list", "", options),
      { kind: "list" },
      fixture.value,
    );
    equal(response.status, status);
    equal(fixture.calls, []);
  });
}

for (
  const [name, mutate] of [
    ["expired", (r: ReturnType<typeof active>) => {
      r.session.expires_at = "2026-07-19T00:00:00.000Z";
    }],
    ["revoked", (r: ReturnType<typeof active>) => {
      r.session.revoked_at = NOW.toISOString();
    }],
    ["wrong resolved game", (r: ReturnType<typeof active>) => {
      r.gameSession.id = OTHER;
    }],
    ["wrong resolved player", (r: ReturnType<typeof active>) => {
      r.player.id = OTHER;
    }],
  ] as const
) {
  Deno.test(`Inbox read rejects ${name} session without persistence`, async () => {
    const resolution = active();
    mutate(resolution);
    const fixture = dependencies(EMPTY, null, resolution);
    equal(
      (await handlePlayerMessagingRequest(
        request(),
        { kind: "list" },
        fixture.value,
      )).status,
      401,
    );
    equal(fixture.calls, []);
  });
}

Deno.test("Inbox extraction preserves exact-thread read RPC and private result", async () => {
  const fixture = dependencies({
    id: THREAD,
    type: "player",
    title: "Thread",
    status: "active",
    participantCount: 2,
    unreadCount: 0,
    updatedAt: NOW.toISOString(),
    retentionUntil: "2027-07-20T04:00:00.000Z",
    messages: [],
  });
  const response = await handlePlayerMessagingRequest(
    new Request(
      `https://example.test/players/me/messages/threads/${THREAD}?messageLimit=25`,
      { headers: { "x-player-session-token": "player-token" } },
    ),
    { kind: "thread", threadId: THREAD },
    fixture.value,
  );
  equal(response.status, 200);
  equal((await response.json()).data.thread.id, THREAD);
  equal(fixture.calls, [{
    name: "read_player_message_thread_v1",
    args: {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_thread_public_id: THREAD,
      p_message_limit: 25,
    },
  }]);
});

Deno.test("Inbox read preserves thrown RPC failure and exactly one attempt", async () => {
  const fixture = dependencies(EMPTY);
  let attempts = 0;
  fixture.value.createServiceClient = () =>
    ({
      rpc() {
        attempts++;
        throw new Error("private detail");
      },
    }) as never;
  const response = await handlePlayerMessagingRequest(request(), {
    kind: "list",
  }, fixture.value);
  equal(response.status, 500);
  equal((await response.json()).error.code, "player_messaging_failed");
  equal(attempts, 1);
});

function dependencies(
  data: unknown,
  error: { code?: string; message: string } | null = null,
  resolution: Resolution = active(),
) {
  const trace: string[] = [];
  const calls: unknown[] = [];
  const value = {
    createServiceClient: () => {
      trace.push("client");
      return {
        rpc: (name: string, args: unknown) => {
          trace.push("rpc");
          calls.push({ name, args });
          return Promise.resolve({ data, error });
        },
      } as never;
    },
    readSupabaseEnv: () => {
      trace.push("env");
      return {
        ok: true as const,
        value: {
          supabaseUrl: "http://localhost:54321",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "service",
        },
      };
    },
    hashSessionToken: (token: string) => {
      trace.push(`hash:${token}`);
      return Promise.resolve("hashed-token");
    },
    resolvePlayerSession: (_client: unknown, token: string) => {
      trace.push(`session:${token}`);
      return Promise.resolve(resolution);
    },
    now: () => {
      trace.push("now");
      return NOW;
    },
  };
  return { value, trace, calls };
}
function active() {
  return {
    ok: true as const,
    session: {
      id: "00000000-0000-4000-8000-000000000011",
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: "2026-07-21T00:00:00.000Z",
      revoked_at: null as string | null,
    },
    gameSession: {
      id: GAME,
      name: "Game",
      owner_staff_user_id: OTHER,
      status: "active",
    },
    player: {
      id: PLAYER,
      game_session_id: GAME,
      display_name: "Player",
      roster_label: null,
      player_identifier: "PLAYER-001",
      status: "active",
    },
  };
}
function request(
  kind: "list" | "search" = "list",
  suffix = "",
  options: {
    method?: string;
    token?: string | null;
    headers?: Readonly<Record<string, string>>;
  } = {},
) {
  const headers = new Headers(options.headers);
  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }
  return new Request(
    `https://example.test/players/me/messages${
      kind === "search" ? "/search" : ""
    }${suffix}`,
    { method: options.method ?? "GET", headers },
  );
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`,
    );
  }
}
