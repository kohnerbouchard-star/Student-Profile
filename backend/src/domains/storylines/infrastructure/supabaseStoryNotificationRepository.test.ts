import { SupabaseStoryNotificationRepository } from "./supabaseStoryNotificationRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story notification repository creates notification and returns existing on source conflict", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStoryNotificationRepository(client as never);
  const input = notificationInput("event-1", "major");

  const inserted = await repository.createStoryNotification(input);
  const existing = await repository.createStoryNotification(input);

  assertEquals(inserted.status, "inserted");
  assertEquals(existing.status, "existing");
  assertEquals(inserted.notification.id, existing.notification.id);
  assertEquals(client.tables.notifications.length, 1);
  assertEquals(
    client.tables.notifications[0]?.notification_type,
    "story_cutscene",
  );
  assertEquals(
    client.tables.notifications[0]?.display_mode,
    "modal_on_next_login",
  );
});

Deno.test("story notification repository creates deliveries without duplicating notification/player rows", async () => {
  const client = new FakeClient(baseTables());
  client.tables.notifications.push(notificationRow({
    id: "notification-1",
    source_id: "event-1",
  }));
  const repository = new SupabaseStoryNotificationRepository(client as never);

  const first = await repository.createNotificationDeliveries({
    notificationId: "notification-1",
    gameSessionId: "game-1",
    playerIds: ["player-1", "player-2", "player-1"],
    deliveredAt: "2026-06-25T12:00:00.000Z",
  });
  const second = await repository.createNotificationDeliveries({
    notificationId: "notification-1",
    gameSessionId: "game-1",
    playerIds: ["player-2", "player-3"],
    deliveredAt: "2026-06-25T12:01:00.000Z",
  });

  assertEquals(first.insertedCount, 2);
  assertEquals(first.existingCount, 0);
  assertEquals(second.insertedCount, 1);
  assertEquals(second.existingCount, 1);
  assertEquals(client.tables.notification_deliveries.length, 3);
  assertEquals(second.deliveryIds, [
    "notification_deliveries-2",
    "notification_deliveries-3",
  ]);
});

Deno.test("story notification repository lists unseen modal story cutscene deliveries by priority then publish time", async () => {
  const client = new FakeClient(baseTables());
  client.tables.notifications.push(
    notificationRow({
      id: "low-newer",
      source_id: "event-low",
      priority: "low",
      published_at: "2026-06-25T12:05:00.000Z",
    }),
    notificationRow({
      id: "critical-older",
      source_id: "event-critical",
      priority: "critical",
      published_at: "2026-06-25T12:01:00.000Z",
    }),
    notificationRow({
      id: "major-newer",
      source_id: "event-major",
      priority: "major",
      published_at: "2026-06-25T12:10:00.000Z",
    }),
    notificationRow({
      id: "notification-only",
      source_id: "event-notification-only",
      display_mode: "notification_only",
      priority: "critical",
    }),
    notificationRow({
      id: "impact",
      source_id: "event-impact",
      notification_type: "story_impact",
      priority: "critical",
    }),
  );
  client.tables.notification_deliveries.push(
    deliveryRow("delivery-low", "low-newer", "player-1"),
    deliveryRow("delivery-critical", "critical-older", "player-1"),
    deliveryRow("delivery-major", "major-newer", "player-1"),
    deliveryRow("delivery-notification-only", "notification-only", "player-1"),
    deliveryRow("delivery-impact", "impact", "player-1"),
    deliveryRow("delivery-seen", "major-newer", "player-1", {
      seen_at: "2026-06-25T12:20:00.000Z",
    }),
    deliveryRow("delivery-dismissed", "major-newer", "player-1", {
      dismissed_at: "2026-06-25T12:20:00.000Z",
    }),
    deliveryRow("delivery-other-player", "critical-older", "player-2"),
  );
  const repository = new SupabaseStoryNotificationRepository(client as never);

  const rows = await repository.listUnseenStoryCutsceneDeliveries({
    gameSessionId: "game-1",
    playerId: "player-1",
  });

  assertEquals(rows.map((row) => row.id), [
    "delivery-critical",
    "delivery-major",
    "delivery-low",
  ]);
  assertEquals(rows[0]?.notification.priority, "critical");
  assertEquals(rows[0]?.seenAt, null);
  assertEquals(rows[0]?.dismissedAt, null);
});

Deno.test("story notification repository marks delivery seen dismissed and acknowledged", async () => {
  const client = new FakeClient(baseTables());
  client.tables.notifications.push(notificationRow({
    id: "notification-1",
    source_id: "event-1",
  }));
  client.tables.notification_deliveries.push(
    deliveryRow("delivery-1", "notification-1", "player-1"),
  );
  const repository = new SupabaseStoryNotificationRepository(client as never);
  const baseInput = {
    deliveryId: "delivery-1",
    gameSessionId: "game-1",
    playerId: "player-1",
  };

  const seen = await repository.markNotificationDeliverySeen({
    ...baseInput,
    markedAt: "2026-06-25T12:10:00.000Z",
  });
  const dismissed = await repository.markNotificationDeliveryDismissed({
    ...baseInput,
    markedAt: "2026-06-25T12:11:00.000Z",
  });
  const acknowledged = await repository.markNotificationDeliveryAcknowledged({
    ...baseInput,
    markedAt: "2026-06-25T12:12:00.000Z",
  });

  assertEquals(seen.seenAt, "2026-06-25T12:10:00.000Z");
  assertEquals(dismissed.dismissedAt, "2026-06-25T12:11:00.000Z");
  assertEquals(acknowledged.acknowledgedAt, "2026-06-25T12:12:00.000Z");
  assertEquals(
    client.tables.notification_deliveries[0]?.seen_at,
    "2026-06-25T12:10:00.000Z",
  );
  assertEquals(
    client.tables.notification_deliveries[0]?.dismissed_at,
    "2026-06-25T12:11:00.000Z",
  );
  assertEquals(
    client.tables.notification_deliveries[0]?.acknowledged_at,
    "2026-06-25T12:12:00.000Z",
  );
});

