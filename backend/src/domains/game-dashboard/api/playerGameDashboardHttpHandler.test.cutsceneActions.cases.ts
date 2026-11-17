import { handlePlayerGameDashboardRequest } from "./playerGameDashboardHttpHandler.ts";
import {
  OTHER_GAME_SESSION_ID,
  OTHER_PLAYER_ID,
  STORY_DELIVERY_ID,
  STORY_NOTIFICATION_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import {
  cutsceneActionRequest,
  dependencies,
  request,
} from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import {
  playerSession,
  storyDeliveryRow,
  storyNotificationRow,
} from "./playerGameDashboardHttpHandler.test.rowFixtures.support.ts";
import {
  CapturingRepository,
  CapturingStoryNotificationReader,
  FakeClient,
} from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import {
  assertEquals,
  assertErrorResponse,
} from "./playerGameDashboardHttpHandler.test.assertions.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player dashboard retires raw cutscene payload delivery", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow({
    payload: {
      videoAssetKey: "northreach-border-closure-v1",
      requiresAcknowledgement: true,
      arbitrarySecret: { mustNotReachBrowser: true },
    },
  })];
  seededTables.notification_deliveries = [storyDeliveryRow()];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.unseenCutscenes, []);
  assertEquals(JSON.stringify(body).includes("arbitrarySecret"), false);
  assertEquals(JSON.stringify(body).includes(STORY_DELIVERY_ID), false);
  assertEquals(JSON.stringify(body).includes(STORY_NOTIFICATION_ID), false);
});

Deno.test("player dashboard does not invoke the retired cutscene reader", async () => {
  const storyNotificationRepository = new CapturingStoryNotificationReader();

  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({
      repository: new CapturingRepository(),
      storyNotificationRepository,
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.unseenCutscenes, []);
  assertEquals(storyNotificationRepository.readCalls, 0);
});

Deno.test("player dashboard marks own cutscene delivery seen", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow()];
  seededTables.notification_deliveries = [storyDeliveryRow()];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ action: "mark_cutscene_seen" }),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    delivery: {
      deliveryId: STORY_DELIVERY_ID,
      notificationId: STORY_NOTIFICATION_ID,
      deliveredAt: "2026-06-24T00:12:30.000Z",
      seenAt: "2026-06-25T12:30:00.000Z",
      dismissedAt: null,
      acknowledgedAt: null,
    },
  });
  assertEquals(
    seededTables.notification_deliveries[0]?.seen_at,
    "2026-06-25T12:30:00.000Z",
  );
  assertEquals(seededTables.notification_deliveries[0]?.dismissed_at, null);
  assertEquals(seededTables.notification_deliveries[0]?.acknowledged_at, null);
});

Deno.test("player dashboard marks own cutscene delivery dismissed", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow()];
  seededTables.notification_deliveries = [storyDeliveryRow()];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ action: "mark_cutscene_dismissed" }),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.delivery, {
    deliveryId: STORY_DELIVERY_ID,
    notificationId: STORY_NOTIFICATION_ID,
    deliveredAt: "2026-06-24T00:12:30.000Z",
    seenAt: null,
    dismissedAt: "2026-06-25T12:30:00.000Z",
    acknowledgedAt: null,
  });
  assertEquals(seededTables.notification_deliveries[0]?.seen_at, null);
  assertEquals(
    seededTables.notification_deliveries[0]?.dismissed_at,
    "2026-06-25T12:30:00.000Z",
  );
  assertEquals(seededTables.notification_deliveries[0]?.acknowledged_at, null);
});

