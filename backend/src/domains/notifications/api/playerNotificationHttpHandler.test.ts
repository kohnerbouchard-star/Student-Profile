import { handlePlayerNotificationRequest } from "./playerNotificationHttpHandler.ts";
import type { PlayerNotificationRoute } from "./playerNotificationRoutePaths.ts";
import type {
  ListPlayerNotificationsInput,
  MarkPlayerNotificationDeliveriesReadInput,
  PlayerNotificationPage,
  PlayerNotificationRecord,
  ReadPlayerNotificationDeliveriesInput,
} from "../contracts/playerNotificationContracts.ts";
import type {
  PlayerNotificationDeliveryStateRecord,
  PlayerNotificationRepository,
} from "../infrastructure/playerNotificationRepository.ts";
import { PlayerNotificationPersistenceError } from "../infrastructure/supabasePlayerNotificationRepository.ts";
import { parsePlayerNotificationCursor } from "./playerNotificationRequestParser.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const DELIVERY_ID = "00000000-0000-4000-8000-000000000031";
const OTHER_DELIVERY_ID = "00000000-0000-4000-8000-000000000032";
const NOTIFICATION_ID = "00000000-0000-4000-8000-000000000041";
const OTHER_NOTIFICATION_ID = "00000000-0000-4000-8000-000000000042";
const NOW = "2026-07-17T08:00:00.000Z";

Deno.test("player notification routes enforce method, session, and runner boundaries", async () => {
  const wrongListMethod = await handlePlayerNotificationRequest(
    request({ method: "POST", body: {} }),
    listRoute(),
    dependencies(),
  );
  const wrongReadMethod = await handlePlayerNotificationRequest(
    request({ method: "GET", path: "/players/me/notifications/read" }),
    markReadRoute(),
    dependencies(),
  );
  const missingSession = await handlePlayerNotificationRequest(
    request({ authToken: null }),
    listRoute(),
    dependencies(),
  );
  const invalidSession = await handlePlayerNotificationRequest(
    request(),
    listRoute(),
    dependencies({ sessionMode: "invalid" }),
  );
  const runnerSecret = await handlePlayerNotificationRequest(
    request({ runnerSecret: "runner-secret" }),
    listRoute(),
    dependencies(),
  );

  await assertErrorResponse(wrongListMethod, 405, "method_not_allowed");
  await assertErrorResponse(wrongReadMethod, 405, "method_not_allowed");
  await assertErrorResponse(missingSession, 401, "invalid_player_session");
  await assertErrorResponse(invalidSession, 401, "invalid_player_session");
  await assertErrorResponse(
    runnerSecret,
    400,
    "stock_runner_secret_not_allowed",
  );
});

Deno.test("player notification list derives scope and returns bounded safe DTOs", async () => {
  const repository = new MockNotificationRepository({
    page: {
      records: [notificationRecord()],
      hasMore: true,
      nextCursor: {
        deliveredAt: "2026-07-17T07:00:00.000Z",
        deliveryId: DELIVERY_ID,
      },
    },
  });
  const response = await handlePlayerNotificationRequest(
    request({
      query: "status=all&limit=1",
      gameSessionId: GAME_SESSION_ID,
    }),
    listRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.listInputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    status: "all",
    limit: 1,
    cursor: null,
  }]);
  assertEquals(body.gameSession.id, GAME_SESSION_ID);
  assertEquals(body.player.id, PLAYER_ID);
  assertEquals(body.generatedAt, NOW);
  assertEquals(body.filter, { status: "all", limit: 1 });
  assertEquals(body.page.hasMore, true);
  assertEquals(parsePlayerNotificationCursor(body.page.nextCursor), {
    deliveredAt: "2026-07-17T07:00:00.000Z",
    deliveryId: DELIVERY_ID,
  });
  assertEquals(body.items, [{
    id: DELIVERY_ID,
    deliveryId: DELIVERY_ID,
    notificationId: NOTIFICATION_ID,
    sourceType: "storyline_event",
    sourceId: "event-1",
    notificationType: "story_impact",
    title: "Supply disruption",
    summary: "A regional supplier has paused deliveries.",
    priority: "major",
    displayMode: "notification_only",
    status: "unread",
    publishedAt: "2026-07-17T06:59:00.000Z",
    deliveredAt: "2026-07-17T07:00:00.000Z",
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
  }]);
  assertEquals(Object.hasOwn(body.items[0], "payload"), false);
});

Deno.test("player notification list rejects mismatched scope, identity, and invalid filters", async () => {
  const mismatched = await handlePlayerNotificationRequest(
    request({ gameSessionId: OTHER_GAME_SESSION_ID }),
    listRoute(),
    dependencies(),
  );
  const identity = await handlePlayerNotificationRequest(
    request({ query: `playerId=${OTHER_PLAYER_ID}` }),
    listRoute(),
    dependencies(),
  );
  const invalidFilter = await handlePlayerNotificationRequest(
    request({ query: "status=unknown" }),
    listRoute(),
    dependencies(),
  );

  await assertErrorResponse(
    mismatched,
    401,
    "invalid_player_session_scope",
  );
  await assertErrorResponse(identity, 400, "invalid_player_request");
  await assertErrorResponse(
    invalidFilter,
    400,
    "invalid_player_notification_request",
  );
});

