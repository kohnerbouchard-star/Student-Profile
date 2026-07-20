import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { handlePlayerStoryDeliveryRequest } from "./playerStoryDeliveryHttpHandler.ts";
import { PlayerStoryDeliveryError, type PlayerStoryDeliveryRecord, type PlayerStoryDeliveryRepository } from "../contracts/playerStoryDeliveryContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const DELIVERY = "ndl_00000000000000000000000000000001";
const NOTIFICATION = "ntf_00000000000000000000000000000001";
const NOW = "2026-07-20T03:00:00.000Z";

Deno.test("story delivery handler returns purpose-built private payloads", async () => {
  const response = await handlePlayerStoryDeliveryRequest(
    request("GET", "/players/me/story-deliveries"),
    { kind: "list" },
    dependencies(repository()),
  );
  const body = await response.json();
  assertPrivate(response);
  assertEquals(response.status, 200);
  assertEquals(body.items[0].deliveryId, DELIVERY);
  assertEquals(body.items[0].category, "story");
  assertEquals(body.items[0].content.videoAssetKey, "cutscene-1");
  if ("payload" in body.items[0]) throw new Error("Raw payload leaked.");
  assertNoUuid(body);
});

Deno.test("story delivery handler updates all bounded lifecycle actions by public ID", async () => {
  for (const action of ["seen", "dismissed", "acknowledged"] as const) {
    const repo = repository();
    const response = await handlePlayerStoryDeliveryRequest(
      request("POST", `/players/me/story-deliveries/${DELIVERY}/state`, { action }),
      { kind: "state", publicDeliveryId: DELIVERY },
      dependencies(repo),
    );
    const body = await response.json();
    assertPrivate(response);
    assertEquals(response.status, 200);
    assertEquals(body.action, action);
    assertEquals(repo.lastAction, action);
    assertNoUuid(body);
  }
});

Deno.test("malformed, oversized, queried, and wrong-method requests fail privately", async () => {
  const cases: [Request, any][] = [
    [request("POST", `/players/me/story-deliveries/${DELIVERY}/state`, { action: "seen", playerId: PLAYER }), { kind: "state", publicDeliveryId: DELIVERY }],
    [request("GET", "/players/me/story-deliveries?playerId=x"), { kind: "list" }],
    [request("POST", "/players/me/story-deliveries", { action: "seen" }), { kind: "list" }],
    [new Request(`https://example.test/players/me/story-deliveries/${DELIVERY}/state`, { method: "POST", headers: { "content-type": "application/json", "x-player-session-token": "token" }, body: JSON.stringify({ action: "seen", padding: "x".repeat(1500) }) }), { kind: "state", publicDeliveryId: DELIVERY }],
  ];
  for (const [input, route] of cases) {
    const response = await handlePlayerStoryDeliveryRequest(input, route, dependencies(repository()));
    if (response.status < 400) throw new Error(`Expected failure, got ${response.status}`);
    assertPrivate(response);
    assertNoUuid(await response.json());
  }
});

Deno.test("missing, stale, already-processed conflicts preserve bounded error contracts", async () => {
  for (const [status, code] of [[404, "player_story_delivery_not_found"], [409, "player_story_delivery_conflict"]] as const) {
    const repo = repository({ status, code });
    const response = await handlePlayerStoryDeliveryRequest(
      request("POST", `/players/me/story-deliveries/${DELIVERY}/state`, { action: "acknowledged" }),
      { kind: "state", publicDeliveryId: DELIVERY },
      dependencies(repo),
    );
    assertEquals(response.status, status);
    assertPrivate(response);
    const body = await response.json();
    assertEquals(body.error.code, code);
    assertNoUuid(body);
  }
});

Deno.test("authentication failures are private and never echo credentials", async () => {
  const response = await handlePlayerStoryDeliveryRequest(
    request("GET", "/players/me/story-deliveries"),
    { kind: "list" },
    {
      ...dependencies(repository()),
      resolveScope: async () => { throw new EdgeActivationError("player_session_expired", "Player session expired.", 401); },
    },
  );
  assertEquals(response.status, 401);
  assertPrivate(response);
  const serialized = JSON.stringify(await response.json());
  if (serialized.includes("token") || serialized.includes(PLAYER) || serialized.includes(GAME)) throw new Error("Credential or scope leaked.");
});

function dependencies(repo: ReturnType<typeof repository>) {
  return {
    readSupabaseEnv: () => ({ ok: true as const, value: { supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "service-role-key", supabaseAnonKey: "anon-key" } }),
    createServiceClient: () => ({}) as never,
    resolveScope: async () => ({
      gameId: GAME,
      playerUuid: PLAYER,
      activeSessionId: "00000000-0000-4000-8000-000000000031",
      sessionValid: true as const,
      sessionExpiresAt: "2026-07-20T04:00:00.000Z",
      authorizationContext: { actorType: "player" as const, source: "player_session" as const, gameScope: "session" as const, resourceScope: "own_player" as const },
    }),
    createRepository: () => repo,
    now: () => new Date(NOW),
  };
}

function repository(failure: { status: number; code: "player_story_delivery_not_found" | "player_story_delivery_conflict" } | null = null) {
  return new class implements PlayerStoryDeliveryRepository {
    lastAction = "";
    async listPendingDeliveries(): Promise<readonly PlayerStoryDeliveryRecord[]> { return [record()]; }
    async updateDeliveryState(input: any) {
      if (failure) throw new PlayerStoryDeliveryError(failure.code, "Unavailable.", failure.status, false);
      this.lastAction = input.action;
      return {
        publicDeliveryId: DELIVERY,
        publicNotificationId: NOTIFICATION,
        deliveredAt: NOW,
        seenAt: NOW,
        dismissedAt: input.action === "dismissed" ? NOW : null,
        acknowledgedAt: input.action === "acknowledged" ? NOW : null,
        requiresAcknowledgement: true,
      };
    }
  }();
}

function record(): PlayerStoryDeliveryRecord {
  return {
    internalDeliveryUuid: "00000000-0000-4000-8000-000000000101",
    internalNotificationUuid: "00000000-0000-4000-8000-000000000201",
    publicDeliveryId: DELIVERY,
    publicNotificationId: NOTIFICATION,
    gameId: GAME,
    playerUuid: PLAYER,
    category: "story",
    title: "Briefing",
    summary: "Update",
    priority: "major",
    displayMode: "modal_on_next_login",
    publishedAt: NOW,
    deliveredAt: NOW,
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
    requiresAcknowledgement: true,
    content: { videoAssetKey: "cutscene-1", posterAssetKey: null, tone: "briefing", act: 1, sequence: 1 },
  };
}

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { "x-player-session-token": "token", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function assertPrivate(response: Response) {
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(response.headers.get("vary"), "authorization, x-player-session-token");
}
function assertNoUuid(value: unknown) {
  const serialized = JSON.stringify(value);
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) throw new Error(`UUID leaked: ${serialized}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
}
