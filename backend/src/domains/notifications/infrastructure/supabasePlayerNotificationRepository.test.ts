import { SupabasePlayerNotificationRepository } from "./supabasePlayerNotificationRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const DELIVERY_UUID = "00000000-0000-4000-8000-000000000101";
const NOTIFICATION_UUID = "00000000-0000-4000-8000-000000000201";
const PUBLIC_DELIVERY = "ndl_00000000000000000000000000000001";
const PUBLIC_NOTIFICATION = "ntf_00000000000000000000000000000001";
const NOW = "2026-07-18T08:00:00.000Z";

Deno.test("notification repository joins scoped deliveries to public notification metadata", async () => {
  const repository = new SupabasePlayerNotificationRepository(client({
    notification_deliveries: [[deliveryRow(null)]],
    notifications: [[notificationRow()]],
  }) as never);

  const records = await repository.listNotifications({
    gameId: GAME,
    playerUuid: PLAYER,
    status: "unread",
    limit: 21,
    cursor: null,
  });

  assertEquals(records[0].publicDeliveryId, PUBLIC_DELIVERY);
  assertEquals(records[0].publicNotificationId, PUBLIC_NOTIFICATION);
  assertEquals(records[0].title, "Briefing");
});

Deno.test("notification repository resolves and updates public delivery IDs", async () => {
  const repository = new SupabasePlayerNotificationRepository(client({
    notification_deliveries: [
      [deliveryRow(null)],
      [deliveryRow(NOW)],
    ],
    notifications: [
      [notificationIdentityRow()],
      [notificationIdentityRow()],
    ],
  }, [deliveryRow(NOW)]) as never);

  const read = await repository.readDeliveriesByPublicIds({
    gameId: GAME,
    playerUuid: PLAYER,
    publicDeliveryIds: [PUBLIC_DELIVERY],
  });
  assertEquals(read[0].publicNotificationId, PUBLIC_NOTIFICATION);

  const updated = await repository.markDeliveriesRead({
    gameId: GAME,
    playerUuid: PLAYER,
    publicDeliveryIds: [PUBLIC_DELIVERY],
    seenAt: NOW,
  });
  assertEquals(updated[0].seenAt, NOW);
});

Deno.test("notification repository maps missing schema failures", async () => {
  const repository = new SupabasePlayerNotificationRepository(client({
    notification_deliveries: [],
    notifications: [],
  }, [], { code: "42703", message: "column does not exist" }) as never);

  await assertRejects(() => repository.listNotifications({
    gameId: GAME,
    playerUuid: PLAYER,
    status: "unread",
    limit: 21,
    cursor: null,
  }), "player_notification_schema_not_applied");
});

function deliveryRow(seenAt: string | null) {
  return {
    id: DELIVERY_UUID,
    public_delivery_id: PUBLIC_DELIVERY,
    notification_id: NOTIFICATION_UUID,
    game_session_id: GAME,
    player_id: PLAYER,
    delivered_at: NOW,
    seen_at: seenAt,
    dismissed_at: null,
    acknowledged_at: null,
  };
}

function notificationRow() {
  return {
    ...notificationIdentityRow(),
    source_type: "story",
    notification_type: "briefing",
    title: "Briefing",
    summary: "Update",
    priority: "normal",
    display_mode: "inbox",
    published_at: NOW,
  };
}

function notificationIdentityRow() {
  return {
    id: NOTIFICATION_UUID,
    public_notification_id: PUBLIC_NOTIFICATION,
    game_session_id: GAME,
  };
}

function client(
  selectResponses: Record<string, readonly (readonly Record<string, unknown>[])[]>,
  updateResponse: readonly Record<string, unknown>[] = [],
  failure?: { readonly code?: string; readonly message: string },
) {
  const offsets = new Map<string, number>();
  return {
    from(tableName: string) {
      return {
        select() {
          if (failure) return new FakeFilter({ data: null, error: failure });
          const index = offsets.get(tableName) ?? 0;
          offsets.set(tableName, index + 1);
          return new FakeFilter({
            data: selectResponses[tableName]?.[index] ?? [],
            error: null,
          });
        },
        update() {
          return new FakeUpdate({ data: updateResponse, error: null });
        },
      };
    },
  };
}

class FakeFilter implements PromiseLike<ResponseShape> {
  constructor(private readonly response: ResponseShape) {}
  eq(): FakeFilter { return this; }
  in(): FakeFilter { return this; }
  is(): FakeFilter { return this; }
  not(): FakeFilter { return this; }
  or(): FakeFilter { return this; }
  order(): FakeFilter { return this; }
  limit(): FakeFilter { return this; }
  then<TResult1 = ResponseShape, TResult2 = never>(
    onfulfilled?: ((value: ResponseShape) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

class FakeUpdate implements PromiseLike<ResponseShape> {
  constructor(private readonly response: ResponseShape) {}
  eq(): FakeUpdate { return this; }
  in(): FakeUpdate { return this; }
  is(): FakeUpdate { return this; }
  select(): FakeUpdate { return this; }
  then<TResult1 = ResponseShape, TResult2 = never>(
    onfulfilled?: ((value: ResponseShape) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

type ResponseShape = {
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error: { readonly message: string; readonly code?: string } | null;
};

async function assertRejects(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    if ((error as { code?: string }).code === code) return;
    throw error;
  }
  throw new Error(`Expected ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
