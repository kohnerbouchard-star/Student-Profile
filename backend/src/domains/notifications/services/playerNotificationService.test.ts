import {
  type PlayerNotificationDeliveryStateRecord,
  PlayerNotificationPersistenceError,
  type PlayerNotificationRecord,
  type PlayerNotificationRepository,
} from "../contracts/playerNotificationContracts.ts";
import { PlayerNotificationService } from "./playerNotificationService.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = "2026-07-18T08:00:00.000Z";
const DELIVERY_A = "ndl_00000000000000000000000000000001";
const DELIVERY_B = "ndl_00000000000000000000000000000002";
const NOTIFICATION_A = "ntf_00000000000000000000000000000001";
const NOTIFICATION_B = "ntf_00000000000000000000000000000002";

Deno.test("notification service returns bounded UUID-private pages", async () => {
  const service = new PlayerNotificationService(repository({
    list: [
      notification({
        publicDeliveryId: DELIVERY_A,
        publicNotificationId: NOTIFICATION_A,
        deliveredAt: "2026-07-18T08:00:00.000Z",
      }),
      notification({
        publicDeliveryId: DELIVERY_B,
        publicNotificationId: NOTIFICATION_B,
        deliveredAt: "2026-07-18T07:00:00.000Z",
      }),
    ],
  }));

  const result = await service.listNotifications(
    scope(),
    { status: "unread", limit: 1, cursor: null },
  );

  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].id, DELIVERY_A);
  assertEquals(result.items[0].notificationId, NOTIFICATION_A);
  assertEquals(result.hasMore, true);
  assertEquals(result.nextCursor, {
    deliveredAt: "2026-07-18T08:00:00.000Z",
    publicDeliveryId: DELIVERY_A,
  });
  assertNoUuid(JSON.stringify(result));
});

Deno.test("notification service distinguishes empty and unavailable reads", async () => {
  const empty = await new PlayerNotificationService(repository({ list: [] }))
    .listNotifications(scope(), { status: "unread", limit: 20, cursor: null });
  assertEquals(empty.items, []);
  assertEquals(empty.hasMore, false);

  await assertRejects(
    () => new PlayerNotificationService({
      ...repository({}),
      listNotifications: () => Promise.reject(
        new PlayerNotificationPersistenceError(
          "player_notification_read_failed",
          "unavailable",
        ),
      ),
    }).listNotifications(scope(), { status: "unread", limit: 20, cursor: null }),
    "player_notification_service_unavailable",
  );
});

Deno.test("notification service reports the exact unread total independently from page size", async () => {
  const service = new PlayerNotificationService({
    ...repository({ list: [] }),
    countUnreadNotifications: () => Promise.resolve(17),
  });
  const result = await service.listNotifications(
    scope(),
    { status: "all", limit: 1, cursor: null },
  );
  assertEquals(result.unreadCount, 17);
});

Deno.test("notification read acknowledgement is idempotent and ordered", async () => {
  const existing = [
    delivery({ publicDeliveryId: DELIVERY_A, publicNotificationId: NOTIFICATION_A }),
    delivery({
      publicDeliveryId: DELIVERY_B,
      publicNotificationId: NOTIFICATION_B,
      seenAt: "2026-07-18T06:00:00.000Z",
    }),
  ];
  const repo = statefulRepository(existing);
  const result = await new PlayerNotificationService(repo).markNotificationsRead(
    scope(),
    { publicDeliveryIds: [DELIVERY_B, DELIVERY_A] },
  );

  assertEquals(result.requestedCount, 2);
  assertEquals(result.newlyReadCount, 1);
  assertEquals(result.alreadyReadCount, 1);
  assertEquals(result.deliveries.map((item) => item.deliveryId), [DELIVERY_B, DELIVERY_A]);
  assertEquals(result.deliveries[1].seenAt, NOW);
  assertNoUuid(JSON.stringify(result));
});

