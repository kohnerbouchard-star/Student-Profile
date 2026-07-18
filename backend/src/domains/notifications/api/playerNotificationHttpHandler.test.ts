import type {
  PlayerNotificationDeliveryStateRecord,
  PlayerNotificationRecord,
  PlayerNotificationRepository,
} from "../contracts/playerNotificationContracts.ts";
import { handlePlayerNotificationRequest } from "./playerNotificationHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = new Date("2026-07-18T08:00:00.000Z");
const DELIVERY = "ndl_00000000000000000000000000000001";
const NOTIFICATION = "ntf_00000000000000000000000000000001";

Deno.test("notification handler lists UUID-private player notifications", async () => {
  const response = await handlePlayerNotificationRequest(
    request("/players/me/notifications?status=unread&limit=20"),
    { kind: "list" },
    dependencies(repository()),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assertEquals(body.items[0].deliveryId, DELIVERY);
  assertEquals(body.items[0].notificationId, NOTIFICATION);
  assertEquals(body.filter.status, "unread");
  assertNoUuid(JSON.stringify(body));
});

Deno.test("notification handler marks public deliveries read idempotently", async () => {
  const response = await handlePlayerNotificationRequest(
    request("/players/me/notifications/read", {
      method: "POST",
      body: { deliveryIds: [DELIVERY] },
    }),
    { kind: "markRead" },
    dependencies(statefulRepository()),
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.newlyReadCount, 1);
  assertEquals(body.deliveries[0].deliveryId, DELIVERY);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("notification handler rejects missing sessions, identity injection, and browser game scope", async () => {
  const missing = await handlePlayerNotificationRequest(
    request("/players/me/notifications", { token: null }),
    { kind: "list" },
    dependencies(repository()),
  );
  assertEquals(missing.status, 401);
  assertEquals((await missing.json()).error.code, "missing_player_session");

  const injected = await handlePlayerNotificationRequest(
    request("/players/me/notifications", {
      header: ["x-player-uuid", PLAYER],
    }),
    { kind: "list" },
    dependencies(repository()),
  );
  assertEquals(injected.status, 400);
  assertEquals((await injected.json()).error.code, "invalid_player_request");

  const gameScope = await handlePlayerNotificationRequest(
    request("/players/me/notifications?gameSessionId=x"),
    { kind: "list" },
    dependencies(repository()),
  );
  assertEquals(gameScope.status, 400);
  assertEquals(
    (await gameScope.json()).error.code,
    "invalid_player_notification_request",
  );
});

function dependencies(repositoryValue: PlayerNotificationRepository) {
  return {
    createServiceClient: () => ({}) as never,
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
    createRepository: () => repositoryValue,
    now: () => NOW,
  };
}

function repository(): PlayerNotificationRepository {
  const record = notificationRecord();
  return {
    listNotifications: () => Promise.resolve([record]),
    readDeliveriesByPublicIds: () => Promise.resolve([deliveryState(null)]),
    markDeliveriesRead: () => Promise.resolve([deliveryState(NOW.toISOString())]),
  };
}

function statefulRepository(): PlayerNotificationRepository {
  let seenAt: string | null = null;
  return {
    listNotifications: () => Promise.resolve([]),
    readDeliveriesByPublicIds: () => Promise.resolve([deliveryState(seenAt)]),
    markDeliveriesRead: (input) => {
      if (seenAt !== null) return Promise.resolve([]);
      seenAt = input.seenAt;
      return Promise.resolve([deliveryState(seenAt)]);
    },
  };
}

function notificationRecord(): PlayerNotificationRecord {
  return {
    internalDeliveryUuid: "00000000-0000-4000-8000-000000000101",
    internalNotificationUuid: "00000000-0000-4000-8000-000000000201",
    publicDeliveryId: DELIVERY,
    publicNotificationId: NOTIFICATION,
    gameId: GAME,
    playerUuid: PLAYER,
    sourceType: "story",
    notificationType: "briefing",
    title: "Briefing",
    summary: "Update",
    priority: "normal",
    displayMode: "inbox",
    publishedAt: NOW.toISOString(),
    deliveredAt: NOW.toISOString(),
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
  };
}

function deliveryState(seenAt: string | null): PlayerNotificationDeliveryStateRecord {
  return {
    internalDeliveryUuid: "00000000-0000-4000-8000-000000000101",
    internalNotificationUuid: "00000000-0000-4000-8000-000000000201",
    publicDeliveryId: DELIVERY,
    publicNotificationId: NOTIFICATION,
    gameId: GAME,
    playerUuid: PLAYER,
    deliveredAt: NOW.toISOString(),
    seenAt,
    dismissedAt: null,
    acknowledgedAt: null,
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
      expires_at: "2026-07-19T00:00:00.000Z",
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
      display_name: "Player",
      roster_label: null,
      player_identifier: "P-01",
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
  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }
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
