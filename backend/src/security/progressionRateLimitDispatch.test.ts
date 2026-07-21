import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestScope } from "../domains/players/api/playerRequestScope.ts";
import {
  dispatchRateLimitedReviewedPlayerRequest,
  readReviewedPlayerRateLimitOperation,
  type PlayerRateLimitDispatchDependencies,
} from "./playerRateLimitDispatch.ts";
import type { RateLimitDecision } from "./rateLimitContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const SESSION = "00000000-0000-4000-8000-000000000011";
const REWARD = `rwd_${"a".repeat(32)}`;

Deno.test("Progression operations have distinct server-owned actions", () => {
  assertEquals(readReviewedPlayerRateLimitOperation("progression", "GET"), { action: "player.progression.read", profile: "read" });
  assertEquals(readReviewedPlayerRateLimitOperation("progressionUnlock", "POST"), { action: "player.progression.skill.unlock", profile: "sensitive" });
  assertEquals(readReviewedPlayerRateLimitOperation("progressionClaim", "POST"), { action: "player.progression.reward.claim", profile: "sensitive" });
});

Deno.test("capability dispatch seam remaps Progression before consuming a bucket", async () => {
  for (const [method, path, action] of [
    ["GET", "/players/me/progression", "player.progression.read"],
    ["POST", "/players/me/progression/skills/skl_market_literacy_v1/unlock", "player.progression.skill.unlock"],
    ["POST", `/players/me/progression/rewards/${REWARD}/claim`, "player.progression.reward.claim"],
  ] as const) {
    let observed = "";
    const response = await dispatchRateLimitedReviewedPlayerRequest(
      new Request(`https://example.test${path}`, { method, headers: { "x-player-session-token": "token", "x-real-ip": "203.0.113.42" } }),
      "capabilities",
      () => new Response("ok"),
      dependencies({ enforcePostAuth: (input) => { observed = input.action; return Promise.resolve(ALLOWED); } }),
    );
    assertEquals(response.status, 200);
    assertEquals(observed, action);
  }
});

const SCOPE: PlayerRequestScope = {
  playerUuid: PLAYER,
  gameId: GAME,
  activeSessionId: SESSION,
  sessionValid: true,
  sessionExpiresAt: "2026-07-22T00:00:00.000Z",
  authorizationContext: { actorType: "player", source: "player_session", gameScope: "session", resourceScope: "own_player" },
};
const ALLOWED: RateLimitDecision = { allowed: true, retryAfterSeconds: 0, limitingDimension: null, limit: 10, remaining: 9, resetAt: "2026-07-21T00:01:00.000Z" };
function dependencies(overrides: Partial<PlayerRateLimitDispatchDependencies> = {}): PlayerRateLimitDispatchDependencies {
  return {
    createServiceClient: () => ({}) as EdgeSupabaseClient,
    readEnvironment: () => ({ ok: true as const, value: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon", supabaseServiceRoleKey: "service" } }),
    resolveScope: () => Promise.resolve(SCOPE),
    enforcePostAuth: () => Promise.resolve(ALLOWED),
    enforcePreAuth: () => Promise.resolve(ALLOWED),
    ...overrides,
  };
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
}
