import { dispatchClassroomMessagingRequest as dispatchFromDomain } from "../domains/messaging/api/playerMessagingDispatch.ts";
import { dispatchClassroomMessagingRequest as dispatchFromClassroom } from "../../supabase/functions/classroom-api/messagingDispatch.ts";
import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestScope } from "../domains/players/api/playerRequestScope.ts";
import {
  dispatchRateLimitedReviewedPlayerRequest,
  type PlayerRateLimitDispatchDependencies,
  readReviewedPlayerRateLimitOperation,
} from "./playerRateLimitDispatch.ts";
import type { RateLimitDecision } from "./rateLimitContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const SESSION = "00000000-0000-4000-8000-000000000011";
const THREAD = `thr_${"a".repeat(32)}`;
const THREAD_ACTION = `player.messages.thr_${"a".repeat(24)}`;

Deno.test("Messaging operations have distinct central rate-limit actions", () => {
  const expected = {
    "messages:GET": ["player.messages.read", "read"],
    "messageThread:GET": ["player.messages.thread.read", "read"],
    "messagePolicy:GET": ["player.messages.policy.read", "read"],
    "messageSearch:GET": ["player.messages.search", "read"],
    "messageThreadCreate:POST": ["player.messages.thread.create", "sensitive"],
    "messageSend:POST": ["player.messages.send", "sensitive"],
    "messageRead:POST": ["player.messages.receipt", "write"],
  } as const;
  for (const [key, value] of Object.entries(expected)) {
    const [endpoint, method] = key.split(":");
    const operation = readReviewedPlayerRateLimitOperation(endpoint as never, method);
    assertEquals(operation && [operation.action, operation.profile], value);
  }
});

Deno.test("explicit Messaging endpoint keys derive bounded per-thread actions", async () => {
  const scenarios = [
    ["GET", "/players/me/messages", "messages", "player.messages.read"],
    ["GET", "/players/me/messages/policy", "messagePolicy", "player.messages.policy.read"],
    ["GET", "/players/me/messages/search?q=market", "messageSearch", "player.messages.search"],
    ["POST", "/players/me/messages/threads", "messageThreadCreate", "player.messages.thread.create"],
    ["GET", `/players/me/messages/threads/${THREAD}`, "messageThread", THREAD_ACTION],
    ["POST", `/players/me/messages/threads/${THREAD}/messages`, "messageSend", THREAD_ACTION],
    ["POST", `/players/me/messages/threads/${THREAD}/read`, "messageRead", THREAD_ACTION],
  ] as const;

  for (const [method, path, endpointKey, expectedAction] of scenarios) {
    let handlerCalls = 0;
    let observedAction = "";
    const response = await dispatchRateLimitedReviewedPlayerRequest(
      playerRequest(method, path),
      endpointKey,
      () => {
        handlerCalls += 1;
        return new Response("ok");
      },
      dependencies({
        enforcePostAuth: (input) => {
          observedAction = input.action;
          return Promise.resolve(ALLOWED);
        },
      }),
    );
    assertEquals(response.status, 200);
    assertEquals(handlerCalls, 1);
    assertEquals(observedAction, expectedAction);
    if (expectedAction === THREAD_ACTION) {
      assertEquals(observedAction.length <= 64, true);
      assertEquals(observedAction.includes(THREAD), false);
    }
  }
});

Deno.test("Messaging rate-limit denial fails closed before message handling", async () => {
  let handlerCalls = 0;
  const response = await dispatchRateLimitedReviewedPlayerRequest(
    playerRequest("POST", `/players/me/messages/threads/${THREAD}/messages`),
    "messageSend",
    () => {
      handlerCalls += 1;
      return new Response("unsafe");
    },
    dependencies({ enforcePostAuth: () => Promise.resolve(DENIED) }),
  );
  assertEquals(response.status, 429);
  assertEquals(handlerCalls, 0);
  assertEquals((await response.json()).error.code, "rate_limit_exceeded");
});

const SCOPE: PlayerRequestScope = {
  playerUuid: PLAYER,
  gameId: GAME,
  activeSessionId: SESSION,
  sessionValid: true,
  sessionExpiresAt: "2026-07-22T00:00:00.000Z",
  authorizationContext: {
    actorType: "player",
    source: "player_session",
    gameScope: "session",
    resourceScope: "own_player",
  },
};
const ALLOWED: RateLimitDecision = {
  allowed: true,
  retryAfterSeconds: 0,
  limitingDimension: null,
  limit: 90,
  remaining: 89,
  resetAt: "2026-07-21T00:01:00.000Z",
};
const DENIED: RateLimitDecision = {
  allowed: false,
  retryAfterSeconds: 12,
  limitingDimension: "action",
  limit: 10,
  remaining: 0,
  resetAt: "2026-07-21T00:01:00.000Z",
};

