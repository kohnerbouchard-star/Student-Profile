import {
  PlayerNotificationPersistenceError,
  SupabasePlayerNotificationRepository,
} from "./supabasePlayerNotificationRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000011";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000012";
const DELIVERY_LOW_ID = "00000000-0000-4000-8000-000000000021";
const DELIVERY_HIGH_ID = "00000000-0000-4000-8000-000000000022";
const DELIVERY_OLDER_ID = "00000000-0000-4000-8000-000000000023";
const NOTIFICATION_LOW_ID = "00000000-0000-4000-8000-000000000031";
const NOTIFICATION_HIGH_ID = "00000000-0000-4000-8000-000000000032";
const NOTIFICATION_OLDER_ID = "00000000-0000-4000-8000-000000000033";
const DELIVERED_AT = "2026-07-17T08:00:00.000Z";
const NOW = "2026-07-17T09:00:00.000Z";

Deno.test("notification repository lists scoped unread deliveries with stable cursor pagination", async () => {
  const client = new FakeClient({
    notification_deliveries: [
      deliveryRow(DELIVERY_LOW_ID, NOTIFICATION_LOW_ID),
      deliveryRow(DELIVERY_HIGH_ID, NOTIFICATION_HIGH_ID),
      deliveryRow(DELIVERY_OLDER_ID, NOTIFICATION_OLDER_ID, {
        delivered_at: "2026-07-17T07:00:00.000Z",
      }),
      deliveryRow(
        "00000000-0000-4000-8000-000000000024",
        NOTIFICATION_HIGH_ID,
        { seen_at: NOW },
      ),
      deliveryRow(
        "00000000-0000-4000-8000-000000000025",
        NOTIFICATION_HIGH_ID,
        { dismissed_at: NOW },
      ),
      deliveryRow(
        "00000000-0000-4000-8000-000000000026",
        NOTIFICATION_HIGH_ID,
        { player_id: OTHER_PLAYER_ID },
      ),
      deliveryRow(
        "00000000-0000-4000-8000-000000000027",
        NOTIFICATION_HIGH_ID,
        { game_session_id: OTHER_GAME_SESSION_ID },
      ),
    ],
    notifications: [
      notificationRow(NOTIFICATION_LOW_ID, { title: "Low ID" }),
      notificationRow(NOTIFICATION_HIGH_ID, { title: "High ID" }),
      notificationRow(NOTIFICATION_OLDER_ID, { title: "Older" }),
    ],
  });
  const repository = new SupabasePlayerNotificationRepository(client as never);
  const first = await repository.listPlayerNotifications({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    status: "unread",
    limit: 1,
    cursor: null,
  });

  assertEquals(first.records.map((record) => record.deliveryId), [
    DELIVERY_HIGH_ID,
  ]);
  assertEquals(first.records[0]?.title, "High ID");
  assertEquals(first.hasMore, true);
  assertEquals(first.nextCursor, {
    deliveredAt: DELIVERED_AT,
    deliveryId: DELIVERY_HIGH_ID,
  });

  const second = await repository.listPlayerNotifications({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    status: "unread",
    limit: 1,
    cursor: first.nextCursor,
  });

  assertEquals(second.records.map((record) => record.deliveryId), [
    DELIVERY_LOW_ID,
  ]);
  assertEquals(second.hasMore, true);
  assertEquals(
    client.selectCalls
      .filter((call) => call.tableName === "notifications")
      .every((call) => !call.columns.includes("payload")),
    true,
  );
});

Deno.test("notification repository applies read, dismissed, and all status filters", async () => {
  const unreadId = DELIVERY_LOW_ID;
  const readId = DELIVERY_HIGH_ID;
  const dismissedId = DELIVERY_OLDER_ID;
  const client = new FakeClient({
    notification_deliveries: [
      deliveryRow(unreadId, NOTIFICATION_LOW_ID),
      deliveryRow(readId, NOTIFICATION_HIGH_ID, { seen_at: NOW }),
      deliveryRow(dismissedId, NOTIFICATION_OLDER_ID, {
        dismissed_at: NOW,
      }),
    ],
    notifications: [
      notificationRow(NOTIFICATION_LOW_ID),
      notificationRow(NOTIFICATION_HIGH_ID),
      notificationRow(NOTIFICATION_OLDER_ID),
    ],
  });
  const repository = new SupabasePlayerNotificationRepository(client as never);

  const read = await repository.listPlayerNotifications(
    listInput("read"),
  );
  const dismissed = await repository.listPlayerNotifications(
    listInput("dismissed"),
  );
  const all = await repository.listPlayerNotifications(listInput("all"));

  assertEquals(read.records.map((record) => record.deliveryId), [readId]);
  assertEquals(dismissed.records.map((record) => record.deliveryId), [
    dismissedId,
  ]);
  assertEquals(
    new Set(all.records.map((record) => record.deliveryId)),
    new Set([
      unreadId,
      readId,
      dismissedId,
    ]),
  );
});

