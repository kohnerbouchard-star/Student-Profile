import { EdgeActivationError } from "../platform/supabase/edgeResponse.ts";
import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestScope } from "../domains/players/api/playerRequestScope.ts";
import {
  dispatchRateLimitedPlayerLoginRequest,
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

Deno.test("reviewed Player route mapping is server-owned and exhaustive", () => {
  const expected = {
    "bootstrap:GET": ["player.session.read", "read"],
    "capabilities:GET": ["player.capabilities.read", "read"],
    "banking:GET": ["player.banking.read", "read"],
    "contractAccept:POST": ["player.contracts.accept", "write"],
    "contractSubmit:POST": ["player.contracts.submit", "write"],
    "contracts:GET": ["player.contracts.read", "read"],
    "countries:GET": ["player.countries.read", "read"],
    "country:GET": ["player.country.read", "read"],
    "inventory:GET": ["player.inventory.read", "read"],
    "inventoryRedemption:GET": ["player.inventory.redemptions.read", "read"],
    "inventoryRedemption:POST": ["player.inventory.redemptions.request", "write"],
    "logout:POST": ["player.session.logout", "sensitive"],
    "market:GET": ["player.market.read", "read"],
    "marketAsset:GET": ["player.asset.read", "read"],
    "marketWatchlist:DELETE": ["player.watchlist.write", "write"],
    "marketWatchlist:GET": ["player.watchlist.read", "read"],
    "marketWatchlist:PUT": ["player.watchlist.write", "write"],
    "news:GET": ["player.news.read", "read"],
    "notifications:GET": ["player.notifications.read", "read"],
    "notificationsRead:POST": ["player.notifications.write", "write"],
    "storyDeliveries:GET": ["player.story.deliveries.read", "read"],
    "storyDeliveryState:POST": ["player.story.deliveries.write", "write"],
  };

  const actual: Record<string, readonly string[]> = {};
  for (const key of Object.keys(expected)) {
    const [endpointKey, method] = key.split(":");
    const operation = readReviewedPlayerRateLimitOperation(
      endpointKey as never,
      method ?? "",
    );
    if (!operation) throw new Error(`Missing operation ${key}`);
    actual[key] = [operation.action, operation.profile];
  }
  assertEquals(actual, expected);
  assertEquals(
    readReviewedPlayerRateLimitOperation("inventory", "POST"),
    null,
  );
});

Deno.test("post-auth dispatch resolves scope, consumes once, and invokes route once", async () => {
  let scopeCalls = 0;
  let limiterCalls = 0;
  let handlerCalls = 0;
  const response = await dispatchRateLimitedReviewedPlayerRequest(
    playerRequest("GET", "/players/me/inventory"),
    "inventory",
    () => {
      handlerCalls += 1;
      return new Response("ok");
    },
    dependencies({
      resolveScope: () => {
        scopeCalls += 1;
        return Promise.resolve(SCOPE);
      },
      enforcePostAuth: (input) => {
        limiterCalls += 1;
        assertEquals(input.action, "player.inventory.read");
        assertEquals(input.profile, "read");
        assertEquals(input.scope, SCOPE);
        return Promise.resolve(ALLOWED);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals([scopeCalls, limiterCalls, handlerCalls], [1, 1, 1]);
});

Deno.test("post-auth denial and outage fail closed before route work", async () => {
  for (
    const testCase of [
      {
        enforce: () => Promise.resolve(DENIED),
        status: 429,
        code: "rate_limit_exceeded",
      },
      {
        enforce: () => Promise.reject(new Error("rpc unavailable")),
        status: 503,
        code: "rate_limit_service_unavailable",
      },
    ]
  ) {
    let handlerCalls = 0;
    const response = await dispatchRateLimitedReviewedPlayerRequest(
      playerRequest("POST", "/players/me/notifications/read"),
      "notificationsRead",
      () => {
        handlerCalls += 1;
        return new Response("unsafe");
      },
      dependencies({ enforcePostAuth: testCase.enforce }),
    );
    assertEquals(response.status, testCase.status);
    assertEquals((await response.json()).error.code, testCase.code);
    assertEquals(handlerCalls, 0);
  }
});

Deno.test("post-auth dispatch preserves session errors without consuming a bucket", async () => {
  let limiterCalls = 0;
  let handlerCalls = 0;
  const response = await dispatchRateLimitedReviewedPlayerRequest(
    playerRequest("GET", "/players/me/world/news"),
    "news",
    () => {
      handlerCalls += 1;
      return new Response("unsafe");
    },
    dependencies({
      resolveScope: () =>
        Promise.reject(
          new EdgeActivationError(
            "player_session_expired",
            "Player session has expired.",
            401,
          ),
        ),
      enforcePostAuth: () => {
        limiterCalls += 1;
        return Promise.resolve(ALLOWED);
      },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals((await response.json()).error.code, "player_session_expired");
  assertEquals([limiterCalls, handlerCalls], [0, 0]);
});

Deno.test("unsupported route methods bypass consumption and retain handler semantics", async () => {
  let limiterCalls = 0;
  let handlerCalls = 0;
  const response = await dispatchRateLimitedReviewedPlayerRequest(
    playerRequest("POST", "/players/me/inventory"),
    "inventory",
    () => {
      handlerCalls += 1;
      return new Response(null, { status: 405 });
    },
    dependencies({
      enforcePostAuth: () => {
        limiterCalls += 1;
        return Promise.resolve(ALLOWED);
      },
    }),
  );
  assertEquals(response.status, 405);
  assertEquals([limiterCalls, handlerCalls], [0, 1]);
});

Deno.test("login dispatch consumes only pre-auth IP/action context before parsing credentials", async () => {
  let captured: unknown = null;
  let handlerCalls = 0;
  const request = new Request("https://example.test/players/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "203.0.113.42",
    },
    body: JSON.stringify({
      gameJoinCode: "SECRET-GAME",
      playerIdentifier: "SECRET-PLAYER",
      accessCode: "SECRET-CODE",
    }),
  });
  const response = await dispatchRateLimitedPlayerLoginRequest(
    request,
    () => {
      handlerCalls += 1;
      return new Response("ok");
    },
    dependencies({
      enforcePreAuth: (input) => {
        captured = input;
        return Promise.resolve(ALLOWED);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(handlerCalls, 1);
  assertEquals((captured as { action: string }).action, "player.login.attempt");
  assertEquals((captured as { profile: string }).profile, "sensitive");
  const serialized = JSON.stringify(captured);
  for (const secret of ["SECRET-GAME", "SECRET-PLAYER", "SECRET-CODE"]) {
    assertEquals(serialized.includes(secret), false);
  }
  assertEquals("scope" in (captured as Record<string, unknown>), false);
});

Deno.test("login denial and limiter outage fail closed without invoking credential handler", async () => {
  for (
    const testCase of [
      {
        dependencies: dependencies({
          enforcePreAuth: () => Promise.resolve(DENIED),
        }),
        status: 429,
      },
      {
        dependencies: dependencies({
          enforcePreAuth: () => Promise.reject(new Error("unavailable")),
        }),
        status: 503,
      },
      {
        dependencies: dependencies({
          readEnvironment: () => ({ ok: false as const }),
        }),
        status: 503,
      },
    ]
  ) {
    let handlerCalls = 0;
    const response = await dispatchRateLimitedPlayerLoginRequest(
      playerRequest("POST", "/players/login"),
      () => {
        handlerCalls += 1;
        return new Response("unsafe");
      },
      testCase.dependencies,
    );
    assertEquals(response.status, testCase.status);
    assertEquals(handlerCalls, 0);
  }
});

Deno.test("unsupported login method is not consumed and remains method-not-allowed", async () => {
  let limiterCalls = 0;
  const response = await dispatchRateLimitedPlayerLoginRequest(
    playerRequest("GET", "/players/login"),
    () => new Response(null, { status: 405 }),
    dependencies({
      enforcePreAuth: () => {
        limiterCalls += 1;
        return Promise.resolve(ALLOWED);
      },
    }),
  );
  assertEquals(response.status, 405);
  assertEquals(limiterCalls, 0);
});

Deno.test("missing limiter runtime configuration blocks both authenticated and login dispatch", async () => {
  let handlerCalls = 0;
  const {
    enforcePostAuth: _postAuthOverride,
    ...postAuthDependencies
  } = dependencies();
  const authenticated = await dispatchRateLimitedReviewedPlayerRequest(
    playerRequest("GET", "/players/me/capabilities"),
    "capabilities",
    () => {
      handlerCalls += 1;
      return new Response("unsafe");
    },
    postAuthDependencies,
  );

  const {
    enforcePreAuth: _preAuthOverride,
    ...loginDependencies
  } = dependencies();
  const login = await dispatchRateLimitedPlayerLoginRequest(
    playerRequest("POST", "/players/login"),
    () => {
      handlerCalls += 1;
      return new Response("unsafe");
    },
    loginDependencies,
  );

  assertEquals(authenticated.status, 503);
  assertEquals(login.status, 503);
  assertEquals(handlerCalls, 0);
});

const SCOPE: PlayerRequestScope = {
  playerUuid: PLAYER,
  gameId: GAME,
  activeSessionId: SESSION,
  sessionValid: true,
  sessionExpiresAt: "2026-07-19T00:00:00.000Z",
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
  resetAt: "2026-07-18T00:01:00.000Z",
};

const DENIED: RateLimitDecision = {
  allowed: false,
  retryAfterSeconds: 12,
  limitingDimension: "action",
  limit: 10,
  remaining: 0,
  resetAt: "2026-07-18T00:01:00.000Z",
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
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
