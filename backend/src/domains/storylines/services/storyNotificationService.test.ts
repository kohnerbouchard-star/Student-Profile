import type {
  CreateNotificationDeliveriesInput,
  CreateNotificationDeliveriesResult,
  CreateStoryNotificationInput,
  CreateStoryNotificationResult,
  MarkNotificationDeliveryInput,
  StoryNotificationDeliveryRecord,
  StoryNotificationDeliveryWithNotification,
  StoryNotificationRecord,
  StoryNotificationRepository,
} from "../contracts/storyNotificationContracts.ts";
import { createStoryCutsceneNotificationForPlayers } from "./storyNotificationService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story notification service creates cutscene notification and per-player deliveries", async () => {
  const repository = new FakeStoryNotificationRepository();

  const result = await createStoryCutsceneNotificationForPlayers({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    targetPlayerIds: ["player-1", "player-2"],
    priority: "major",
    now: "2026-06-25T12:00:00.000Z",
    reveal: {
      notificationType: "story_cutscene",
      displayMode: "modal_on_next_login",
      videoAssetKey: "cutscene-1",
      posterAssetKey: "poster-1",
      headline: "Northreach closes northern migration corridors",
      summary: "Border restrictions escalate after security concerns.",
      requiresAcknowledgement: true,
      payload: {
        viewRoute: "intel",
      },
    },
    repository,
  });

  assertEquals(result, {
    notificationId: "notification-1",
    deliveryCount: 2,
    insertedDeliveryCount: 2,
    existingDeliveryCount: 0,
  });
  assertEquals(repository.createdNotifications[0], {
    gameSessionId: "game-1",
    sourceType: "storyline_event",
    sourceId: "event-1",
    notificationType: "story_cutscene",
    title: "Northreach closes northern migration corridors",
    summary: "Border restrictions escalate after security concerns.",
    priority: "major",
    displayMode: "modal_on_next_login",
    payload: {
      viewRoute: "intel",
      storylineEventId: "event-1",
      videoAssetKey: "cutscene-1",
      posterAssetKey: "poster-1",
      requiresAcknowledgement: true,
    },
    publishedAt: "2026-06-25T12:00:00.000Z",
  });
  assertEquals(repository.createdDeliveries[0]?.playerIds, [
    "player-1",
    "player-2",
  ]);
});

class FakeStoryNotificationRepository implements StoryNotificationRepository {
  readonly createdNotifications: CreateStoryNotificationInput[] = [];
  readonly createdDeliveries: CreateNotificationDeliveriesInput[] = [];

  createStoryNotification(
    input: CreateStoryNotificationInput,
  ): Promise<CreateStoryNotificationResult> {
    this.createdNotifications.push(input);

    return Promise.resolve({
      status: "inserted",
      notification: {
        id: "notification-1",
        gameSessionId: input.gameSessionId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        notificationType: input.notificationType,
        title: input.title,
        summary: input.summary,
        priority: input.priority,
        displayMode: input.displayMode,
        payload: input.payload,
        publishedAt: input.publishedAt,
      },
    });
  }

  createNotificationDeliveries(
    input: CreateNotificationDeliveriesInput,
  ): Promise<CreateNotificationDeliveriesResult> {
    this.createdDeliveries.push(input);

    return Promise.resolve({
      deliveryIds: ["delivery-1", "delivery-2"],
      insertedCount: 2,
      existingCount: 0,
    });
  }

  listUnseenStoryCutsceneDeliveries(): Promise<
    readonly StoryNotificationDeliveryWithNotification[]
  > {
    return Promise.resolve([]);
  }

  markNotificationDeliverySeen(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input.deliveryId));
  }

  markNotificationDeliveryDismissed(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input.deliveryId));
  }

  markNotificationDeliveryAcknowledged(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input.deliveryId));
  }
}

function deliveryRecord(id: string): StoryNotificationDeliveryRecord {
  return {
    id,
    notificationId: "notification-1",
    gameSessionId: "game-1",
    playerId: "player-1",
    deliveredAt: "2026-06-25T12:00:00.000Z",
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
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