Deno.test("notification repository reads and conditionally marks only scoped unseen deliveries", async () => {
  const client = new FakeClient({
    notification_deliveries: [
      deliveryRow(DELIVERY_LOW_ID, NOTIFICATION_LOW_ID),
      deliveryRow(DELIVERY_HIGH_ID, NOTIFICATION_HIGH_ID, { seen_at: NOW }),
      deliveryRow(DELIVERY_OLDER_ID, NOTIFICATION_OLDER_ID, {
        player_id: OTHER_PLAYER_ID,
      }),
    ],
    notifications: [],
  });
  const repository = new SupabasePlayerNotificationRepository(client as never);
  const existing = await repository.readPlayerDeliveriesByIds({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    deliveryIds: [DELIVERY_LOW_ID, DELIVERY_HIGH_ID, DELIVERY_OLDER_ID],
  });

  assertEquals(existing.map((record) => record.deliveryId), [
    DELIVERY_LOW_ID,
    DELIVERY_HIGH_ID,
  ]);

  const updated = await repository.markPlayerDeliveriesRead({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    deliveryIds: [DELIVERY_LOW_ID, DELIVERY_HIGH_ID, DELIVERY_OLDER_ID],
    seenAt: NOW,
  });

  assertEquals(updated.map((record) => record.deliveryId), [DELIVERY_LOW_ID]);
  assertEquals(updated[0]?.seenAt, NOW);

  const replay = await repository.markPlayerDeliveriesRead({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    deliveryIds: [DELIVERY_LOW_ID, DELIVERY_HIGH_ID],
    seenAt: "2026-07-17T09:05:00.000Z",
  });

  assertEquals(replay, []);
  assertEquals(
    client.tables.notification_deliveries.find((row) =>
      row.id === DELIVERY_LOW_ID
    )?.seen_at,
    NOW,
  );
  assertEquals(client.lastUpdateFilters, [
    ["game_session_id", GAME_SESSION_ID, "eq"],
    ["player_id", PLAYER_ID, "eq"],
    ["id", [DELIVERY_LOW_ID, DELIVERY_HIGH_ID], "in"],
    ["seen_at", null, "is"],
  ]);
});

Deno.test("notification repository fails closed when notification metadata is missing", async () => {
  const repository = new SupabasePlayerNotificationRepository(
    new FakeClient({
      notification_deliveries: [
        deliveryRow(DELIVERY_LOW_ID, NOTIFICATION_LOW_ID),
      ],
      notifications: [],
    }) as never,
  );
  let error: unknown;

  try {
    await repository.listPlayerNotifications(listInput("unread"));
  } catch (caught) {
    error = caught;
  }

  assertEquals(error instanceof PlayerNotificationPersistenceError, true);
  assertEquals(
    (error as PlayerNotificationPersistenceError).code,
    "player_notification_metadata_missing",
  );
});

interface FakeTables {
  readonly notifications: Record<string, unknown>[];
  readonly notification_deliveries: Record<string, unknown>[];
}

type FakeTableName = keyof FakeTables;
type FilterOperator = "eq" | "in" | "is" | "not" | "or";
type FakeOperation = "select" | "update";

class FakeClient {
  readonly tables: FakeTables;
  readonly selectCalls: {
    readonly tableName: FakeTableName;
    readonly columns: string;
  }[] = [];
  lastUpdateFilters: readonly (readonly [string, unknown, FilterOperator])[] =
    [];

  constructor(tables: FakeTables) {
    this.tables = {
      notifications: tables.notifications.map((row) => ({ ...row })),
      notification_deliveries: tables.notification_deliveries.map((row) => ({
        ...row,
      })),
    };
  }