Deno.test("player dashboard marks own cutscene delivery acknowledged", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow()];
  seededTables.notification_deliveries = [storyDeliveryRow({
    seen_at: "2026-06-25T12:29:00.000Z",
  })];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ action: "mark_cutscene_acknowledged" }),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.delivery, {
    deliveryId: STORY_DELIVERY_ID,
    notificationId: STORY_NOTIFICATION_ID,
    deliveredAt: "2026-06-24T00:12:30.000Z",
    seenAt: "2026-06-25T12:29:00.000Z",
    dismissedAt: null,
    acknowledgedAt: "2026-06-25T12:30:00.000Z",
  });
  assertEquals(
    seededTables.notification_deliveries[0]?.seen_at,
    "2026-06-25T12:29:00.000Z",
  );
  assertEquals(seededTables.notification_deliveries[0]?.dismissed_at, null);
  assertEquals(
    seededTables.notification_deliveries[0]?.acknowledged_at,
    "2026-06-25T12:30:00.000Z",
  );
});

Deno.test("player dashboard cutscene actions reject missing player session token", async () => {
  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ authToken: null }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player dashboard cutscene actions reject revoked expired or inactive sessions", async () => {
  for (
    const session of [
      playerSession({
        status: "revoked",
        revoked_at: "2026-06-24T00:00:00.000Z",
      }),
      playerSession({ expires_at: "2020-01-01T00:00:00.000Z" }),
      playerSession({ status: "expired" }),
    ]
  ) {
    const response = await handlePlayerGameDashboardRequest(
      cutsceneActionRequest(),
      dependencies({
        client: new FakeClient({ ...tables(), player_sessions: [session] }),
      }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }
});

Deno.test("player dashboard cutscene actions reject mismatched gameSessionId", async () => {
  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ gameSessionId: OTHER_GAME_SESSION_ID }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session_scope");
});

Deno.test("player dashboard cutscene actions reject client-supplied player identity", async () => {
  const withBodyPlayerId = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ bodyOverrides: { playerId: OTHER_PLAYER_ID } }),
    dependencies(),
  );
  const withQueryPlayerId = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    dependencies(),
  );

  await assertErrorResponse(
    withBodyPlayerId,
    400,
    "invalid_game_dashboard_request",
  );
  await assertErrorResponse(
    withQueryPlayerId,
    400,
    "invalid_game_dashboard_request",
  );
});

Deno.test("player dashboard cutscene actions cannot mark another player's delivery", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow()];
  seededTables.notification_deliveries = [storyDeliveryRow({
    player_id: OTHER_PLAYER_ID,
  })];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ action: "mark_cutscene_seen" }),
    dependencies({ client }),
  );

  await assertErrorResponse(
    response,
    404,
    "game_dashboard_cutscene_delivery_not_found",
  );
  assertEquals(seededTables.notification_deliveries[0]?.seen_at, null);
});

Deno.test("player dashboard cutscene actions cannot mark another game's delivery or a missing delivery", async () => {
  for (
    const deliveries of [[], [
      storyDeliveryRow({ game_session_id: OTHER_GAME_SESSION_ID }),
    ]]
  ) {
    const seededTables = tables();
    seededTables.notification_deliveries = deliveries;
    const response = await handlePlayerGameDashboardRequest(
      cutsceneActionRequest(),
      dependencies({ client: new FakeClient(seededTables) }),
    );
    await assertErrorResponse(
      response,
      404,
      "game_dashboard_cutscene_delivery_not_found",
    );
    assertEquals(
      deliveries.map((row) => row.seen_at),
      deliveries.map(() => null),
    );
  }
});

Deno.test("player dashboard constructs Story capability only for authorized delivery actions", async () => {
  let constructions = 0;
  const deps = dependencies({ repository: new CapturingRepository() });
  deps.createStoryNotificationRepository = () => {
    constructions += 1;
    return new CapturingStoryNotificationReader();
  };
  const get = await handlePlayerGameDashboardRequest(request(), deps);
  assertEquals(get.status, 200);
  assertEquals(constructions, 0);
  await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ gameSessionId: OTHER_GAME_SESSION_ID }),
    deps,
  );
  await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ bodyOverrides: { playerId: OTHER_PLAYER_ID } }),
    deps,
  );
  assertEquals(constructions, 0);
  const post = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest(),
    deps,
  );
  assertEquals(post.status, 200);
  assertEquals(constructions, 1);
});