Deno.test("player notification list fails closed on repository scope leakage", async () => {
  const repository = new MockNotificationRepository({
    page: {
      records: [notificationRecord({ playerId: OTHER_PLAYER_ID })],
      hasMore: false,
      nextCursor: null,
    },
  });
  const response = await handlePlayerNotificationRequest(
    request(),
    listRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(
    response,
    500,
    "player_notification_scope_violation",
  );
});

Deno.test("player notification mark-read supports terminal compatibility IDs and is idempotent", async () => {
  const repository = new MockNotificationRepository({
    deliveries: [
      deliveryState(),
      deliveryState({
        deliveryId: OTHER_DELIVERY_ID,
        notificationId: OTHER_NOTIFICATION_ID,
        seenAt: "2026-07-17T07:30:00.000Z",
      }),
    ],
  });
  const first = await handlePlayerNotificationRequest(
    request({
      method: "POST",
      path: "/players/me/notifications/read",
      body: { notificationIds: [DELIVERY_ID, OTHER_DELIVERY_ID] },
    }),
    markReadRoute(),
    dependencies({ repository }),
  );
  const firstBody = await first.json();

  assertEquals(first.status, 200);
  assertEquals(firstBody.requestedCount, 2);
  assertEquals(firstBody.newlyReadCount, 1);
  assertEquals(firstBody.alreadyReadCount, 1);
  assertEquals(firstBody.deliveries, [
    {
      deliveryId: DELIVERY_ID,
      notificationId: NOTIFICATION_ID,
      seenAt: NOW,
    },
    {
      deliveryId: OTHER_DELIVERY_ID,
      notificationId: OTHER_NOTIFICATION_ID,
      seenAt: "2026-07-17T07:30:00.000Z",
    },
  ]);
  assertEquals(repository.markInputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    deliveryIds: [DELIVERY_ID],
    seenAt: NOW,
  }]);

  const replay = await handlePlayerNotificationRequest(
    request({
      method: "POST",
      path: "/players/me/notifications/read",
      body: { deliveryIds: [DELIVERY_ID, OTHER_DELIVERY_ID] },
    }),
    markReadRoute(),
    dependencies({ repository }),
  );
  const replayBody = await replay.json();

  assertEquals(replay.status, 200);
  assertEquals(replayBody.newlyReadCount, 0);
  assertEquals(replayBody.alreadyReadCount, 2);
  assertEquals(repository.markInputs[1]?.deliveryIds, []);
});