  from(tableName: FakeTableName): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }
}

class FakeQueryBuilder
  implements PromiseLike<{ readonly data: unknown[]; readonly error: null }> {
  private readonly filters: [string, unknown, FilterOperator][] = [];
  private readonly orderings: [string, boolean][] = [];
  private operation: FakeOperation = "select";
  private updateValues: Record<string, unknown> | null = null;
  private limitCount: number | null = null;

  constructor(
    private readonly client: FakeClient,
    private readonly tableName: FakeTableName,
  ) {}

  select(columns: string): FakeQueryBuilder {
    this.client.selectCalls.push({ tableName: this.tableName, columns });
    return this;
  }

  update(values: unknown): FakeQueryBuilder {
    this.operation = "update";
    this.updateValues = values as Record<string, unknown>;
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push([column, value, "eq"]);
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    this.filters.push([column, values, "in"]);
    return this;
  }

  is(column: string, value: null): FakeQueryBuilder {
    this.filters.push([column, value, "is"]);
    return this;
  }

  not(column: string, _operator: string, value: unknown): FakeQueryBuilder {
    this.filters.push([column, value, "not"]);
    return this;
  }

  or(filters: string): FakeQueryBuilder {
    this.filters.push(["$or", filters, "or"]);
    return this;
  }

  order(
    column: string,
    options: { readonly ascending?: boolean } = {},
  ): FakeQueryBuilder {
    this.orderings.push([column, options.ascending ?? true]);
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.limitCount = count;
    return this;
  }

  then<
    TResult1 = { readonly data: unknown[]; readonly error: null },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
        value: { readonly data: unknown[]; readonly error: null },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    readonly data: unknown[];
    readonly error: null;
  }> {
    let rows = [...this.client.tables[this.tableName]];

    for (const [column, value, operator] of this.filters) {
      if (operator === "or") {
        rows = rows.filter((row) => applyCursorFilter(row, String(value)));
      } else if (operator === "in") {
        rows = rows.filter((row) =>
          (value as readonly unknown[]).includes(row[column])
        );
      } else if (operator === "not") {
        rows = rows.filter((row) => row[column] !== value);
      } else {
        rows = rows.filter((row) => row[column] === value);
      }
    }

    for (const [column, ascending] of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const comparison = String(left[column]).localeCompare(
          String(right[column]),
        );
        return ascending ? comparison : -comparison;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    if (this.operation === "update" && this.updateValues) {
      this.client.lastUpdateFilters = [...this.filters];

      for (const row of rows) {
        const source = this.client.tables[this.tableName].find((candidate) =>
          candidate.id === row.id
        );

        if (source) {
          Object.assign(source, this.updateValues);
          Object.assign(row, this.updateValues);
        }
      }
    }

    return { data: rows, error: null };
  }
}

function applyCursorFilter(
  row: Record<string, unknown>,
  filter: string,
): boolean {
  const match = filter.match(
    /^delivered_at\.lt\.([^,]+),and\(delivered_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/u,
  );

  if (!match) {
    throw new Error(`Unexpected cursor filter: ${filter}`);
  }

  const [, before, equal, beforeId] = match;
  const deliveredAt = String(row.delivered_at);

  return deliveredAt < (before ?? "") ||
    (deliveredAt === equal && String(row.id) < (beforeId ?? ""));
}

function listInput(status: "unread" | "read" | "dismissed" | "all") {
  return {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    status,
    limit: 10,
    cursor: null,
  } as const;
}

function deliveryRow(
  id: string,
  notificationId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    notification_id: notificationId,
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    delivered_at: DELIVERED_AT,
    seen_at: null,
    dismissed_at: null,
    acknowledged_at: null,
    ...overrides,
  };
}

function notificationRow(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    game_session_id: GAME_SESSION_ID,
    source_type: "storyline_event",
    source_id: "event-1",
    notification_type: "story_impact",
    title: "Notification",
    summary: "Notification summary.",
    priority: "normal",
    display_mode: "notification_only",
    payload: { internal: "must-not-be-selected" },
    published_at: "2026-07-17T07:59:00.000Z",
    ...overrides,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual instanceof Set && expected instanceof Set) {
    actual = [...actual].sort();
    expected = [...expected].sort();
  }

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
