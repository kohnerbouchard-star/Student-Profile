import {
  createStoryNotificationDeliveryState,
  createStoryNotificationPublisher,
  StoryNotificationRepositoryError,
} from "./notificationCapabilities.ts";
import { StoryNotificationRepositoryError as CanonicalError } from "../contracts/storyNotificationContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

Deno.test("Story capabilities are lazy and expose only explicit runtime methods", () => {
  const client = {
    from: () => {
      throw new Error("unexpected eager query");
    },
  };
  const publisher = createStoryNotificationPublisher(client as never);
  const delivery = createStoryNotificationDeliveryState(client as never);
  equal(Object.keys(publisher), [
    "createStoryNotification",
    "createNotificationDeliveries",
  ]);
  equal(Object.keys(delivery), [
    "markNotificationDeliverySeen",
    "markNotificationDeliveryDismissed",
    "markNotificationDeliveryAcknowledged",
  ]);
  equal(Object.getPrototypeOf(publisher), Object.prototype);
  equal(Object.getPrototypeOf(delivery), Object.prototype);
  if (StoryNotificationRepositoryError !== CanonicalError) {
    throw new Error("error identity changed");
  }
});

Deno.test("Story delivery closures retain scoped query order, values and canonical errors", async () => {
  for (
    const [method, field, operation] of [
      ["markNotificationDeliverySeen", "seen_at", "seen"],
      ["markNotificationDeliveryDismissed", "dismissed_at", "dismissed"],
      [
        "markNotificationDeliveryAcknowledged",
        "acknowledged_at",
        "acknowledged",
      ],
    ] as const
  ) {
    const trace: unknown[] = [];
    const query = {
      eq: (key: string, value: unknown) => {
        trace.push(["eq", key, value]);
        return query;
      },
      select: (columns: string) => {
        trace.push(["select", columns]);
        return query;
      },
      maybeSingle: () =>
        Promise.resolve({ data: null, error: { message: "fixture failure" } }),
    };
    const client = {
      from: (table: string) => {
        trace.push(["from", table]);
        return {
          update: (values: unknown) => {
            trace.push(["update", values]);
            return query;
          },
        };
      },
    };
    const capability = createStoryNotificationDeliveryState(client as never);
    const action = capability[method]; // Detached invocation must retain its private adapter.
    try {
      await action({
        deliveryId: "delivery",
        gameSessionId: "game",
        playerId: "player",
        markedAt: "now",
      });
      throw new Error("expected repository failure");
    } catch (error) {
      if (!(error instanceof CanonicalError)) throw error;
      equal([error.code, error.tableName, error.operation], [
        "story_notification_repository_query_failed",
        "notification_deliveries",
        operation,
      ]);
    }
    equal(trace.slice(0, 5), [
      ["from", "notification_deliveries"],
      ["update", { [field]: "now" }],
      ["eq", "id", "delivery"],
      ["eq", "game_session_id", "game"],
      ["eq", "player_id", "player"],
    ]);
    equal((trace[5] as string[])[0], "select");
  }
});

Deno.test("Story publisher preserves thrown error identity through its closure", async () => {
  const sentinel = new CanonicalError(
    "fixture",
    "unchanged",
    "notifications",
    "insert",
  );
  const publisher = createStoryNotificationPublisher({
    from: () => {
      throw sentinel;
    },
  } as never);
  const create = publisher.createStoryNotification;
  try {
    await create({
      gameSessionId: "game",
      sourceType: "story_event",
      sourceId: "event",
      notificationType: "story_cutscene",
      title: "title",
      summary: "summary",
      priority: "major",
      displayMode: "notification_only",
      payload: {},
      publishedAt: "now",
    });
    throw new Error("expected sentinel");
  } catch (error) {
    if (error !== sentinel) throw error;
  }
});
