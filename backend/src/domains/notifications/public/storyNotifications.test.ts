import { createStoryNotificationPublisher } from "./storyNotifications.ts";
import type { StoryNotificationPublisher } from "./storyNotifications.ts";
import { createStoryCutsceneNotificationForPlayers } from "../../storylines/services/storyNotificationService.ts";

declare const Deno: {
  test(name: string, run: () => Promise<void>): void;
};

type Row = Record<string, unknown>;
type Factory = (client: FixtureClient) => StoryNotificationPublisher;
const publicPublisher: Factory = (client) =>
  createStoryNotificationPublisher(client as never);
const now = "2026-10-04T00:00:00.000Z";

for (
  const [failure, rows, counts, table] of [
    [null, [1, 2], [0, 2], null],
    ["notification", [0, 0], [2, 0], "notifications"],
    ["player-2", [1, 1], [1, 1], "notification_deliveries"],
  ] as const
) {
  Deno.test(`public Story publisher preserves writes/retry after ${failure}`, async () => {
    const actual = await exercise(publicPublisher, failure);
    equal(actual.afterFirst, rows);
    equal(
      actual.first,
      table
        ? {
          code: "story_notification_repository_query_failed",
          tableName: table,
          operation: "insert",
        }
        : receipt(2, 0),
    );
    equal(actual.retry, receipt(counts[0], counts[1]));
    equal(actual.replay, receipt(0, 2));
    equal(actual.rows.notifications.length, 2);
    equal(
      actual.rows.notification_deliveries.map((
        row,
      ) => [row.game_session_id, row.player_id]),
      [
        ["game-1", "player-1"],
        ["game-1", "player-2"],
        ["game-2", "player-1"],
        ["game-2", "player-2"],
      ],
    );
    equal(actual.rows.notifications[0].payload, {
      viewRoute: "intel",
      storylineEventId: "event-1",
      videoAssetKey: "video-1",
      posterAssetKey: null,
      requiresAcknowledgement: true,
    });
    // Later retries do not replace the first delivery time or existing read state.
    equal(actual.rows.notification_deliveries[0].delivered_at, now);
    equal(actual.rows.notification_deliveries[0].seen_at, now);
  });
}

async function exercise(factory: Factory, failure: string | null) {
  const client = new FixtureClient(failure);
  const repository = factory(client);
  const first = await publish(repository);
  const afterFirst = [
    client.rows.notifications.length,
    client.rows.notification_deliveries.length,
  ];
  const retry = await publish(repository);
  client.rows.notification_deliveries[0].seen_at = now;
  const replay = await publish(
    repository,
    "game-1",
    "2026-10-05T00:00:00.000Z",
  );
  await publish(repository, "game-2");
  return {
    first,
    afterFirst,
    retry,
    replay,
    rows: client.rows,
    trace: client.trace,
  };
}

function input(
  repository: StoryNotificationPublisher,
  gameSessionId = "game-1",
  at = now,
) {
  return {
    repository,
    gameSessionId,
    storylineEventId: "event-1",
    now: at,
    targetPlayerIds: ["player-1", "player-2", "player-1"],
    priority: "major" as const,
    reveal: {
      notificationType: "story_cutscene" as const,
      displayMode: "modal_on_next_login" as const,
      headline: "Fixture headline",
      summary: "Fixture summary",
      videoAssetKey: "video-1",
      posterAssetKey: null,
      requiresAcknowledgement: true,
      payload: { viewRoute: "intel" },
    },
  };
}

async function publish(
  repository: StoryNotificationPublisher,
  game = "game-1",
  at = now,
) {
  try {
    return await createStoryCutsceneNotificationForPlayers(
      input(repository, game, at),
    );
  } catch (error) {
    const failure = error as {
      code: string;
      tableName: string;
      operation: string;
    };
    return {
      code: failure.code,
      tableName: failure.tableName,
      operation: failure.operation,
    };
  }
}

function receipt(insertedDeliveryCount: number, existingDeliveryCount: number) {
  return {
    notificationId: "notifications-1",
    deliveryCount: insertedDeliveryCount + existingDeliveryCount,
    insertedDeliveryCount,
    existingDeliveryCount,
  };
}

// Synthetic query fixture, not database isolation/concurrency evidence.
class FixtureClient {
  readonly rows: Record<string, Row[]> = {
    notifications: [],
    notification_deliveries: [],
  };
  readonly trace: unknown[] = [];
  constructor(private failure: string | null = null) {}
  from(table: string) {
    let inserted: Row | undefined;
    let columns = "";
    const filters: Row = {};
    const query = {
      insert: (row: Row) => {
        inserted = row;
        return query;
      },
      select: (value: string) => {
        columns = value;
        return query;
      },
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return query;
      },
      maybeSingle: async () => {
        this.trace.push({ table, inserted, columns, filters });
        const rows = this.rows[table];
        if (!inserted) {
          return {
            data: rows.find((row) =>
              Object.entries(filters).every(([key, value]) =>
                row[key] === value
              )
            ) ?? null,
            error: null,
          };
        }
        if (
          (table === "notifications" && this.failure === "notification") ||
          (table === "notification_deliveries" &&
            this.failure === inserted.player_id)
        ) {
          this.failure = null;
          return {
            data: null,
            error: {
              code: "fixture_failure",
              message: "Synthetic write failure",
            },
          };
        }
        const keys = table === "notifications"
          ? ["game_session_id", "source_type", "source_id", "notification_type"]
          : ["notification_id", "player_id"];
        if (
          rows.some((row) => keys.every((key) => row[key] === inserted![key]))
        ) {
          return {
            data: null,
            error: { code: "23505", message: "Synthetic conflict" },
          };
        }
        const row = { ...inserted, id: `${table}-${rows.length + 1}` };
        rows.push(row);
        return { data: row, error: null };
      },
    };
    return query;
  }
}

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}