function playerRequest(method: string, path: string): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      "x-player-session-token": "ps_private",
      "x-real-ip": "203.0.113.42",
    },
  });
}
function dependencies(overrides: Partial<PlayerRateLimitDispatchDependencies> = {}): PlayerRateLimitDispatchDependencies {
  return {
    createServiceClient: () => ({}) as EdgeSupabaseClient,
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost:54321",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope: () => Promise.resolve(SCOPE),
    enforcePostAuth: () => Promise.resolve(ALLOWED),
    enforcePreAuth: () => Promise.resolve(ALLOWED),
    ...overrides,
  };
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}

// REF-006 exercises the real parser, limiter and Messaging handlers with synthetic RPCs.
const DISPATCH_ROUTES = [
  ["GET", "/players/me/messages", "read_player_messages_v2", "player.messages.read", 200],
  ["GET", "/players/me/messages/policy", "read_player_message_policy_v1", "player.messages.policy.read", 200],
  ["GET", "/players/me/messages/search?q=market", "read_player_messages_v2", "player.messages.search", 200],
  ["POST", "/players/me/messages/threads", "create_player_message_thread_atomic_v1", "player.messages.thread.create", 201],
  ["GET", `/players/me/messages/threads/${THREAD}`, "read_player_message_thread_v1", THREAD_ACTION, 200],
  ["POST", `/players/me/messages/threads/${THREAD}/messages`, "send_player_message_atomic_v1", THREAD_ACTION, 201],
  ["POST", `/players/me/messages/threads/${THREAD}/read`, "mark_player_message_thread_read_v1", THREAD_ACTION, 200],
] as const;

Deno.test("REF-006 both roots retain one identical Messaging implementation", () => {
  assertEquals(dispatchFromDomain === dispatchFromClassroom, true);
});