interface FakeTables {
  readonly notifications: Record<string, unknown>[];
  readonly notification_deliveries: Record<string, unknown>[];
}

type FakeTableName = keyof FakeTables;
type FakeOperation = "select" | "insert" | "update";

class FakeClient {
  readonly tables: FakeTables;

  constructor(tables: FakeTables) {
    this.tables = tables;
  }

  from(tableName: FakeTableName): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables, tableName);
  }
}

class FakeQueryBuilder {
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
    readonly operator: "eq" | "in" | "is";
  }[] = [];
  private operation: FakeOperation = "select";
  private writeValues: Record<string, unknown> | null = null;
  private writeError: FakeQueryError | null = null;

  constructor(
    private readonly tables: FakeTables,
    private readonly tableName: FakeTableName,
  ) {}

  select(_columns: string): FakeQueryBuilder {
    return this;
  }

  insert(row: unknown): FakeQueryBuilder {
    this.operation = "insert";
    this.writeValues = row as Record<string, unknown>;

    if (this.isDuplicateInsert(this.writeValues)) {
      this.writeError = {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      };
      this.writeValues = null;
    }

    return this;
  }

  update(row: unknown): FakeQueryBuilder {
    this.operation = "update";
    this.writeValues = row as Record<string, unknown>;
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ column, value, operator: "eq" });
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    this.filters.push({ column, value: values, operator: "in" });
    return this;
  }

  is(column: string, value: null): FakeQueryBuilder {
    this.filters.push({ column, value, operator: "is" });
    return this;
  }

  order(
    _column: string,
    _options?: { readonly ascending?: boolean },
  ): FakeQueryBuilder {
    return this;
  }

  maybeSingle(): Promise<FakeResponse<unknown>> {
    if (this.operation === "insert") {
      return Promise.resolve(this.insertRow());
    }

    if (this.operation === "update") {
      return Promise.resolve(
        this.updateRows()[0] ?? { data: null, error: null },
      );
    }

    return Promise.resolve({
      data: this.readRows()[0] ?? null,
      error: null,
    });
  }

  then<TResult1 = FakeResponse<unknown[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResponse<unknown[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    _onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.readRows(),
      error: null,
    }).then(onfulfilled ?? undefined);
  }

  private readRows(): Record<string, unknown>[] {
    let rows = [...this.tables[this.tableName]];

    for (const filter of this.filters) {
      if (filter.operator === "eq") {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      } else if (filter.operator === "in") {
        const values = filter.value as readonly unknown[];
        rows = rows.filter((row) => values.includes(row[filter.column]));
      } else {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      }
    }

    return rows;
  }

  private insertRow(): FakeResponse<unknown> {
    if (this.writeError) {
      return {
        data: null,
        error: this.writeError,
      };
    }

    const stored = {
      ...this.writeValues,
      id: `${this.tableName}-${this.tables[this.tableName].length + 1}`,
    };
    this.tables[this.tableName].push(stored);

    return {
      data: stored,
      error: null,
    };
  }

  private updateRows(): FakeResponse<unknown>[] {
    const rows = this.readRows();

    for (const row of rows) {
      Object.assign(row, this.writeValues);
    }

    return rows.map((row) => ({
      data: row,
      error: null,
    }));
  }

  private isDuplicateInsert(row: Record<string, unknown>): boolean {
    if (this.tableName === "notifications") {
      return row.source_id !== null &&
        this.tables.notifications.some((existing) =>
          existing.game_session_id === row.game_session_id &&
          existing.source_type === row.source_type &&
          existing.source_id === row.source_id &&
          existing.notification_type === row.notification_type
        );
    }

    return this.tables.notification_deliveries.some((existing) =>
      existing.notification_id === row.notification_id &&
      existing.player_id === row.player_id
    );
  }
}

interface FakeResponse<T> {
  readonly data: T | null;
  readonly error: FakeQueryError | null;
}

interface FakeQueryError {
  readonly message: string;
  readonly code?: string;
}

function baseTables(): FakeTables {
  return {
    notifications: [],
    notification_deliveries: [],
  };
}

function notificationInput(sourceId: string, priority: string) {
  return {
    gameSessionId: "game-1",
    sourceType: "storyline_event",
    sourceId,
    notificationType: "story_cutscene" as const,
    title: "Cutscene",
    summary: "A story cutscene.",
    priority: priority as "major",
    displayMode: "modal_on_next_login" as const,
    payload: {
      videoAssetKey: "cutscene-1",
    },
    publishedAt: "2026-06-25T12:00:00.000Z",
  };
}

function notificationRow(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: "notification-1",
    game_session_id: "game-1",
    source_type: "storyline_event",
    source_id: "event-1",
    notification_type: "story_cutscene",
    title: "Cutscene",
    summary: "A story cutscene.",
    priority: "major",
    display_mode: "modal_on_next_login",
    payload: {},
    published_at: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

function deliveryRow(
  id: string,
  notificationId: string,
  playerId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    notification_id: notificationId,
    game_session_id: "game-1",
    player_id: playerId,
    delivered_at: "2026-06-25T12:00:00.000Z",
    seen_at: null,
    dismissed_at: null,
    acknowledged_at: null,
    ...overrides,
  };
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