Deno.test("player notification mark-read rejects missing or foreign delivery IDs before mutation", async () => {
  const repository = new MockNotificationRepository({
    deliveries: [deliveryState()],
  });
  const response = await handlePlayerNotificationRequest(
    request({
      method: "POST",
      path: "/players/me/notifications/read",
      body: { deliveryIds: [DELIVERY_ID, OTHER_DELIVERY_ID] },
    }),
    markReadRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(
    response,
    404,
    "player_notification_deliveries_not_found",
  );
  assertEquals(repository.markInputs, []);
});

Deno.test("player notification mark-read resolves a concurrent identical update idempotently", async () => {
  const repository = new MockNotificationRepository({
    deliveries: [deliveryState()],
    hideUpdatedRows: true,
  });
  const response = await handlePlayerNotificationRequest(
    request({
      method: "POST",
      path: "/players/me/notifications/read",
      body: { deliveryIds: [DELIVERY_ID] },
    }),
    markReadRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.newlyReadCount, 0);
  assertEquals(body.alreadyReadCount, 1);
  assertEquals(body.deliveries[0].seenAt, NOW);
});

Deno.test("player notification handlers map repository failures safely", async () => {
  const repository = new MockNotificationRepository({ fail: true });
  const list = await handlePlayerNotificationRequest(
    request(),
    listRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(list, 500, "player_notification_query_failed");
});

function dependencies(options: {
  readonly repository?: MockNotificationRepository;
  readonly sessionMode?: "ok" | "invalid";
} = {}) {
  const repository = options.repository ?? new MockNotificationRepository();

  return {
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    createServiceClient: () => ({} as never),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => {
      if (options.sessionMode === "invalid") {
        return Promise.resolve({
          ok: false as const,
          status: 401,
          error: {
            code: "invalid_player_session",
            message: "Player session is invalid or expired.",
            retryable: false,
          },
        });
      }

      return Promise.resolve({
        ok: true as const,
        session: {
          id: PLAYER_SESSION_ID,
          game_session_id: GAME_SESSION_ID,
          player_id: PLAYER_ID,
          status: "active",
          expires_at: "2099-07-17T08:00:00.000Z",
          revoked_at: null,
        },
        gameSession: {
          id: GAME_SESSION_ID,
          name: "Period 1",
          status: "active",
        },
        player: {
          id: PLAYER_ID,
          display_name: "Avery",
          roster_label: "A-1",
          status: "active",
        },
      });
    },
    createRepository: () => repository,
    now: () => NOW,
  };
}

function request(options: {
  readonly method?: string;
  readonly path?: string;
  readonly query?: string;
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly runnerSecret?: string;
  readonly body?: unknown;
} = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.gameSessionId) {
    headers.set("x-econovaria-game-session-id", options.gameSessionId);
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  return new Request(
    `https://example.test${options.path ?? "/players/me/notifications"}${
      options.query ? `?${options.query}` : ""
    }`,
    init,
  );
}

class MockNotificationRepository implements PlayerNotificationRepository {
  readonly listInputs: ListPlayerNotificationsInput[] = [];
  readonly readInputs: ReadPlayerNotificationDeliveriesInput[] = [];
  readonly markInputs: MarkPlayerNotificationDeliveriesReadInput[] = [];
  private readonly page: PlayerNotificationPage;
  private readonly deliveries = new Map<
    string,
    PlayerNotificationDeliveryStateRecord
  >();

  constructor(
    private readonly options: {
      readonly page?: PlayerNotificationPage;
      readonly deliveries?: readonly PlayerNotificationDeliveryStateRecord[];
      readonly hideUpdatedRows?: boolean;
      readonly fail?: boolean;
    } = {},
  ) {
    this.page = options.page ?? {
      records: [],
      hasMore: false,
      nextCursor: null,
    };

    for (const delivery of options.deliveries ?? []) {
      this.deliveries.set(delivery.deliveryId, { ...delivery });
    }
  }

  listPlayerNotifications(
    input: ListPlayerNotificationsInput,
  ): Promise<PlayerNotificationPage> {
    this.listInputs.push(input);
    this.failIfConfigured();
    return Promise.resolve(this.page);
  }

  readPlayerDeliveriesByIds(
    input: ReadPlayerNotificationDeliveriesInput,
  ): Promise<readonly PlayerNotificationDeliveryStateRecord[]> {
    this.readInputs.push(input);
    this.failIfConfigured();
    return Promise.resolve(
      input.deliveryIds.flatMap((deliveryId) => {
        const delivery = this.deliveries.get(deliveryId);
        return delivery ? [{ ...delivery }] : [];
      }),
    );
  }

  markPlayerDeliveriesRead(
    input: MarkPlayerNotificationDeliveriesReadInput,
  ): Promise<readonly PlayerNotificationDeliveryStateRecord[]> {
    this.markInputs.push(input);
    this.failIfConfigured();
    const updated: PlayerNotificationDeliveryStateRecord[] = [];

    for (const deliveryId of input.deliveryIds) {
      const delivery = this.deliveries.get(deliveryId);

      if (!delivery || delivery.seenAt !== null) {
        continue;
      }

      const next = { ...delivery, seenAt: input.seenAt };
      this.deliveries.set(deliveryId, next);
      updated.push(next);
    }

    return Promise.resolve(this.options.hideUpdatedRows ? [] : updated);
  }

  private failIfConfigured(): void {
    if (this.options.fail) {
      throw new PlayerNotificationPersistenceError(
        "player_notification_query_failed",
        "Player notification request failed.",
      );
    }
  }
}

function notificationRecord(
  overrides: Partial<PlayerNotificationRecord> = {},
): PlayerNotificationRecord {
  return {
    deliveryId: DELIVERY_ID,
    notificationId: NOTIFICATION_ID,
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    sourceType: "storyline_event",
    sourceId: "event-1",
    notificationType: "story_impact",
    title: "Supply disruption",
    summary: "A regional supplier has paused deliveries.",
    priority: "major",
    displayMode: "notification_only",
    publishedAt: "2026-07-17T06:59:00.000Z",
    deliveredAt: "2026-07-17T07:00:00.000Z",
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
    ...overrides,
  };
}

function deliveryState(
  overrides: Partial<PlayerNotificationDeliveryStateRecord> = {},
): PlayerNotificationDeliveryStateRecord {
  return {
    deliveryId: DELIVERY_ID,
    notificationId: NOTIFICATION_ID,
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    deliveredAt: "2026-07-17T07:00:00.000Z",
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
    ...overrides,
  };
}

function listRoute(): PlayerNotificationRoute {
  return { kind: "list" };
}

function markReadRoute(): PlayerNotificationRoute {
  return { kind: "markRead" };
}

async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedCode: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, expectedStatus);
  assertEquals(body.ok, false);
  assertEquals(body.error.code, expectedCode);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
