import type {
  CreateNotificationDeliveriesInput,
  CreateNotificationDeliveriesResult,
  CreateStoryNotificationInput,
  CreateStoryNotificationResult,
  MarkNotificationDeliveryInput,
  StoryNotificationDeliveryRecord,
  StoryNotificationDeliveryWithNotification,
  StoryNotificationRecord,
} from "../contracts/storyNotificationContracts.ts";

export class InMemoryNotificationStore {
  protected readonly notifications: StoryNotificationRecord[] = [];
  protected readonly deliveries: StoryNotificationDeliveryRecord[] = [];

  createStoryNotification(
    input: CreateStoryNotificationInput,
  ): Promise<CreateStoryNotificationResult> {
    const existing = this.notifications.find((notification) =>
      notification.gameSessionId === input.gameSessionId &&
      notification.sourceType === input.sourceType &&
      notification.sourceId === input.sourceId &&
      notification.notificationType === input.notificationType
    );

    if (existing) {
      return Promise.resolve({
        status: "existing",
        notification: existing,
      });
    }

    const notification: StoryNotificationRecord = {
      id: `notification-${this.notifications.length + 1}`,
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
    };
    this.notifications.push(notification);

    return Promise.resolve({
      status: "inserted",
      notification,
    });
  }

  createNotificationDeliveries(
    input: CreateNotificationDeliveriesInput,
  ): Promise<CreateNotificationDeliveriesResult> {
    const deliveryIds: string[] = [];
    let insertedCount = 0;
    let existingCount = 0;

    for (const playerId of [...new Set(input.playerIds)]) {
      const existing = this.deliveries.find((delivery) =>
        delivery.notificationId === input.notificationId &&
        delivery.playerId === playerId
      );

      if (existing) {
        deliveryIds.push(existing.id);
        existingCount += 1;
        continue;
      }

      const delivery: StoryNotificationDeliveryRecord = {
        id: `delivery-${this.deliveries.length + 1}`,
        notificationId: input.notificationId,
        gameSessionId: input.gameSessionId,
        playerId,
        deliveredAt: input.deliveredAt,
        seenAt: null,
        dismissedAt: null,
        acknowledgedAt: null,
      };
      this.deliveries.push(delivery);
      deliveryIds.push(delivery.id);
      insertedCount += 1;
    }

    return Promise.resolve({
      deliveryIds,
      insertedCount,
      existingCount,
    });
  }

  listUnseenStoryCutsceneDeliveries(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<readonly StoryNotificationDeliveryWithNotification[]> {
    return Promise.resolve(
      this.deliveries
        .filter((delivery) =>
          delivery.gameSessionId === input.gameSessionId &&
          delivery.playerId === input.playerId &&
          delivery.seenAt === null &&
          delivery.dismissedAt === null
        )
        .flatMap((delivery) => {
          const notification = this.notifications.find((item) =>
            item.id === delivery.notificationId
          );

          return notification ? [{ ...delivery, notification }] : [];
        }),
    );
  }

  markNotificationDeliverySeen(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(this.markDelivery(input, "seenAt"));
  }

  markNotificationDeliveryDismissed(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(this.markDelivery(input, "dismissedAt"));
  }

  markNotificationDeliveryAcknowledged(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(this.markDelivery(input, "acknowledgedAt"));
  }

  private markDelivery(
    input: MarkNotificationDeliveryInput,
    field: "seenAt" | "dismissedAt" | "acknowledgedAt",
  ): StoryNotificationDeliveryRecord {
    const index = this.deliveries.findIndex((delivery) =>
      delivery.id === input.deliveryId &&
      delivery.gameSessionId === input.gameSessionId &&
      delivery.playerId === input.playerId
    );

    if (index < 0) {
      throw new Error("Notification delivery not found.");
    }

    const updated = {
      ...this.deliveries[index],
      [field]: input.markedAt,
    };
    this.deliveries.splice(index, 1, updated);

    return updated;
  }

}
