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
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const SESSION = "00000000-0000-4000-8000-000000000011";
const THREAD = `thr_${"a".repeat(32)}`;

Deno.test("Messaging operations have distinct central rate-limit actions", () => {
  const expected = {
    "messages:GET": ["player.messages.read", "read"],
    "messageThread:GET": ["player.messages.thread.read", "read"],
    "messageSearch:GET": ["player.messages.search", "read"],
    "messageSend:POST": ["player.messages.send", "sensitive"],
    "messageRead:POST": ["player.messages.receipt", "write"],
  } as const;
  for (const [key, value] of Object.entries(expected)) {
    const [endpoint, method] = key.split(":");
    const operation = readReviewedPlayerRateLimitOperation(endpoint as never, method);
    assertEquals(operation && [operation.action, operation.profile], value);
  }
});

Deno.test("communication dispatch remaps Messaging paths before consuming a bucket", async () => {
  const scenarios = [
    ["GET", "/players/me/messages", "player.messages.read"],
    ["GET", "/players/me/messages/search?q=market", "player.messages.search"],
    ["GET", `/players/me/messages/threads/${THREAD}`, "player.messages.thread.read"],
    ["POST", `/players/me/messages/threads/${THREAD}/messages`, "player.messages.send"],
    ["POST", `/players/me/messages/threads/${THREAD}/read`, "player.messages.receipt"],
  ] as const;

  for (const [method, path, expectedAction] of scenarios) {
    let handlerCalls = 0;
    let observedAction = "";
    const response = await dispatchRateLimitedReviewedPlayerRequest(
      playerRequest(method, path),
      method === "POST" ? "notificationsRead" : "notifications",
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
  }
});

Deno.test("Messaging rate-limit denial fails closed before message handling", async () => {
  let handlerCalls = 0;
  const response = await dispatchRateLimitedReviewedPlayerRequest(
    playerRequest("POST", `/players/me/messages/threads/${THREAD}/messages`),
    "notificationsRead",
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

function dependencies(
  overrides: Partial<PlayerRateLimitDispatchDependencies> = {},
): PlayerRateLimitDispatchDependencies {
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
