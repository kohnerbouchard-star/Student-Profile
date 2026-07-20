import { EdgeActivationError } from "../platform/supabase/edgeResponse.ts";
import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestScope } from "../domains/players/api/playerRequestScope.ts";
import {
  dispatchRateLimitedPlayerLoginRequest,
  dispatchRateLimitedReviewedPlayerRequest,
  readReviewedPlayerRateLimitOperation,
  type PlayerRateLimitDispatchDependencies,
} from "./playerRateLimitDispatch.ts";
import type { RateLimitDecision } from "./rateLimitContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const SESSION = "00000000-0000-4000-8000-000000000011";
const assert = (condition: unknown, message = "assertion failed") => { if (!condition) throw new Error(message); };
const equal = (actual: unknown, expected: unknown) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
const ALLOWED: RateLimitDecision = { allowed: true, retryAfterSeconds: 0, limitingDimension: null, limit: 90, remaining: 89, resetAt: "2026-07-20T00:01:00.000Z" };
const DENIED: RateLimitDecision = { allowed: false, retryAfterSeconds: 12, limitingDimension: "action", limit: 10, remaining: 0, resetAt: "2026-07-20T00:01:00.000Z" };
const SCOPE: PlayerRequestScope = { playerUuid: PLAYER, gameId: GAME, activeSessionId: SESSION, sessionValid: true, sessionExpiresAt: "2026-07-21T00:00:00.000Z", authorizationContext: { actorType: "player", source: "player_session", gameScope: "session", resourceScope: "own_player" } };

function dependencies(overrides: Partial<PlayerRateLimitDispatchDependencies> = {}): PlayerRateLimitDispatchDependencies {
  return {
    createServiceClient: () => ({}) as EdgeSupabaseClient,
    readEnvironment: () => ({ ok: true as const, value: { supabaseUrl: "http://localhost:54321", supabaseAnonKey: "anon", supabaseServiceRoleKey: "service" } }),
    resolveScope: () => Promise.resolve(SCOPE),
    enforcePostAuth: () => Promise.resolve(ALLOWED),
    enforcePreAuth: () => Promise.resolve(ALLOWED),
    ...overrides,
  };
}

Deno.test("story-delivery and inventory mappings remain reviewed", () => {
  equal(readReviewedPlayerRateLimitOperation("storyDeliveries", "GET"), { action: "player.story.deliveries.read", profile: "read" });
  equal(readReviewedPlayerRateLimitOperation("storyDeliveryState", "POST"), { action: "player.story.deliveries.write", profile: "write" });
  equal(readReviewedPlayerRateLimitOperation("inventoryRedemption", "POST"), { action: "player.inventory.redemptions.request", profile: "write" });
});

Deno.test("post-auth dispatch resolves scope before limiter and invokes handler once", async () => {
  const order: string[] = [];
  const response = await dispatchRateLimitedReviewedPlayerRequest(new Request("https://example.invalid/players/me/inventory", { method: "GET" }), "inventory", () => { order.push("handler"); return new Response("ok"); }, dependencies({
    resolveScope: () => { order.push("scope"); return Promise.resolve(SCOPE); },
    enforcePostAuth: () => { order.push("limiter"); return Promise.resolve(ALLOWED); },
  }));
  equal(response.status, 200);
  equal(order, ["scope", "limiter", "handler"]);
});

Deno.test("denial and storage outage fail closed before route work", async () => {
  for (const [enforce, status] of [[() => Promise.resolve(DENIED), 429], [() => Promise.reject(new Error("unavailable")), 503]] as const) {
    let called = false;
    const response = await dispatchRateLimitedReviewedPlayerRequest(new Request("https://example.invalid/players/me/notifications/read", { method: "POST" }), "notificationsRead", () => { called = true; return new Response("unsafe"); }, dependencies({ enforcePostAuth: enforce }));
    equal(response.status, status);
    equal(called, false);
  }
});

Deno.test("login uses credential-blind classroom profile", async () => {
  let captured: Record<string, unknown> | null = null;
  const request = new Request("https://example.invalid/players/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameJoinCode: "SECRET-GAME", playerIdentifier: "SECRET-PLAYER", accessCode: "SECRET-CODE" }) });
  const response = await dispatchRateLimitedPlayerLoginRequest(request, () => new Response("ok"), dependencies({ enforcePreAuth: (input) => { captured = input as unknown as Record<string, unknown>; return Promise.resolve(ALLOWED); } }));
  equal(response.status, 200);
  equal(captured?.profile, "login");
  equal(captured?.action, "player.login.attempt");
  const serialized = JSON.stringify(captured);
  for (const value of ["SECRET-GAME", "SECRET-PLAYER", "SECRET-CODE"]) assert(!serialized.includes(value));
});

Deno.test("session error is preserved without limiter consumption", async () => {
  let limiterCalls = 0;
  const response = await dispatchRateLimitedReviewedPlayerRequest(new Request("https://example.invalid/players/me/news", { method: "GET" }), "news", () => new Response("unsafe"), dependencies({
    resolveScope: () => Promise.reject(new EdgeActivationError("player_session_expired", "Player session has expired.", 401)),
    enforcePostAuth: () => { limiterCalls += 1; return Promise.resolve(ALLOWED); },
  }));
  equal(response.status, 401);
  equal(limiterCalls, 0);
});