Deno.test("REF-006 Player imports the domain directly and Classroom retains its one-way export", async () => {
  const player = await Deno.readTextFile("supabase/functions/player-api/runtime.ts");
  const classroom = await Deno.readTextFile("supabase/functions/classroom-api/index.ts");
  assertEquals(player.includes('from "../../../src/domains/messaging/api/playerMessagingDispatch.ts"'), true);
  assertEquals(/from\s+["'][^"']*classroom-api\//u.test(player), false);
  assertEquals(classroom.includes('from "./messagingDispatch.ts"'), true);
  for (const root of [player, classroom]) {
    assertEquals([...root.matchAll(/dispatchClassroomMessagingRequest\s*\(/gu)].length, 1);
    assertEquals(/dispatchClassroomMessagingRequest\(\s*request,\s*\{ createServiceClient \}/u.test(root), true);
  }
});

for (const [method, route, rpc, action, status] of DISPATCH_ROUTES) {
  Deno.test(`REF-006 ${method} ${route} preserves response and scoped service calls through both imports`, async () => {
    const results = await dispatchPair(method, route);
    assertEquals(results[0], results[1]);
    const result = results[0];
    assertEquals(result.status, status);
    assertEquals(result.actions, [action]);
    assertEquals(result.rpcCalls.length, 1);
    assertEquals(result.rpcCalls[0].name, rpc);
    assertEquals(result.rpcCalls[0].args.p_game_session_id, GAME);
    assertEquals(result.rpcCalls[0].args.p_player_id, PLAYER);
    assertEquals(result.clientCreations, 2);
    assertEquals(result.scopeCalls, 1);
    assertEquals(result.sessionCalls, 1);
    assertEquals(result.headers["cache-control"], "private, no-store");
    assertEquals(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(JSON.stringify(result.body)), false);
    if (rpc.includes("atomic")) assertEquals(result.rpcCalls[0].args.p_idempotency_key, "ref006-command:1");
  });
}

for (const mode of ["deny", "unavailable"] as const) {
  Deno.test(`REF-006 ${mode} limiter stops all Messaging handlers through both imports`, async () => {
    for (const [method, route] of DISPATCH_ROUTES) {
      const results = await dispatchPair(method, route, mode);
      assertEquals(results[0], results[1]);
      assertEquals(results[0].status, mode === "deny" ? 429 : 503);
      assertEquals(results[0].rpcCalls, []);
      assertEquals(results[0].clientCreations, 1);
      assertEquals(results[0].sessionCalls, 0);
    }
  });
}

Deno.test("REF-006 unsupported Messaging methods retain 405 without service clients", async () => {
  for (const [, route] of DISPATCH_ROUTES) {
    const results = await dispatchPair("DELETE", route);
    assertEquals(results[0], results[1]);
    assertEquals(results[0].status, 405);
    assertEquals(results[0].clientCreations, 0);
    assertEquals(results[0].rpcCalls, []);
  }
});

Deno.test("REF-006 unrelated paths remain unhandled without dependency access", async () => {
  const results = await dispatchPair("GET", "/players/me/inventory");
  assertEquals(results[0], results[1]);
  assertEquals(results[0].status, null);
  assertEquals(results[0].clientCreations, 0);
  assertEquals(results[0].actions, []);
  assertEquals(results[0].rpcCalls, []);
});

Deno.test("REF-006 create and send preserve replay receipts without duplicating RPCs", async () => {
  for (const route of ["/players/me/messages/threads", `/players/me/messages/threads/${THREAD}/messages`]) {
    const results = await dispatchPair("POST", route, "allow", "replayed");
    assertEquals(results[0], results[1]);
    assertEquals(results[0].status, 200);
    assertEquals(results[0].body.data.outcome, "replayed");
    assertEquals(results[0].rpcCalls.length, 1);
    assertEquals(results[0].rpcCalls[0].args.p_idempotency_key, "ref006-command:1");
  }
});

async function dispatchPair(
  method: string,
  route: string,
  mode: "allow" | "deny" | "unavailable" = "allow",
  outcome: "applied" | "replayed" = "applied",
) {
  const results = [];
  for (const [prefix, dispatch] of [
    ["player-api", dispatchFromDomain],
    ["classroom-api", dispatchFromClassroom],
  ] as const) {
    const fixture = dispatchFixture(mode, outcome);
    const body = method === "POST" && route.endsWith("/threads")
      ? { recipientPlayerId: "PLAYER-002", title: "Trade", body: "Market note", idempotencyKey: "ref006-command:1" }
      : method === "POST" && route.endsWith("/messages")
      ? { body: "Market note", idempotencyKey: "ref006-command:1" }
      : undefined;
    const request = new Request(`https://example.test/functions/v1/${prefix}${route}`, {
      method,
      headers: { "x-player-session-token": "ps_private", "content-type": "application/json", "idempotency-key": "ref006-command:1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const response = await dispatch(request, fixture.dependencies);
    results.push({
      status: response?.status ?? null,
      headers: response ? Object.fromEntries(response.headers) : {},
      body: response ? await response.json() : null,
      ...fixture.trace,
    });
  }
  return results;
}

function dispatchFixture(mode: "allow" | "deny" | "unavailable", outcome: "applied" | "replayed") {
  const now = "2026-07-21T00:00:00.000Z";
  const message = `msg_${"b".repeat(32)}`;
  const trace = {
    clientCreations: 0,
    scopeCalls: 0,
    sessionCalls: 0,
    actions: [] as string[],
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  };
  const replies: Record<string, unknown> = {
    read_player_messages_v2: { unreadCount: 0, pageUnreadCount: 0, nextCursor: null, threads: [] },
    read_player_message_policy_v1: { playerThreadsEnabled: true, maxParticipants: 2, defaultRetentionDays: 30, attachmentsEnabled: false },
    read_player_message_thread_v1: { id: THREAD, type: "player", title: "Trade", contractKey: null, status: "active", allowPlayerReplies: true, participantCount: 2, unreadCount: 0, updatedAt: now, retentionUntil: "2027-07-21T00:00:00.000Z", messages: [] },
    create_player_message_thread_atomic_v1: [{ create_outcome: outcome, thread_id: THREAD, message_id: message, thread_title: "Trade", recipient_reference: "PLAYER-002", created_at: now }],
    send_player_message_atomic_v1: [{ send_outcome: outcome, thread_id: THREAD, message_id: message, sender_name: "Player One", message_body: "Market note", created_at: now }],
    mark_player_message_thread_read_v1: [{ thread_id: THREAD, read_at: now, unread_count: 0 }],
  };
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (!Object.hasOwn(replies, name)) throw new Error(`Unexpected synthetic RPC: ${name}`);
      trace.rpcCalls.push({ name, args });
      return Promise.resolve({ data: replies[name], error: null });
    },
  } as unknown as EdgeSupabaseClient;
  const readEnvironment = () => ({
    ok: true as const,
    value: { supabaseUrl: "http://localhost:54321", supabaseAnonKey: "anon", supabaseServiceRoleKey: "service" },
  });
  return {
    trace,
    dependencies: {
      ...dependencies({
        createServiceClient: () => { trace.clientCreations += 1; return client; },
        readEnvironment,
        resolveScope: () => { trace.scopeCalls += 1; return Promise.resolve(SCOPE); },
        createRequestId: () => "ref006-request",
        enforcePostAuth: (input, receivedClient) => {
          assertEquals(receivedClient === client, true);
          assertEquals(input.scope.gameId, GAME);
          assertEquals(input.scope.playerUuid, PLAYER);
          trace.actions.push(input.action);
          if (mode === "unavailable") throw new Error("Synthetic limiter unavailable");
          return Promise.resolve(mode === "deny" ? DENIED : ALLOWED);
        },
      }),
      readSupabaseEnv: readEnvironment,
      hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
      resolvePlayerSession: (receivedClient: EdgeSupabaseClient, tokenHash: string) => {
        assertEquals(receivedClient === client, true);
        assertEquals(tokenHash, "hash:ps_private");
        trace.sessionCalls += 1;
        return Promise.resolve({
          ok: true as const,
          session: { id: SESSION, game_session_id: GAME, player_id: PLAYER, status: "active", expires_at: "2026-07-22T00:00:00.000Z", revoked_at: null },
          gameSession: { id: GAME, name: "Game", owner_staff_user_id: "00000000-0000-4000-8000-000000000031", status: "active" },
          player: { id: PLAYER, game_session_id: GAME, display_name: "Player One", roster_label: null, player_identifier: "PLAYER-001", status: "active" },
        });
      },
      now: () => new Date(now),
    },
  };
}