Deno.test("notification service fails closed for missing and cross-scope deliveries", async () => {
  await assertRejects(
    () => new PlayerNotificationService(repository({ read: [] }))
      .markNotificationsRead(scope(), { publicDeliveryIds: [DELIVERY_A] }),
    "player_notification_deliveries_not_found",
  );

  await assertRejects(
    () => new PlayerNotificationService(repository({
      list: [notification({ gameId: "00000000-0000-4000-8000-000000000002" })],
    })).listNotifications(scope(), { status: "unread", limit: 20, cursor: null }),
    "player_notification_scope_violation",
  );
});

function scope() {
  return { gameId: GAME, playerUuid: PLAYER, effectiveAt: NOW };
}

function repository(options: {
  readonly list?: readonly PlayerNotificationRecord[];
  readonly read?: readonly PlayerNotificationDeliveryStateRecord[];
  readonly updated?: readonly PlayerNotificationDeliveryStateRecord[];
}): PlayerNotificationRepository {
  return {
    listNotifications: () => Promise.resolve(options.list ?? []),
    readDeliveriesByPublicIds: () => Promise.resolve(options.read ?? []),
    markDeliveriesRead: () => Promise.resolve(options.updated ?? []),
  };
}

function statefulRepository(
  initial: readonly PlayerNotificationDeliveryStateRecord[],
): PlayerNotificationRepository {
  let values = initial.map((item) => ({ ...item }));
  return {
    listNotifications: () => Promise.resolve([]),
    readDeliveriesByPublicIds: (input) => Promise.resolve(
      values.filter((item) => input.publicDeliveryIds.includes(item.publicDeliveryId)),
    ),
    markDeliveriesRead: (input) => {
      const changed: PlayerNotificationDeliveryStateRecord[] = [];
      values = values.map((item) => {
        if (
          input.publicDeliveryIds.includes(item.publicDeliveryId) &&
          item.seenAt === null
        ) {
          const next = { ...item, seenAt: input.seenAt };
          changed.push(next);
          return next;
        }
        return item;
      });
      return Promise.resolve(changed);
    },
  };
}

function notification(options: {
  readonly publicDeliveryId?: string;
  readonly publicNotificationId?: string;
  readonly deliveredAt?: string;
  readonly gameId?: string;
} = {}): PlayerNotificationRecord {
  return {
    internalDeliveryUuid: "00000000-0000-4000-8000-000000000101",
    internalNotificationUuid: "00000000-0000-4000-8000-000000000201",
    publicDeliveryId: options.publicDeliveryId ?? DELIVERY_A,
    publicNotificationId: options.publicNotificationId ?? NOTIFICATION_A,
    gameId: options.gameId ?? GAME,
    playerUuid: PLAYER,
    sourceType: "story",
    notificationType: "briefing",
    title: "Briefing",
    summary: "Update",
    priority: "normal",
    displayMode: "inbox",
    publishedAt: "2026-07-18T07:30:00.000Z",
    deliveredAt: options.deliveredAt ?? NOW,
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
  };
}

function delivery(options: {
  readonly publicDeliveryId?: string;
  readonly publicNotificationId?: string;
  readonly seenAt?: string | null;
} = {}): PlayerNotificationDeliveryStateRecord {
  return {
    internalDeliveryUuid: options.publicDeliveryId === DELIVERY_B
      ? "00000000-0000-4000-8000-000000000102"
      : "00000000-0000-4000-8000-000000000101",
    internalNotificationUuid: options.publicNotificationId === NOTIFICATION_B
      ? "00000000-0000-4000-8000-000000000202"
      : "00000000-0000-4000-8000-000000000201",
    publicDeliveryId: options.publicDeliveryId ?? DELIVERY_A,
    publicNotificationId: options.publicNotificationId ?? NOTIFICATION_A,
    gameId: GAME,
    playerUuid: PLAYER,
    deliveredAt: NOW,
    seenAt: options.seenAt ?? null,
    dismissedAt: null,
    acknowledgedAt: null,
  };
}

async function assertRejects(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if ((error as { code?: string }).code === code) return;
    throw error;
  }
  throw new Error(`Expected ${code}.`);
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
